import type { ReactNode } from 'react'
import clsx from 'clsx'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  noPadding?: boolean
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: CardProps) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(!noPadding && 'p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
