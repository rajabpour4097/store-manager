import moment from 'moment-jalaali'

import { toLatinDigits, toPersianDigits } from './format'

moment.loadPersian({ dialect: 'persian-modern', usePersianDigits: false })

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
]

export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

/** تاریخ میلادی ISO → رشته شمسی */
export function toJalali(value?: string | null, format = 'jYYYY/jMM/jDD'): string {
  if (!value) return '—'
  const parsed = moment(value.length > 10 ? value : `${value}T00:00:00`)
  if (!parsed.isValid()) return '—'
  return toPersianDigits(parsed.format(format))
}

export function toJalaliVerbose(value?: string | null): string {
  if (!value) return '—'
  const parsed = moment(value.length > 10 ? value : `${value}T00:00:00`)
  if (!parsed.isValid()) return '—'
  return `${toPersianDigits(parsed.jDate())} ${JALALI_MONTHS[parsed.jMonth()]} ${toPersianDigits(
    parsed.jYear(),
  )}`
}

export function toJalaliDateTime(value?: string | null): string {
  if (!value) return '—'
  const parsed = moment(value)
  if (!parsed.isValid()) return '—'
  return toPersianDigits(parsed.format('jYYYY/jMM/jDD - HH:mm'))
}

/** رشته شمسی «۱۴۰۳/۰۵/۱۲» → تاریخ میلادی ISO «2024-08-02» */
export function jalaliToIso(value?: string | null): string {
  if (!value) return ''
  const normalized = toLatinDigits(value).replace(/[-.]/g, '/').trim()
  const parsed = moment(normalized, 'jYYYY/jM/jD')
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : ''
}

export function isoToJalaliInput(value?: string | null): string {
  if (!value) return ''
  const parsed = moment(value.length > 10 ? value : `${value}T00:00:00`)
  return parsed.isValid() ? parsed.format('jYYYY/jMM/jDD') : ''
}

export function todayIso(): string {
  return moment().format('YYYY-MM-DD')
}

export function todayJalali(): string {
  return toPersianDigits(moment().format('jYYYY/jMM/jDD'))
}

export function addDaysIso(days: number, base?: string): string {
  return moment(base ?? undefined)
    .add(days, 'day')
    .format('YYYY-MM-DD')
}

/** ابتدای ماه جاری شمسی به میلادی */
export function startOfJalaliMonthIso(offsetMonths = 0): string {
  return moment().add(offsetMonths, 'jMonth').startOf('jMonth').format('YYYY-MM-DD')
}

export function endOfJalaliMonthIso(offsetMonths = 0): string {
  return moment().add(offsetMonths, 'jMonth').endOf('jMonth').format('YYYY-MM-DD')
}

export function startOfJalaliYearIso(offsetYears = 0): string {
  return moment().add(offsetYears, 'jYear').startOf('jYear').format('YYYY-MM-DD')
}

export function endOfJalaliYearIso(offsetYears = 0): string {
  return moment().add(offsetYears, 'jYear').endOf('jYear').format('YYYY-MM-DD')
}

export function currentJalaliYear(): number {
  return moment().jYear()
}

export function daysBetween(from: string, to: string): number {
  return moment(to).diff(moment(from), 'day')
}

export function isValidJalaliInput(value: string): boolean {
  const normalized = toLatinDigits(value).replace(/[-.]/g, '/').trim()
  if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalized)) return false
  return moment(normalized, 'jYYYY/jM/jD').isValid()
}

/** برچسب ماه شمسی «۱۴۰۳/۰۵» → «مرداد ۱۴۰۳» */
export function jalaliMonthLabel(label: string): string {
  const normalized = toLatinDigits(label)
  const [year, month] = normalized.split('/')
  const index = Number(month) - 1
  if (Number.isNaN(index) || index < 0 || index > 11) return toPersianDigits(label)
  return `${JALALI_MONTHS[index]} ${toPersianDigits(year)}`
}

export interface JalaliCalendarCell {
  iso: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
}

/** ماتریس روزهای یک ماه شمسی برای تقویم */
export function buildJalaliMonthGrid(jYear: number, jMonth: number): JalaliCalendarCell[] {
  const first = moment(`${jYear}/${jMonth + 1}/1`, 'jYYYY/jM/jD')
  const daysInMonth = moment.jDaysInMonth(jYear, jMonth)
  // moment day(): Sunday=0 ... Saturday=6 → تبدیل به شنبه=۰
  const startOffset = (first.day() + 1) % 7
  const today = moment().format('YYYY-MM-DD')

  const cells: JalaliCalendarCell[] = []
  for (let index = 0; index < startOffset; index += 1) {
    const date = first.clone().subtract(startOffset - index, 'day')
    cells.push({
      iso: date.format('YYYY-MM-DD'),
      day: date.jDate(),
      isCurrentMonth: false,
      isToday: date.format('YYYY-MM-DD') === today,
    })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = moment(`${jYear}/${jMonth + 1}/${day}`, 'jYYYY/jM/jD')
    cells.push({
      iso: date.format('YYYY-MM-DD'),
      day,
      isCurrentMonth: true,
      isToday: date.format('YYYY-MM-DD') === today,
    })
  }
  while (cells.length % 7 !== 0) {
    const last = moment(cells[cells.length - 1].iso).add(1, 'day')
    cells.push({
      iso: last.format('YYYY-MM-DD'),
      day: last.jDate(),
      isCurrentMonth: false,
      isToday: last.format('YYYY-MM-DD') === today,
    })
  }
  return cells
}

export function jalaliPartsFromIso(iso: string): { year: number; month: number; day: number } {
  const parsed = moment(iso.length > 10 ? iso : `${iso}T00:00:00`)
  return { year: parsed.jYear(), month: parsed.jMonth(), day: parsed.jDate() }
}
