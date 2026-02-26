const TOKEN_CACHE_MAX = 500;
const REPO_CACHE_MAX = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const tokenCache = new Map<string, { username: string; expiresAt: number }>();
const repoAccessCache = new Map<
  string,
  { allowed: boolean; expiresAt: number }
>();

const GITHUB_SLUG_RE = /^[a-zA-Z0-9._-]+$/;

async function hashKey(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function boundedSet<V>(
  map: Map<string, V>,
  key: string,
  value: V,
  max: number,
): void {
  if (map.size >= max) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

export async function validateGitHubToken(
  authHeader: string | null,
): Promise<{ username: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token) return null;

  const key = await hashKey(token);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { username: cached.username };
  }

  let res: Response;
  try {
    res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "sherpa-worker",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as { login: string };
  boundedSet(
    tokenCache,
    key,
    {
      username: data.login,
      expiresAt: Date.now() + CACHE_TTL_MS,
    },
    TOKEN_CACHE_MAX,
  );
  return { username: data.login };
}

export function validateSlug(value: string): boolean {
  return GITHUB_SLUG_RE.test(value);
}

export async function validateRepoAccess(
  authHeader: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  const key = await hashKey(`${authHeader}:${owner}/${repo}`);
  const cached = repoAccessCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.allowed;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: authHeader,
      "User-Agent": "sherpa-worker",
    },
  });
  const allowed = res.ok;
  boundedSet(
    repoAccessCache,
    key,
    {
      allowed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    },
    REPO_CACHE_MAX,
  );
  return allowed;
}
