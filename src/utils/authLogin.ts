/** Mirrors back-hafezway POST /auth/login + admin verification. */

export type LoginSuccess = {
  accessToken: string;
  refreshToken: string;
  name: string;
  sessionId?: string;
};

export async function loginWithPassword(
  serverUrl: string,
  email: string,
  password: string,
): Promise<LoginSuccess> {
  const base = serverUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const json = (await res.json()) as { message?: string; data?: LoginSuccess };
  if (!res.ok) {
    throw new Error(json.message || `Login failed (${res.status})`);
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
  const res = await fetch(`${base}/logs/stats`, {
    headers: {
      Authorization: `admin ${accessToken}`,
    },
  });
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
