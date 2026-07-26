import clsx from 'clsx'

import { DatePicker } from './DatePicker'
import {
  addDaysIso,
  endOfJalaliMonthIso,
  endOfJalaliYearIso,
  startOfJalaliMonthIso,
  startOfJalaliYearIso,
  todayIso,
} from '@/utils/jalali'

export interface DateRange {
  from: string
  to: string
}

interface Preset {
  key: string
  label: string
  range: () => DateRange
}

export const RANGE_PRESETS: Preset[] = [
  { key: 'today', label: 'امروز', range: () => ({ from: todayIso(), to: todayIso() }) },
  {
    key: 'week',
    label: '۷ روز اخیر',
    range: () => ({ from: addDaysIso(-6), to: todayIso() }),
  },
  {
    key: 'month30',
    label: '۳۰ روز اخیر',
    range: () => ({ from: addDaysIso(-29), to: todayIso() }),
  },
  {
    key: 'this_month',
    label: 'ماه جاری',
    range: () => ({ from: startOfJalaliMonthIso(), to: todayIso() }),
  },
  {
    key: 'last_month',
    label: 'ماه گذشته',
    range: () => ({ from: startOfJalaliMonthIso(-1), to: endOfJalaliMonthIso(-1) }),
  },
  {
    key: 'this_year',
    label: 'سال جاری',
    range: () => ({ from: startOfJalaliYearIso(), to: todayIso() }),
  },
  {
    key: 'last_year',
    label: 'سال گذشته',
    range: () => ({ from: startOfJalaliYearIso(-1), to: endOfJalaliYearIso(-1) }),
  },
]

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
  compact?: boolean
}

export function DateRangePicker({
  value,
  onChange,
  className,
  compact = false,
}: DateRangePickerProps) {
  const activePreset = RANGE_PRESETS.find((preset) => {
    const range = preset.range()
    return range.from === value.from && range.to === value.to
  })

  return (
    <div className={clsx('flex flex-wrap items-end gap-3', className)}>
      <DatePicker
        label={compact ? undefined : 'از تاریخ'}
        value={value.from}
        clearable={false}
        onChange={(iso) => onChange({ ...value, from: iso })}
        className="w-40"
      />
      <DatePicker
        label={compact ? undefined : 'تا تاریخ'}
        value={value.to}
        clearable={false}
        onChange={(iso) => onChange({ ...value, to: iso })}
        className="w-40"
      />
      <div className="flex flex-wrap gap-1.5 pb-0.5">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange(preset.range())}
            className={clsx(
              'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
              activePreset?.key === preset.key
                ? 'border-brand-500 bg-brand-600 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600 dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-300',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function defaultRange(): DateRange {
  return { from: startOfJalaliMonthIso(), to: todayIso() }
}
