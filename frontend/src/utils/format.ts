const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** تبدیل ارقام لاتین به فارسی */
export function toPersianDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)])
}

/** تبدیل ارقام فارسی/عربی به لاتین */
export function toLatinDigits(value: string): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (char) => String(char.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (char) => String(char.charCodeAt(0) - 0x0660))
}

export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(toLatinDigits(String(value)).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

/** جداکننده هزارگان با ارقام فارسی */
export function formatNumber(value: unknown, options?: { persian?: boolean; digits?: number }): string {
  const persian = options?.persian ?? true
  const digits = options?.digits ?? 0
  const numeric = toNumber(value)
  const formatted = numeric.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return persian ? toPersianDigits(formatted) : formatted
}

/** مبلغ به ریال/تومان با واحد */
export function formatMoney(value: unknown, options?: { unit?: string; persian?: boolean }): string {
  const unit = options?.unit ?? 'ریال'
  return `${formatNumber(value, { persian: options?.persian })} ${unit}`.trim()
}

/** مبلغ خلاصه‌شده برای کارت‌های آماری: ۱٫۲ میلیارد */
export function formatCompactMoney(value: unknown, unit = 'ریال'): string {
  const numeric = Math.abs(toNumber(value))
  const sign = toNumber(value) < 0 ? '−' : ''
  const scales: Array<[number, string]> = [
    [1_000_000_000_000, 'هزار میلیارد'],
    [1_000_000_000, 'میلیارد'],
    [1_000_000, 'میلیون'],
    [1_000, 'هزار'],
  ]
  for (const [scale, label] of scales) {
    if (numeric >= scale) {
      const scaled = numeric / scale
      const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '')
      return `${sign}${toPersianDigits(text)} ${label} ${unit}`.trim()
    }
  }
  return `${sign}${formatNumber(numeric)} ${unit}`.trim()
}

export function formatQuantity(value: unknown, unit?: string): string {
  const numeric = toNumber(value)
  const hasFraction = Math.abs(numeric % 1) > 0.0001
  const text = formatNumber(numeric, { digits: hasFraction ? 2 : 0 })
  return unit ? `${text} ${unit}` : text
}

export function formatPercent(value: unknown, digits = 1): string {
  const numeric = toNumber(value)
  return `${toPersianDigits(numeric.toFixed(digits).replace(/\.0$/, ''))}٪`
}

/** فاصله‌ی روزها به زبان طبیعی */
export function formatDayDistance(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—'
  if (days === 0) return 'امروز'
  if (days === 1) return 'فردا'
  if (days === -1) return 'دیروز'
  if (days > 0) return `${toPersianDigits(days)} روز آینده`
  return `${toPersianDigits(Math.abs(days))} روز گذشته`
}

export function truncate(text: string, length = 60): string {
  if (!text) return ''
  return text.length > length ? `${text.slice(0, length)}…` : text
}
