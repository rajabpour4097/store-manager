import type { ReactNode } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react'

import { toPersianDigits } from '@/utils/format'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T, index: number) => ReactNode
  className?: string
  headerClassName?: string
  align?: 'right' | 'left' | 'center'
}

interface DataTableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  emptyAction?: ReactNode
  onRowClick?: (row: T) => void
  footer?: ReactNode
  className?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  emptyMessage = 'رکوردی برای نمایش وجود ندارد.',
  emptyAction,
  onRowClick,
  footer,
  className,
}: DataTableProps<T>) {
  const alignClass = (align?: Column<T>['align']) =>
    align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'

  return (
    <div className={clsx('table-wrap', className)}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={clsx(alignClass(column.align), column.headerClassName)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="py-14 text-center">
                <span className="inline-flex items-center gap-2 text-sm text-ink-500">
                  <Loader2 size={16} className="animate-spin" />
                  در حال بارگذاری…
                </span>
              </td>
            </tr>
          )}

          {!loading && error && (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-sm text-rose-600">
                {error}
              </td>
            </tr>
          )}

          {!loading && !error && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-14 text-center">
                <div className="flex flex-col items-center gap-2 text-ink-400">
                  <Inbox size={30} strokeWidth={1.5} />
                  <p className="text-sm">{emptyMessage}</p>
                  {emptyAction}
                </div>
              </td>
            </tr>
          )}

          {!loading &&
            !error &&
            rows.map((row, index) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(onRowClick && 'cursor-pointer')}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(alignClass(column.align), column.className)}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {footer}
    </div>
  )
}

interface PaginationProps {
  page: number
  numPages: number
  count: number
  pageSize: number
  onChange: (page: number) => void
}

export function Pagination({ page, numPages, count, pageSize, onChange }: PaginationProps) {
  if (count === 0) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, count)

  const pages: number[] = []
  const start = Math.max(1, page - 2)
  const end = Math.min(numPages, start + 4)
  for (let index = Math.max(1, end - 4); index <= end; index += 1) pages.push(index)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 dark:border-ink-800">
      <p className="text-xs text-ink-500 dark:text-ink-400">
        نمایش <span className="num">{toPersianDigits(first)}</span> تا{' '}
        <span className="num">{toPersianDigits(last)}</span> از{' '}
        <span className="num font-semibold">{toPersianDigits(count)}</span> رکورد
      </p>
      {numPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            className="rounded-lg border border-ink-200 p-1.5 text-ink-500 transition hover:bg-ink-50 disabled:opacity-40 dark:border-ink-700 dark:hover:bg-ink-800"
            aria-label="صفحه قبل"
          >
            <ChevronRight size={15} />
          </button>
          {pages.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              className={clsx(
                'num min-w-8 rounded-lg border px-2 py-1.5 text-xs font-medium transition',
                item === page
                  ? 'border-brand-500 bg-brand-600 text-white'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
              )}
            >
              {toPersianDigits(item)}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= numPages}
            onClick={() => onChange(page + 1)}
            className="rounded-lg border border-ink-200 p-1.5 text-ink-500 transition hover:bg-ink-50 disabled:opacity-40 dark:border-ink-700 dark:hover:bg-ink-800"
            aria-label="صفحه بعد"
          >
            <ChevronLeft size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
