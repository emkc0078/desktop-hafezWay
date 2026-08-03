import { useEffect, useState } from 'react';

/** App version from Electron (packaged) or Vite-injected package.json version. */
export function useAppVersion(): string {
  const [version, setVersion] = useState(__APP_VERSION__);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.hafezwayAdmin : undefined;
    if (!bridge?.getAppVersion) return;
    void bridge.getAppVersion().then((v) => {
      if (v) setVersion(v);
    });
  }, []);

  return version;
}
