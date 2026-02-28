const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

export interface OAuthResult {
  token: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export interface RefreshResult {
  token: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export function getGitHubAuthUrl(workerUrl: string): string {
  // Encode both the redirect URL and a random nonce into the state param.
  // The worker validates the nonce via HMAC to prevent CSRF attacks.
  const extensionRedirect = chrome.identity.getRedirectURL();
  const nonce = crypto.randomUUID();
  const state = btoa(JSON.stringify({ redirect: extensionRedirect, nonce }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${workerUrl}/callback`,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function launchGitHubOAuth(
  workerUrl: string,
): Promise<OAuthResult> {
  const authUrl = getGitHubAuthUrl(workerUrl);
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!redirectUrl) throw new Error("OAuth flow was cancelled");

  const url = new URL(redirectUrl);
  // Token arrives as a query parameter from the worker's 302 redirect.
  // (Fragments are stripped by browsers during redirects.)
  const token = url.searchParams.get("token");
  if (!token) throw new Error("No token in OAuth redirect");

  const refreshToken = url.searchParams.get("refresh_token");
  const expiresInStr = url.searchParams.get("expires_in");
  const expiresAt = expiresInStr
    ? Date.now() + parseInt(expiresInStr, 10) * 1000
    : null;

  return { token, refreshToken, expiresAt };
}

export async function refreshGitHubToken(
  refreshToken: string,
  workerUrl: string,
  currentToken: string,
): Promise<RefreshResult> {
  const resp = await fetch(`${workerUrl}/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentToken}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!resp.ok) {
    throw new Error("Token refresh failed");
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    token: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  };
}
