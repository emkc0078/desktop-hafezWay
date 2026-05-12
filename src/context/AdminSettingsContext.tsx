import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_SERVER = 'api_server';
const STORAGE_LIVE_APP = 'live_app_base_url';
const STORAGE_TOKEN = 'admin_token';
const STORAGE_ADMIN_NAME = 'admin_display_name';
const STORAGE_THEME = 'theme';

const DEFAULT_SERVER = 'http://localhost:3000';
const REMOTE_SERVER = 'http://194.135.91.75:3000';
/** Web app that serves `/livekit/:roomId` (often different port from API, e.g. 8081 vs 3000). */
const DEFAULT_LIVE_APP = 'http://localhost:8081';

export type AdminSettings = {
  serverUrl: string;
  /** Base URL for opening rooms in the browser (LiveKit UI), e.g. http://localhost:8081 */
  liveAppUrl: string;
  /** Same as logs-viewer: `serverUrl + '/api'` */
  logsApiBase: string;
  adminToken: string;
  /** Display name from last successful admin login */
  adminName: string;
  darkMode: boolean;
  setServerUrl: (url: string) => void;
  setLiveAppUrl: (url: string) => void;
  /** Persist token only (e.g. restore) — does not set display name */
  setAdminToken: (token: string) => void;
  /** After POST /auth/login — stores token + optional display name */
  setAdminSession: (accessToken: string, displayName: string) => void;
  setDarkMode: (dark: boolean) => void;
  clearToken: () => void;
};

const AdminSettingsContext = createContext<AdminSettings | null>(null);

export function AdminSettingsProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setServerUrlState] = useState(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_SERVER;
    return localStorage.getItem(STORAGE_SERVER) || DEFAULT_SERVER;
  });
  const [liveAppUrl, setLiveAppUrlState] = useState(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_LIVE_APP;
    return localStorage.getItem(STORAGE_LIVE_APP) || DEFAULT_LIVE_APP;
  });
  const [adminToken, setAdminTokenState] = useState(() => {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(STORAGE_TOKEN) || '';
  });
  const [adminName, setAdminNameState] = useState(() => {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(STORAGE_ADMIN_NAME) || '';
  });
  const [darkMode, setDarkModeState] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_THEME) === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem(STORAGE_THEME, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const setServerUrl = useCallback((url: string) => {
    setServerUrlState(url);
    localStorage.setItem(STORAGE_SERVER, url);
  }, []);

  const setLiveAppUrl = useCallback((url: string) => {
    setLiveAppUrlState(url);
    localStorage.setItem(STORAGE_LIVE_APP, url);
  }, []);

  const setAdminToken = useCallback((token: string) => {
    setAdminTokenState(token);
    if (token) localStorage.setItem(STORAGE_TOKEN, token);
    else {
      localStorage.removeItem(STORAGE_TOKEN);
      setAdminNameState('');
      localStorage.removeItem(STORAGE_ADMIN_NAME);
    }
  }, []);

  const setAdminSession = useCallback((accessToken: string, displayName: string) => {
    setAdminTokenState(accessToken);
    localStorage.setItem(STORAGE_TOKEN, accessToken);
    setAdminNameState(displayName);
    localStorage.setItem(STORAGE_ADMIN_NAME, displayName);
  }, []);

  const setDarkMode = useCallback((dark: boolean) => {
    setDarkModeState(dark);
  }, []);

  const clearToken = useCallback(() => {
    setAdminTokenState('');
    setAdminNameState('');
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_ADMIN_NAME);
  }, []);

  const logsApiBase = useMemo(() => `${serverUrl.replace(/\/$/, '')}/api`, [serverUrl]);

  const value = useMemo(
    () => ({
      serverUrl,
      liveAppUrl,
      logsApiBase,
      adminToken,
      adminName,
      darkMode,
      setServerUrl,
      setLiveAppUrl,
      setAdminToken,
      setAdminSession,
      setDarkMode,
      clearToken,
    }),
    [
      serverUrl,
      liveAppUrl,
      logsApiBase,
      adminToken,
      adminName,
      darkMode,
      setServerUrl,
      setLiveAppUrl,
      setAdminToken,
      setAdminSession,
      setDarkMode,
      clearToken,
    ],
  );

  return (
    <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>
  );
}

export function useAdminSettings(): AdminSettings {
  const ctx = useContext(AdminSettingsContext);
  if (!ctx) throw new Error('useAdminSettings must be used within AdminSettingsProvider');
  return ctx;
}

export { DEFAULT_SERVER, DEFAULT_LIVE_APP, REMOTE_SERVER, STORAGE_TOKEN };
