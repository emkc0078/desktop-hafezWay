const SESSION_EXPIRED_KEY = 'admin_session_expired';

let logoutHandler: (() => void) | null = null;
let loggingOut = false;

export class AdminSessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'AdminSessionExpiredError';
  }
}

export function isAdminSessionExpiredError(error: unknown): boolean {
  return error instanceof AdminSessionExpiredError;
}

export function registerAdminLogoutHandler(handler: () => void): () => void {
  logoutHandler = handler;
  return () => {
    if (logoutHandler === handler) logoutHandler = null;
  };
}

/** Clears admin session and marks login form to show an expiry notice. */
export function notifyAdminUnauthorized(): void {
  if (loggingOut) return;
  loggingOut = true;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    }
    logoutHandler?.();
  } finally {
    window.setTimeout(() => {
      loggingOut = false;
    }, 200);
  }
}

export function consumeAdminSessionExpiredNotice(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  if (!sessionStorage.getItem(SESSION_EXPIRED_KEY)) return false;
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  return true;
}

export function shouldLogoutAdminSession(status: number, message?: string): boolean {
  if (status === 401) return true;
  const m = (message ?? '').toLowerCase();
  return (
    m.includes('invalid token') ||
    m.includes('token is revoked') ||
    m.includes('authorization token missing') ||
    (m.includes('token') && m.includes('expired'))
  );
}

export function reportAdminApiError(
  error: unknown,
  showError: (message: string) => void,
  t: (key: string, params?: Record<string, string>) => string,
): void {
  if (isAdminSessionExpiredError(error)) return;
  showError(t('dashboard.genericError', { message: (error as Error).message }));
}
