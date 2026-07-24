import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getUserIdFromAccessToken } from '@/utils/jwtUserId';
import { registerAdminLogoutHandler } from '@/utils/adminSession';

const STORAGE_SERVER = 'api_server';
const STORAGE_LIVE_APP = 'live_app_base_url';
const STORAGE_TOKEN = 'admin_token';
const STORAGE_ADMIN_NAME = 'admin_display_name';
const STORAGE_ADMIN_USER_ID = 'admin_user_id';
const STORAGE_THEME = 'theme';
const STORAGE_REMEMBER_ME = 'admin_remember_me';
const STORAGE_REMEMBERED_EMAIL = 'admin_remembered_email';

const DEFAULT_SERVER = 'http://localhost:3000';
const REMOTE_SERVER = 'http://194.135.91.75:3000';
/** Web app that serves `/livekit/:roomId` (often different port from API, e.g. 8081 vs 3000). */
const DEFAULT_LIVE_APP = 'http://localhost:8081';

function readPersisted(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
}

function writeSessionFields(
  persist: boolean,
  fields: { token: string; name: string; userId: string },
): void {
  const primary = persist ? localStorage : sessionStorage;
  const secondary = persist ? sessionStorage : localStorage;
  primary.setItem(STORAGE_TOKEN, fields.token);
  primary.setItem(STORAGE_ADMIN_NAME, fields.name);
  if (fields.userId) primary.setItem(STORAGE_ADMIN_USER_ID, fields.userId);
  else primary.removeItem(STORAGE_ADMIN_USER_ID);
  secondary.removeItem(STORAGE_TOKEN);
  secondary.removeItem(STORAGE_ADMIN_NAME);
  secondary.removeItem(STORAGE_ADMIN_USER_ID);
}

function clearSessionFields(): void {
  for (const store of [localStorage, sessionStorage]) {
    store.removeItem(STORAGE_TOKEN);
    store.removeItem(STORAGE_ADMIN_NAME);
    store.removeItem(STORAGE_ADMIN_USER_ID);
  }
}

export type AdminSettings = {
  serverUrl: string;
  /** Base URL for opening rooms in the browser (LiveKit UI), e.g. http://localhost:8081 */
  liveAppUrl: string;
  /** Same as logs-viewer: `serverUrl + '/api'` */
  logsApiBase: string;
  adminToken: string;
  /** Display name from last successful admin login */
  adminName: string;
  /** Mongo user id of the logged-in admin (from JWT). */
  adminUserId: string;
  darkMode: boolean;
  setServerUrl: (url: string) => void;
  setLiveAppUrl: (url: string) => void;
  /** Persist token only (e.g. restore) — does not set display name */
  setAdminToken: (token: string) => void;
  /** After POST /auth/login — stores token + optional display name */
  setAdminSession: (
    accessToken: string,
    displayName: string,
    options?: { rememberMe?: boolean },
  ) => void;
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
  const [adminToken, setAdminTokenState] = useState(() => readPersisted(STORAGE_TOKEN));
  const [adminName, setAdminNameState] = useState(() => readPersisted(STORAGE_ADMIN_NAME));
  const [adminUserId, setAdminUserIdState] = useState(() => {
    const stored = readPersisted(STORAGE_ADMIN_USER_ID);
    if (stored) return stored;
    const token = readPersisted(STORAGE_TOKEN);
    return token ? getUserIdFromAccessToken(token) ?? '' : '';
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
    if (token) {
      const remember =
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(STORAGE_REMEMBER_ME) === '1';
      const userId = getUserIdFromAccessToken(token) ?? '';
      const name =
        (remember ? localStorage : sessionStorage).getItem(STORAGE_ADMIN_NAME) ||
        readPersisted(STORAGE_ADMIN_NAME);
      writeSessionFields(remember, { token, name, userId });
      setAdminUserIdState(userId);
    } else {
      clearSessionFields();
      setAdminNameState('');
      setAdminUserIdState('');
    }
  }, []);

  const setAdminSession = useCallback(
    (accessToken: string, displayName: string, options?: { rememberMe?: boolean }) => {
      const rememberMe = options?.rememberMe !== false;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_REMEMBER_ME, rememberMe ? '1' : '0');
      }
      const userId = getUserIdFromAccessToken(accessToken) ?? '';
      setAdminTokenState(accessToken);
      setAdminNameState(displayName);
      setAdminUserIdState(userId);
      writeSessionFields(rememberMe, {
        token: accessToken,
        name: displayName,
        userId,
      });
    },
    [],
  );

  const setDarkMode = useCallback((dark: boolean) => {
    setDarkModeState(dark);
  }, []);

  const clearToken = useCallback(() => {
    setAdminTokenState('');
    setAdminNameState('');
    setAdminUserIdState('');
    clearSessionFields();
  }, []);

  useEffect(() => registerAdminLogoutHandler(clearToken), [clearToken]);

  const logsApiBase = useMemo(() => `${serverUrl.replace(/\/$/, '')}/api`, [serverUrl]);

  const value = useMemo(
    () => ({
      serverUrl,
      liveAppUrl,
      logsApiBase,
      adminToken,
      adminName,
      adminUserId,
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
      adminUserId,
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

export {
  DEFAULT_SERVER,
  DEFAULT_LIVE_APP,
  REMOTE_SERVER,
  STORAGE_TOKEN,
  STORAGE_REMEMBER_ME,
  STORAGE_REMEMBERED_EMAIL,
};
