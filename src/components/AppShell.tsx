import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-4 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-primary text-white'
      : 'text-text-secondary hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
  }`;

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <span className="font-semibold text-brand-primary">Hafez Way · Desktop admin</span>
          <nav className="flex gap-2">
            <NavLink to="/" end className={linkClass}>
              Admin dashboard
            </NavLink>
            <NavLink to="/logs" className={linkClass}>
              Logs & system
            </NavLink>
          </nav>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
