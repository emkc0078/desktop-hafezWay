/** Mirrors back-hafezway POST /api/auth/login + admin verification. */

export type LoginSuccess = {
  accessToken: string;
  refreshToken: string;
  name: string;
  sessionId?: string;
};

export type LoginLanguageOptions = {
  language?: 'en' | 'ar';
  languageTag?: string;
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

async function readJson(
  res: Response,
): Promise<{ message?: string; data?: LoginSuccess; success?: boolean }> {
  try {
    return (await res.json()) as {
      message?: string;
      data?: LoginSuccess;
      success?: boolean;
    };
  } catch {
    return {};
  }
}

/**
 * POST /api/auth/login against the selected API host.
 * Throws a URL-specific error when nothing is listening (typical for Local API).
 */
export async function loginWithPassword(
  serverUrl: string,
  email: string,
  password: string,
  languageOptions: LoginLanguageOptions = {},
): Promise<LoginSuccess> {
  const base = serverUrl.replace(/\/$/, '');
  const url = `${base}/api/auth/login`;
  const language = languageOptions.language === 'ar' ? 'ar' : 'en';
  const languageTag =
    languageOptions.languageTag || (language === 'ar' ? 'ar-SA' : 'en-US');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': languageTag,
        'X-User-Language': language,
        'X-User-Language-Tag': languageTag,
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        language,
        languageTag,
      }),
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
    const err = new Error(
      json.message || `Login failed (${res.status}) at ${url}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
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
