import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { useT } from '@/context/LocaleContext';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      {children}
    </div>
  );
}

export function Btn({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const v =
    variant === 'primary'
      ? 'bg-brand-primary text-white hover:bg-brand-primaryDark'
      : variant === 'secondary'
        ? 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500'
        : variant === 'success'
          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
          : variant === 'warning'
            ? 'bg-amber-500 text-gray-900 hover:bg-amber-600'
            : variant === 'danger'
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-sky-600 text-white hover:bg-sky-700';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${v} disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function MessageBanner({
  text,
  type,
  onDismiss,
}: {
  text: string;
  type: 'success' | 'error' | 'info';
  onDismiss?: () => void;
}) {
  const t = useT();
  const bg =
    type === 'success'
      ? 'bg-emerald-600'
      : type === 'error'
        ? 'bg-red-600'
        : 'bg-sky-600';
  if (!text) return null;
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${bg}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span>{text}</span>
        {onDismiss && (
          <button type="button" className="shrink-0 underline" onClick={onDismiss}>
            {t('common.dismiss')}
          </button>
        )}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  maxWidthClass,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  /** Overrides default max-width when set (e.g. max-w-5xl). */
  maxWidthClass?: string;
}) {
  if (!open) return null;
  const widthClass = maxWidthClass ?? (wide ? 'max-w-3xl' : 'max-w-lg');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800 ${widthClass}`}
      >
        <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-600">
          <h3 className="text-lg font-semibold text-text-primary dark:text-gray-100">{title}</h3>
          <button
            type="button"
            className="text-2xl leading-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-text-secondary dark:text-gray-200">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Input({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-primary dark:focus:ring-brand-primary/40 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-brand-primary dark:focus:ring-brand-primary/40 ${className}`}
      {...props}
    />
  );
}

export function TextArea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-primary dark:focus:ring-brand-primary/40 ${className}`}
      {...props}
    />
  );
}

/** Shared table header cell classes (logical start alignment for LTR/RTL). */
export const tableHeadClass =
  'px-3 py-2 text-start text-xs font-semibold uppercase tracking-normal text-text-muted dark:text-gray-400';

/** Shared table body cell classes. */
export const tableCellClass = 'min-w-0 px-3 py-2 text-start align-top';

export function TableShell({
  children,
  className = '',
  colWidths,
  minWidth,
}: HTMLAttributes<HTMLDivElement> & { colWidths?: string[]; minWidth?: number | string }) {
  return (
    <div
      className={`overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600 ${className}`}
    >
      <table
        className="admin-data-table w-full border-collapse text-sm"
        style={minWidth != null ? { minWidth } : undefined}
      >
        {colWidths?.length ? (
          <colgroup>
            {colWidths.map((width, i) => (
              <col key={i} style={{ width }} />
            ))}
          </colgroup>
        ) : null}
        {children}
      </table>
    </div>
  );
}
