import { useCallback, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminSettings } from '@/context/AdminSettingsContext';
import { useLocale } from '@/context/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { Btn, Modal } from '@/components/ui';
import { useAppVersion } from '@/hooks/useAppVersion';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-4 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-primary text-white'
      : 'text-text-secondary hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
  }`;

export function AppShell() {
  const { t } = useLocale();
  const { darkMode, setDarkMode } = useAdminSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const appVersion = useAppVersion();
  const [logsGateOpen, setLogsGateOpen] = useState(false);

  const closeLogsGate = useCallback(() => setLogsGateOpen(false), []);

  const confirmNavigateToLogs = useCallback(() => {
    setLogsGateOpen(false);
    navigate('/logs');
  }, [navigate]);

  const onLogsNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (location.pathname !== '/logs') {
        e.preventDefault();
        setLogsGateOpen(true);
      }
    },
    [location.pathname],
  );

  return (
    <div className="flex min-h-full flex-col">
      <Modal open={logsGateOpen} onClose={closeLogsGate} title={t('nav.logsDevWarningTitle')} wide>
        <div className="space-y-4 text-sm">
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50"
            role="alert"
          >
            <p className="leading-relaxed text-amber-900 dark:text-amber-100/95">
              {t('nav.logsDevWarningBody')}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 rtl-flip-row">
            <Btn type="button" variant="secondary" onClick={closeLogsGate}>
              {t('common.cancel')}
            </Btn>
            <Btn type="button" variant="warning" onClick={confirmNavigateToLogs}>
              {t('nav.logsDevWarningContinue')}
            </Btn>
          </div>
        </div>
      </Modal>

      <AppUpdateBanner />

      <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 rtl-flip-row">
          <div className="flex min-w-0 items-center gap-3 rtl-flip-row">
            <img
              src={`${import.meta.env.BASE_URL}hafezway-logo.png`}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-contain sm:h-16 sm:w-16"
            />
            <div className="min-w-0">
              <div className="font-semibold text-brand-primary">{t('nav.brand')}</div>
              {appVersion ? (
                <div className="text-xs text-text-muted dark:text-gray-400">
                  {t('nav.version', { version: appVersion })}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rtl-flip-row">
            <nav className="flex gap-2">
              <NavLink to="/" end className={linkClass}>
                {t('nav.adminDashboard')}
              </NavLink>
              <NavLink to="/logs" onClick={onLogsNavClick} className={linkClass}>
                {t('nav.logsSystem')}
              </NavLink>
            </nav>
            <Btn variant="secondary" type="button" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? t('auth.lightMode') : t('auth.darkMode')}
            </Btn>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
