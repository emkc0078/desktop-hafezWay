import { useState } from 'react';
import {
  useAdminSettings,
  DEFAULT_SERVER,
  DEFAULT_LIVE_APP,
  REMOTE_SERVER,
} from '@/context/AdminSettingsContext';
import { loginWithPassword, verifyAdministratorAccess } from '@/utils/authLogin';
import { Btn, Field, Input } from '@/components/ui';

type Props = {
  /** Show a short hint under the form (e.g. logs page) */
  showTestHint?: boolean;
};

export function AdminAuthBar({ showTestHint }: Props) {
  const {
    serverUrl,
    setServerUrl,
    liveAppUrl,
    setLiveAppUrl,
    adminToken,
    adminName,
    setAdminSession,
    clearToken,
    logsApiBase,
    darkMode,
    setDarkMode,
  } = useAdminSettings();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter email and password.');
      return;
    }
    setBusy(true);
    try {
      const session = await loginWithPassword(serverUrl, email, password);
      await verifyAdministratorAccess(logsApiBase, session.accessToken);
      setAdminSession(session.accessToken, session.name || email.trim());
      setPassword('');
      if (showTestHint) {
        /* parent pages may show their own toast */
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onLogout = () => {
    clearToken();
    setError(null);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <select
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value={DEFAULT_SERVER}>Local API (localhost:3000)</option>
          <option value={REMOTE_SERVER}>Remote API (194.135.91.75:3000)</option>
        </select>
        <Field label="LiveKit web app (room links)" className="min-w-[min(100%,18rem)] flex-1">
          <Input
            value={liveAppUrl}
            onChange={(e) => setLiveAppUrl(e.target.value)}
            placeholder={DEFAULT_LIVE_APP}
            className="font-mono text-xs sm:text-sm"
            spellCheck={false}
          />
        </Field>
        <Btn variant="secondary" type="button" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? 'Light mode' : 'Dark mode'}
        </Btn>
      </div>

      {adminToken ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="text-sm">
            <span className="font-medium text-emerald-900 dark:text-emerald-100">Signed in</span>
            {adminName ? (
              <span className="text-emerald-800 dark:text-emerald-200"> · {adminName}</span>
            ) : null}
            <span className="block text-xs text-emerald-700/80 dark:text-emerald-300/80">
              API {serverUrl} · Rooms open at {liveAppUrl}
            </span>
          </div>
          <Btn variant="secondary" type="button" onClick={onLogout}>
            Log out
          </Btn>
        </div>
      ) : (
        <form
          onSubmit={(e) => void onLogin(e)}
          className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800/80"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                disabled={busy}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={busy}
              />
            </Field>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in as admin'}
            </Btn>
            <span className="text-xs text-text-muted">
              Uses POST /auth/login, then verifies administrator access.
            </span>
          </div>
          {showTestHint ? (
            <p className="text-xs text-text-muted">
              After sign-in, the logs tab will load automatically when you open System &amp; logs.
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
