import { useState } from 'react';
import {
  useAdminSettings,
  DEFAULT_SERVER,
  DEFAULT_LIVE_APP,
  REMOTE_SERVER,
} from '@/context/AdminSettingsContext';
import { useT } from '@/context/LocaleContext';
import { loginWithPassword, verifyAdministratorAccess } from '@/utils/authLogin';
import { Btn, Field, Input } from '@/components/ui';
type Props = {
  /** Show a short hint under the form (e.g. logs page) */
  showTestHint?: boolean;
};

export function AdminAuthBar({ showTestHint }: Props) {
  const t = useT();
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
  } = useAdminSettings();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(t('auth.enterEmailPassword'));
      return;
    }
    setBusy(true);
    try {
      const session = await loginWithPassword(serverUrl, email, password);
      await verifyAdministratorAccess(logsApiBase, session.accessToken);
      setAdminSession(session.accessToken, session.name || email.trim());
      setPassword('');
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

  const selectToolbarClass =
    'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-text-primary shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-brand-primary dark:focus:ring-brand-primary/25';

  const sessionInitial = adminName.trim()
    ? adminName.trim().charAt(0).toUpperCase()
    : '?';

  return (
    <div className="flex w-full flex-col gap-3">
      {adminToken ? (
        <div className="w-full">
          <div className="rounded-2xl border border-gray-200/95 bg-gray-50/95 p-4 shadow-sm dark:border-gray-600 dark:bg-gray-900/60 dark:shadow-inner">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch rtl-flip-row">
              <div className="flex w-full flex-col gap-1.5 lg:w-[min(100%,14rem)] lg:shrink-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {t('auth.toolbarApi')}
                </span>
                <select
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className={selectToolbarClass}
                >
                  <option value={DEFAULT_SERVER}>{t('auth.localApi')}</option>
                  <option value={REMOTE_SERVER}>{t('auth.remoteApi')}</option>
                </select>
              </div>

              <div
                className="hidden lg:block lg:w-px lg:shrink-0 lg:bg-gray-200 lg:opacity-90 dark:lg:bg-gray-600"
                aria-hidden
              />

              <div className="min-w-0 flex flex-1 flex-col gap-1.5 lg:min-w-[12rem]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {t('auth.toolbarRooms')}
                </span>
                <Input
                  value={liveAppUrl}
                  onChange={(e) => setLiveAppUrl(e.target.value)}
                  placeholder={DEFAULT_LIVE_APP}
                  className="h-10 font-mono text-xs shadow-sm dark:shadow-none sm:text-sm"
                  spellCheck={false}
                  title={liveAppUrl}
                />
              </div>

              <div
                className="hidden lg:block lg:w-px lg:shrink-0 lg:bg-gray-200 lg:opacity-90 dark:lg:bg-gray-600"
                aria-hidden
              />

              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-emerald-200/85 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:shadow-none lg:max-w-md lg:flex-initial">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-sm font-bold text-white shadow-md ring-2 ring-white/30 dark:ring-emerald-950/50"
                  aria-hidden
                >
                  {sessionInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary dark:text-gray-100">
                    {adminName || t('auth.administrator')}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700/85 dark:text-emerald-400/90">
                    {t('auth.sessionRoomBase')}
                  </p>
                  <p
                    className="truncate font-mono text-xs leading-snug text-text-secondary dark:text-gray-400"
                    title={liveAppUrl || undefined}
                  >
                    {liveAppUrl || '\u2014'}
                  </p>
                </div>
                <Btn variant="secondary" type="button" className="shrink-0" onClick={onLogout}>
                  {t('auth.logOut')}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200/95 bg-gray-50/95 shadow-sm dark:border-gray-600 dark:bg-gray-900/60 dark:shadow-inner">
          <div className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end rtl-flip-row">
              <div className="flex w-full flex-col gap-1.5 sm:w-[min(100%,14rem)] sm:shrink-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {t('auth.toolbarApi')}
                </span>
                <select
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className={selectToolbarClass}
                >
                  <option value={DEFAULT_SERVER}>{t('auth.localApi')}</option>
                  <option value={REMOTE_SERVER}>{t('auth.remoteApi')}</option>
                </select>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[12rem]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {t('auth.toolbarRooms')}
                </span>
                <Input
                  value={liveAppUrl}
                  onChange={(e) => setLiveAppUrl(e.target.value)}
                  placeholder={DEFAULT_LIVE_APP}
                  className="h-10 font-mono text-xs shadow-sm sm:text-sm"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => void onLogin(e)}
            className="flex flex-col gap-3 border-t border-gray-200/90 bg-white/90 p-4 dark:border-gray-600 dark:bg-gray-950/30"
          >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('auth.email')}>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                disabled={busy}
              />
            </Field>
            <Field label={t('auth.password')}>
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
          <div className="flex flex-wrap items-center gap-2 rtl-flip-row">
            <Btn variant="primary" type="submit" disabled={busy}>
              {busy ? t('auth.signingIn') : t('auth.signIn')}
            </Btn>
            <span className="text-xs text-text-muted">{t('auth.loginHint')}</span>
          </div>
          {showTestHint ? (
            <p className="text-xs text-text-muted">{t('auth.logsHint')}</p>
          ) : null}
        </form>
        </div>
      )}
    </div>
  );
}
