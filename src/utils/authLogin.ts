/** Mirrors back-hafezway POST /auth/login + admin verification. */

export type LoginSuccess = {
  accessToken: string;
  refreshToken: string;
  name: string;
  sessionId?: string;
};

export function isLocalhostApi(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

export function isUnreachableFetchError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /failed to fetch|cannot reach|load failed|networkerror|network request failed/i.test(
    msg,
  );
}

async function readJson(res: Response): Promise<{ message?: string; data?: LoginSuccess }> {
  try {
    return (await res.json()) as { message?: string; data?: LoginSuccess };
  } catch {
    return {};
  }
}

/**
 * POST /auth/login against the selected API host.
 * Throws a URL-specific error when nothing is listening (typical for Local API).
 */
export async function loginWithPassword(
  serverUrl: string,
  email: string,
  password: string,
): Promise<LoginSuccess> {
  const base = serverUrl.replace(/\/$/, '');
  const url = `${base}/auth/login`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch {
    throw new Error(
      isLocalhostApi(base)
        ? `Cannot reach ${url}. Local API is not running, so no request reached the live server.`
        : `Cannot reach ${url}. Check the Backend API host and that the server is up.`,
    );
  }
  const json = await readJson(res);
  if (!res.ok) {
    const corsBlocked = (json.message ?? '').toLowerCase().includes('cors');
    if (corsBlocked) {
      throw new Error(
        `The API blocked this app origin (CORS) at ${url}. CORS_ORIGINS must include http://localhost:5173.`,
      );
    }
    throw new Error(json.message || `Login failed (${res.status}) at ${url}`);
  }
  if (!json.data?.accessToken) {
    throw new Error('Invalid response: missing access token');
  }
  return json.data;
}

/** Confirms the token belongs to an admin (uses same check as logs admin routes). */
export async function verifyAdministratorAccess(
  logsApiBase: string,
  accessToken: string,
): Promise<void> {
  const base = logsApiBase.replace(/\/$/, '');
  const url = `${base}/logs/stats`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `admin ${accessToken}`,
      },
    });
  } catch {
    throw new Error(`Signed in, but cannot reach ${url} to verify admin access.`);
  }
  if (res.status === 403) {
    throw new Error('This account does not have administrator access.');
  }
  if (!res.ok) {
    let msg = `Verification failed (${res.status})`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}
