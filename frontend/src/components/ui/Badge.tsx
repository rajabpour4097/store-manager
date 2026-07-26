import type { ReactNode } from 'react'
import clsx from 'clsx'

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200',
  success: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  purple: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
}

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', children, icon, className }: BadgeProps) {
  return (
    <span className={clsx('badge', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

/** نگاشت وضعیت‌های دامنه به رنگ نشان */
export const CHEQUE_STATUS_TONES: Record<string, BadgeTone> = {
  in_portfolio: 'info',
  submitted: 'brand',
  cleared: 'success',
  bounced: 'danger',
  returned: 'warning',
  transferred: 'purple',
  extended: 'warning',
  cancelled: 'neutral',
}

export const DUE_STATE_TONES: Record<string, BadgeTone> = {
  settled: 'success',
  overdue: 'danger',
  critical: 'danger',
  warning: 'warning',
  upcoming: 'info',
  far: 'neutral',
}

export const ORDER_STATUS_TONES: Record<string, BadgeTone> = {
  draft: 'neutral',
  confirmed: 'brand',
  partial: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

export const PAYMENT_STATUS_TONES: Record<string, BadgeTone> = {
  unpaid: 'danger',
  partial: 'warning',
  paid: 'success',
}

export const PRIORITY_TONES: Record<string, BadgeTone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
}

export const SUGGESTION_STATUS_TONES: Record<string, BadgeTone> = {
  pending: 'warning',
  accepted: 'brand',
  ordered: 'success',
  rejected: 'neutral',
  expired: 'neutral',
}

export const STOCK_STATE_TONES: Record<string, BadgeTone> = {
  ok: 'success',
  low: 'warning',
  out_of_stock: 'danger',
}

export const BALANCE_STATE_TONES: Record<string, BadgeTone> = {
  debtor: 'danger',
  creditor: 'success',
  settled: 'neutral',
}
