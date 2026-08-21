import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/context/LocaleContext';

export type DashboardNavItem = {
  id: string;
  label: string;
  badge?: number;
  badgeTone?: 'amber' | 'red';
};

/** Parent that either selects its own tab and/or groups children. */
export type DashboardNavGroup = {
  id: string;
  label: string;
  /** When set, clicking the parent label switches to this tab. */
  tabId?: string;
  badge?: number;
  badgeTone?: 'amber' | 'red';
  children: readonly DashboardNavItem[];
};

export type DashboardNavEntry =
  | ({ kind: 'item' } & DashboardNavItem)
  | ({ kind: 'group' } & DashboardNavGroup);

type Props = {
  entries: readonly DashboardNavEntry[];
  activeId: string;
  onSelect: (id: string) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function itemButtonClass(active: boolean) {
  return `flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition ${
    active
      ? 'bg-brand-primary text-white'
      : 'text-text-secondary hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
  }`;
}

function Badge({
  count,
  tone,
  active,
}: {
  count: number;
  tone?: 'amber' | 'red';
  active: boolean;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`min-w-5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold ${
        active
          ? 'bg-white text-brand-primary'
          : tone === 'red'
            ? 'bg-red-600 text-white'
            : 'bg-amber-500 text-white'
      }`}
    >
      {count}
    </span>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 transition-transform ${
        expanded ? 'rotate-90' : 'rtl:rotate-180'
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function findActiveLabel(entries: readonly DashboardNavEntry[], activeId: string): string {
  for (const entry of entries) {
    if (entry.kind === 'item' && entry.id === activeId) return entry.label;
    if (entry.kind === 'group') {
      if (entry.tabId === activeId) return entry.label;
      const child = entry.children.find((c) => c.id === activeId);
      if (child) return child.label;
    }
  }
  return '';
}

function groupContainsActive(group: DashboardNavGroup, activeId: string): boolean {
  if (group.tabId === activeId) return true;
  return group.children.some((c) => c.id === activeId);
}

function NavTree({
  entries,
  activeId,
  onSelect,
  onAfterSelect,
  expandedIds,
  onToggleGroup,
}: {
  entries: readonly DashboardNavEntry[];
  activeId: string;
  onSelect: (id: string) => void;
  onAfterSelect?: () => void;
  expandedIds: ReadonlySet<string>;
  onToggleGroup: (groupId: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-1 p-3">
      {entries.map((entry) => {
        if (entry.kind === 'item') {
          const active = activeId === entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(entry.id);
                  onAfterSelect?.();
                }}
                className={itemButtonClass(active)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <Badge count={entry.badge ?? 0} tone={entry.badgeTone} active={active} />
              </button>
            </li>
          );
        }

        const expanded = expandedIds.has(entry.id);
        const parentActive = entry.tabId != null && activeId === entry.tabId;
        const hasOwnTab = entry.tabId != null;

        return (
          <li key={entry.id}>
            <div className="flex items-stretch gap-0.5">
              <button
                type="button"
                onClick={() => {
                  if (hasOwnTab) {
                    onSelect(entry.tabId!);
                    onAfterSelect?.();
                    if (!expanded) onToggleGroup(entry.id);
                  } else {
                    onToggleGroup(entry.id);
                  }
                }}
                className={`${itemButtonClass(parentActive)} min-w-0 flex-1`}
                aria-current={parentActive ? 'page' : undefined}
                aria-expanded={expanded}
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <Badge count={entry.badge ?? 0} tone={entry.badgeTone} active={parentActive} />
              </button>
              <button
                type="button"
                className={`inline-flex w-9 shrink-0 items-center justify-center rounded-lg transition ${
                  parentActive
                    ? 'text-white/90 hover:bg-white/15'
                    : 'text-text-muted hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
                onClick={() => onToggleGroup(entry.id)}
                aria-label={entry.label}
                aria-expanded={expanded}
              >
                <Chevron expanded={expanded} />
              </button>
            </div>
            {expanded && entry.children.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 border-s border-gray-200 ms-3 ps-2 dark:border-gray-700">
                {entry.children.map((child) => {
                  const active = activeId === child.id;
                  return (
                    <li key={child.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(child.id);
                          onAfterSelect?.();
                        }}
                        className={itemButtonClass(active)}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                        <Badge count={child.badge ?? 0} tone={child.badgeTone} active={active} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardSideNav({
  entries,
  activeId,
  onSelect,
  mobileOpen,
  onMobileOpenChange,
}: Props) {
  const t = useT();
  const activeLabel = useMemo(() => findActiveLabel(entries, activeId), [entries, activeId]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of entries) {
      if (entry.kind === 'group' && groupContainsActive(entry, activeId)) {
        initial.add(entry.id);
      }
    }
    return initial;
  });

  useEffect(() => {
    setExpandedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const entry of entries) {
        if (entry.kind === 'group' && groupContainsActive(entry, activeId) && !next.has(entry.id)) {
          next.add(entry.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeId, entries]);

  const toggleGroup = (groupId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onMobileOpenChange]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) onMobileOpenChange(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [onMobileOpenChange]);

  const closeMobile = () => onMobileOpenChange(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900 lg:hidden">
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-text-secondary hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          onClick={() => onMobileOpenChange(true)}
          aria-label={t('dashboard.nav.openMenu')}
          aria-expanded={mobileOpen}
          aria-controls="dashboard-mobile-nav"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-text-muted dark:text-gray-400">
            {t('dashboard.nav.menu')}
          </div>
          <div className="truncate text-sm font-semibold text-text-primary dark:text-gray-100">
            {activeLabel}
          </div>
        </div>
      </div>

      {/* Desktop sidebar — sticky within the app scroll container; logical start side for RTL */}
      <aside
        className="sticky top-0 z-20 hidden max-h-[100dvh] w-56 shrink-0 overflow-y-auto border-e border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950 lg:block xl:w-60"
        aria-label={t('dashboard.nav.menu')}
      >
        <div className="sticky top-0 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-950">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-gray-400">
            {t('dashboard.nav.menu')}
          </h2>
        </div>
        <NavTree
          entries={entries}
          activeId={activeId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          onToggleGroup={toggleGroup}
        />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t('dashboard.nav.closeMenu')}
            onClick={closeMobile}
          />
          <aside
            id="dashboard-mobile-nav"
            className="absolute inset-y-0 start-0 flex w-[min(18rem,88vw)] flex-col bg-white shadow-xl dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.nav.menu')}
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-text-primary dark:text-gray-100">
                {t('dashboard.nav.menu')}
              </h2>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-2xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                onClick={closeMobile}
                aria-label={t('dashboard.nav.closeMenu')}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavTree
                entries={entries}
                activeId={activeId}
                onSelect={onSelect}
                onAfterSelect={closeMobile}
                expandedIds={expandedIds}
                onToggleGroup={toggleGroup}
              />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
