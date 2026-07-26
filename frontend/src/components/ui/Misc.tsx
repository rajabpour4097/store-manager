import type { ReactNode } from 'react'
import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Loader2, SearchX } from 'lucide-react'

import { toPersianDigits } from '@/utils/format'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
}

export function PageHeader({ title, description, actions, icon }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-gradient text-white shadow-card">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-900 dark:text-ink-50">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'brand' | 'success' | 'danger' | 'warning' | 'neutral' | 'purple'
  trend?: number | null
  loading?: boolean
  className?: string
}

const TONE_STYLES: Record<NonNullable<StatCardProps['tone']>, string> = {
  brand: 'from-brand-500/15 to-brand-500/0 text-brand-600 dark:text-brand-300',
  success: 'from-teal-500/15 to-teal-500/0 text-teal-600 dark:text-teal-300',
  danger: 'from-rose-500/15 to-rose-500/0 text-rose-600 dark:text-rose-300',
  warning: 'from-amber-500/20 to-amber-500/0 text-amber-600 dark:text-amber-300',
  neutral: 'from-ink-400/15 to-ink-400/0 text-ink-600 dark:text-ink-300',
  purple: 'from-purple-500/15 to-purple-500/0 text-purple-600 dark:text-purple-300',
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  trend,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <div className={clsx('card card-hover relative overflow-hidden p-4', className)}>
      <div
        className={clsx(
          'pointer-events-none absolute -left-6 -top-6 size-28 rounded-full bg-gradient-to-br blur-xl',
          TONE_STYLES[tone],
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</p>
          {loading ? (
            <div className="mt-2 h-7 w-24 rounded-lg bg-ink-200/70 dark:bg-ink-800" />
          ) : (
            <p className="mt-1.5 truncate text-lg font-bold tracking-tight text-ink-900 dark:text-ink-50">
              {value}
            </p>
          )}
          {hint && !loading && (
            <p className="mt-1 truncate text-xs text-ink-400 dark:text-ink-500">{hint}</p>
          )}
        </div>
        {icon && (
          <span
            className={clsx(
              'grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br',
              TONE_STYLES[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      {typeof trend === 'number' && !loading && (
        <p
          className={clsx(
            'relative mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium',
            trend >= 0
              ? 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
          )}
        >
          {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          <span className="num">{toPersianDigits(Math.abs(trend).toFixed(1))}٪</span>
          نسبت به دوره قبل
        </p>
      )}
    </div>
  )
}

export function Spinner({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-500">
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  )
}

export function EmptyState({
  title = 'داده‌ای یافت نشد',
  description,
  action,
  icon,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">
        {icon ?? <SearchX size={26} strokeWidth={1.5} />}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-xs leading-6 text-ink-500 dark:text-ink-400">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-sm text-rose-600 dark:text-rose-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary btn-sm"
        >
          تلاش دوباره
        </button>
      )}
    </div>
  )
}

interface TabsProps<T extends string> {
  tabs: Array<{ key: T; label: ReactNode; badge?: ReactNode }>
  active: T
  onChange: (key: T) => void
  className?: string
}

export function Tabs<T extends string>({ tabs, active, onChange, className }: TabsProps<T>) {
  return (
    <div
      className={clsx(
        'inline-flex flex-wrap items-center gap-1 rounded-2xl border border-ink-200 bg-white p-1 shadow-sm dark:border-ink-700 dark:bg-ink-900/60',
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={clsx(
            'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition',
            active === tab.key
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
          )}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge !== null && (
            <span
              className={clsx(
                'num rounded-md px-1.5 py-0.5 text-[11px]',
                active === tab.key ? 'bg-white/20' : 'bg-ink-100 dark:bg-ink-800',
              )}
            >
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Money({
  value,
  className,
  colored = false,
}: {
  value: unknown
  className?: string
  colored?: boolean
}) {
  const numeric = Number(String(value ?? 0).replace(/,/g, '')) || 0
  return (
    <span
      className={clsx(
        'num',
        colored && (numeric > 0 ? 'text-teal-600 dark:text-teal-400' : numeric < 0 ? 'text-rose-600 dark:text-rose-400' : ''),
        className,
      )}
    >
      {toPersianDigits(numeric.toLocaleString('en-US'))}
    </span>
  )
}

export function ProgressBar({
  value,
  tone = 'brand',
  className,
}: {
  value: number
  tone?: 'brand' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const tones = {
    brand: 'bg-brand-600',
    success: 'bg-teal-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
  }
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800', className)}>
      <div
        className={clsx('h-full rounded-full transition-all', tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
