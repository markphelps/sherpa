import { validateGitHubToken, validateRepoAccess, validateSlug } from "./auth";
import { SherpaState } from "./sherpa-state";

export { SherpaState };

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": `chrome-extension://${env.EXTENSION_ID}`,
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Existing OAuth callback
    if (url.pathname === "/callback") {
      return handleOAuthCallback(url, env);
    }

    // Cache routes: /cache/:owner/:repo/:pr
    const cacheMatch = url.pathname.match(
      /^\/cache\/([^/]+)\/([^/]+)\/(\d+)(\/|$)/,
    );
    if (cacheMatch) {
      const [, owner, repo, prStr] = cacheMatch;
      const prNumber = parseInt(prStr, 10);
      const response = await handleCacheRequest(
        request,
        env,
        owner,
        repo,
        prNumber,
      );
      return withCors(response, env);
    }

    if (url.pathname === "/refresh" && request.method === "POST") {
      const response = await handleTokenRefresh(request, env);
      return withCors(response, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

function parseOAuthState(
  stateParam: string,
  fallbackExtensionId: string,
): { redirect: string; nonce: string } | null {
  const CHROMIUM_REDIRECT_RE = /^https:\/\/[a-z]{32}\.chromiumapp\.org\/?$/;

  // Try new JSON-encoded format: { redirect, nonce }
  try {
    const decoded = JSON.parse(atob(stateParam)) as {
      redirect?: string;
      nonce?: string;
    };
    if (
      decoded.redirect &&
      decoded.nonce &&
      CHROMIUM_REDIRECT_RE.test(decoded.redirect)
    ) {
      return { redirect: decoded.redirect, nonce: decoded.nonce };
    }
  } catch {
    // Not JSON — fall through to legacy check
  }

  // Legacy: state is a bare redirect URL (support existing clients during rollout)
  if (CHROMIUM_REDIRECT_RE.test(stateParam)) {
    return { redirect: stateParam, nonce: "" };
  }

  // Invalid state — use fallback
  return {
    redirect: `https://${fallbackExtensionId}.chromiumapp.org/`,
    nonce: "",
  };
}

async function handleOAuthCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing code parameter", { status: 400 });
  }

  // Decode and validate the state param (redirect URL + CSRF nonce)
  const stateParam = url.searchParams.get("state") || "";
  const state = parseOAuthState(stateParam, env.EXTENSION_ID);
  if (!state) {
    return new Response("Invalid state parameter", { status: 400 });
  }
  const extensionRedirect = state.redirect;

  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    return new Response(`OAuth error: ${tokenData.error}`, { status: 400 });
  }

  // Pass token as a query parameter so it survives the 302 redirect.
  // Fragments (#) are often stripped by browsers during redirects, which
  // causes launchWebAuthFlow to return a URL without the token.
  // The chromiumapp.org URL is only visible to the extension, not logged
  // by any external server.
  const params = new URLSearchParams({ token: tokenData.access_token });
  if (tokenData.refresh_token)
    params.set("refresh_token", tokenData.refresh_token);
  if (tokenData.expires_in)
    params.set("expires_in", String(tokenData.expires_in));

  const redirectUrl = `${extensionRedirect.replace(/\/$/, "")}/?${params}`;
  return Response.redirect(redirectUrl, 302);
}

async function handleTokenRefresh(
  request: Request,
  env: Env,
): Promise<Response> {
  // Require a valid GitHub token to prevent unauthenticated abuse
  const authHeader = request.headers.get("Authorization");
  const user = await validateGitHubToken(authHeader);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { refresh_token?: string };
  try {
    body = (await request.json()) as { refresh_token?: string };
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body.refresh_token) {
    return new Response("Missing refresh_token", { status: 400 });
  }

  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: body.refresh_token,
    }),
  });

  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    return new Response(
      JSON.stringify({ error: tokenData.error ?? "refresh_failed" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function handleCacheRequest(
  request: Request,
  env: Env,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<Response> {
  // Validate path segments
  if (!validateSlug(owner) || !validateSlug(repo)) {
    return new Response("Invalid owner or repo", { status: 400 });
  }

  // Validate GitHub token
  const authHeader = request.headers.get("Authorization");
  const user = await validateGitHubToken(authHeader);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Validate repo access
  // biome-ignore lint/style/noNonNullAssertion: authHeader is guaranteed non-null after the 401 guard above
  const hasAccess = await validateRepoAccess(authHeader!, owner, repo);
  if (!hasAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  // Route to Durable Object
  const doId = env.SHERPA_STATE.idFromName(`${owner}/${repo}/${prNumber}`);
  const stub = env.SHERPA_STATE.get(doId);

  // Forward with the cache key as a query param
  const cacheKey = new URL(request.url).searchParams.get("key");
  if (!cacheKey) {
    return new Response("Missing key query parameter", { status: 400 });
  }

  const doUrl = new URL("http://do/");
  doUrl.searchParams.set("key", cacheKey);

  try {
    return await stub.fetch(
      new Request(doUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method === "PUT" ? request.body : undefined,
      }),
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Cache service unavailable" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
