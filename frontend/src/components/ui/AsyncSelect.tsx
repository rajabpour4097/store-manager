import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'

import { FieldWrap } from './Field'
import { useDebounce } from '@/hooks/useDebounce'

export interface AsyncOption {
  value: number
  label: string
  description?: string
}

interface AsyncSelectProps {
  label?: ReactNode
  value: number | null
  onChange: (value: number | null, option: AsyncOption | null) => void
  search: (term: string) => Promise<AsyncOption[]>
  placeholder?: string
  error?: string | string[]
  hint?: ReactNode
  required?: boolean
  className?: string
  disabled?: boolean
  /** برچسب مقدار انتخاب‌شده وقتی گزینه‌ها بارگذاری نشده‌اند */
  selectedLabel?: string
  emptyText?: string
  /** با کلیک، فرم ایجاد موجودیت جدید باز می‌شود */
  onCreateNew?: () => void
  createLabel?: string
}

/** انتخابگر جست‌وجویی برای موجودیت‌های سرور (طرف‌حساب، کالا …) */
export function AsyncSelect({
  label,
  value,
  onChange,
  search,
  placeholder = 'جست‌وجو و انتخاب…',
  error,
  hint,
  required,
  className,
  disabled,
  selectedLabel,
  emptyText = 'موردی یافت نشد.',
  onCreateNew,
  createLabel = 'افزودن مورد جدید',
}: AsyncSelectProps) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [options, setOptions] = useState<AsyncOption[]>([])
  const [loading, setLoading] = useState(false)
  const [cachedLabel, setCachedLabel] = useState(selectedLabel ?? '')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef(search)
  searchRef.current = search
  const debouncedTerm = useDebounce(term, 350)

  useEffect(() => {
    if (selectedLabel) setCachedLabel(selectedLabel)
  }, [selectedLabel])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    searchRef
      .current(debouncedTerm)
      .then((result) => {
        if (active) setOptions(result)
      })
      .catch(() => {
        if (active) setOptions([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [debouncedTerm, open])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setTerm('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const display = useMemo(() => {
    if (value === null) return ''
    const found = options.find((option) => option.value === value)
    return found?.label ?? cachedLabel
  }, [value, options, cachedLabel])

  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} className={className}>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className={clsx(
            'input flex items-center justify-between gap-2 text-right',
            error && 'border-rose-400',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <span className={clsx('truncate', !display && 'text-ink-400')}>
            {display || placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {value !== null && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                className="rounded p-0.5 text-ink-400 transition hover:text-rose-500"
                onClick={(event) => {
                  event.stopPropagation()
                  onChange(null, null)
                  setCachedLabel('')
                }}
              >
                <X size={14} />
              </span>
            )}
            <ChevronDown size={15} className="text-ink-400" />
          </span>
        </button>

        {open && (
          <div className="absolute z-40 mt-2 w-full animate-scale-in overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card-lg dark:border-ink-700 dark:bg-ink-900">
            <div className="relative border-b border-ink-100 dark:border-ink-800">
              <Search
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="جست‌وجو…"
                className="w-full bg-transparent py-2.5 pr-9 pl-3 text-sm focus:outline-none"
              />
              {loading && (
                <Loader2
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-ink-400"
                />
              )}
            </div>
            <ul className="max-h-60 overflow-y-auto py-1">
              {!loading && options.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-ink-400">{emptyText}</li>
              )}
              {options.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value, option)
                      setCachedLabel(option.label)
                      setOpen(false)
                      setTerm('')
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm transition',
                      option.value === value
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                        : 'text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.description && (
                        <span className="mt-0.5 block truncate text-xs text-ink-400">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {option.value === value && <Check size={15} className="shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
            {onCreateNew && (
              <div className="border-t border-ink-100 p-1 dark:border-ink-800">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setTerm('')
                    onCreateNew()
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                >
                  <span className="text-lg leading-none">+</span>
                  {createLabel}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </FieldWrap>
  )
}
