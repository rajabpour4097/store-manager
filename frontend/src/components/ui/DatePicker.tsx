import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

import { FieldWrap } from './Field'
import { toPersianDigits } from '@/utils/format'
import {
  JALALI_MONTHS,
  WEEKDAYS,
  buildJalaliMonthGrid,
  isValidJalaliInput,
  isoToJalaliInput,
  jalaliPartsFromIso,
  jalaliToIso,
  todayIso,
} from '@/utils/jalali'

interface DatePickerProps {
  label?: ReactNode
  value: string | null
  onChange: (iso: string) => void
  error?: string | string[]
  hint?: ReactNode
  required?: boolean
  clearable?: boolean
  className?: string
  placeholder?: string
  disabled?: boolean
}

/** انتخاب تاریخ شمسی با ورودی متنی و تقویم */
export function DatePicker({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  clearable = true,
  className,
  placeholder = '۱۴۰۳/۰۱/۰۱',
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => toPersianDigits(isoToJalaliInput(value)))
  const containerRef = useRef<HTMLDivElement>(null)

  const anchorIso = value || todayIso()
  const parts = useMemo(() => jalaliPartsFromIso(anchorIso), [anchorIso])
  const [cursor, setCursor] = useState({ year: parts.year, month: parts.month })

  useEffect(() => {
    setText(toPersianDigits(isoToJalaliInput(value)))
    const next = jalaliPartsFromIso(value || todayIso())
    setCursor({ year: next.year, month: next.month })
  }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const cells = useMemo(
    () => buildJalaliMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )

  const commitText = (raw: string) => {
    if (!raw.trim()) {
      onChange('')
      return
    }
    if (isValidJalaliInput(raw)) {
      onChange(jalaliToIso(raw))
    } else {
      setText(toPersianDigits(isoToJalaliInput(value)))
    }
  }

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const total = current.year * 12 + current.month + delta
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
    })
  }

  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} className={className}>
      <div className="relative" ref={containerRef}>
        <input
          className={clsx('input num pl-10 text-right', error && 'border-rose-400')}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commitText(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitText(text)
              setOpen(false)
            }
            if (event.key === 'Escape') setOpen(false)
          }}
        />
        <div className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {clearable && value && !disabled && (
            <button
              type="button"
              className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-rose-500 dark:hover:bg-ink-800"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              aria-label="پاک کردن تاریخ"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-brand-600 dark:hover:bg-ink-800"
            onClick={() => !disabled && setOpen((current) => !current)}
            aria-label="تقویم"
          >
            <CalendarDays size={16} />
          </button>
        </div>

        {open && !disabled && (
          <div className="absolute z-40 mt-2 w-72 animate-scale-in rounded-2xl border border-ink-200 bg-white p-3 shadow-card-lg dark:border-ink-700 dark:bg-ink-900">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
                onClick={() => shiftMonth(1)}
                aria-label="ماه بعد"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">
                <select
                  className="rounded-lg bg-transparent px-1 py-0.5 text-sm focus:outline-none"
                  value={cursor.month}
                  onChange={(event) =>
                    setCursor((current) => ({ ...current, month: Number(event.target.value) }))
                  }
                >
                  {JALALI_MONTHS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="num rounded-lg bg-transparent px-1 py-0.5 text-sm focus:outline-none"
                  value={cursor.year}
                  onChange={(event) =>
                    setCursor((current) => ({ ...current, year: Number(event.target.value) }))
                  }
                >
                  {Array.from({ length: 21 }, (_, index) => parts.year - 10 + index).map((year) => (
                    <option key={year} value={year}>
                      {toPersianDigits(year)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
                onClick={() => shiftMonth(-1)}
                aria-label="ماه قبل"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-ink-400">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day.slice(0, 1)}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                const selected = value === cell.iso
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      onChange(cell.iso)
                      setOpen(false)
                    }}
                    className={clsx(
                      'num rounded-lg py-1.5 text-xs transition',
                      selected
                        ? 'bg-brand-600 font-semibold text-white'
                        : cell.isToday
                          ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                          : cell.isCurrentMonth
                            ? 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800'
                            : 'text-ink-300 hover:bg-ink-50 dark:text-ink-600 dark:hover:bg-ink-800/60',
                    )}
                  >
                    {toPersianDigits(cell.day)}
                  </button>
                )
              })}
            </div>

            <div className="mt-2 flex justify-between border-t border-ink-100 pt-2 dark:border-ink-800">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-brand-600 transition hover:bg-brand-50 dark:hover:bg-brand-500/10"
                onClick={() => {
                  onChange(todayIso())
                  setOpen(false)
                }}
              >
                امروز
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
                onClick={() => setOpen(false)}
              >
                بستن
              </button>
            </div>
          </div>
        )}
      </div>
    </FieldWrap>
  )
}
