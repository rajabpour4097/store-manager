import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import clsx from 'clsx'

import { toLatinDigits, toPersianDigits } from '@/utils/format'

interface FieldWrapProps {
  label?: ReactNode
  error?: string | string[]
  hint?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

export function FieldWrap({
  label,
  error,
  hint,
  required,
  className,
  children,
}: FieldWrapProps) {
  const message = Array.isArray(error) ? error[0] : error
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="mr-1 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {message ? (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{message}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: ReactNode
  error?: string | string[]
  hint?: ReactNode
  wrapClassName?: string
  value: string
  onChange: (value: string) => void
  suffix?: ReactNode
}

export function TextInput({
  label,
  error,
  hint,
  wrapClassName,
  value,
  onChange,
  suffix,
  className,
  required,
  ...rest
}: TextInputProps) {
  return (
    <FieldWrap
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={wrapClassName}
    >
      <div className="relative">
        <input
          className={clsx('input', suffix && 'pl-16', error && 'border-rose-400', className)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
            {suffix}
          </span>
        )}
      </div>
    </FieldWrap>
  )
}

interface NumberInputProps extends Omit<TextInputProps, 'value' | 'onChange'> {
  value: string | number
  onChange: (value: string) => void
  /** نمایش جداکننده هزارگان هنگام تایپ */
  thousands?: boolean
}

export function NumberInput({
  value,
  onChange,
  thousands = true,
  ...rest
}: NumberInputProps) {
  const raw = String(value ?? '')
  const display = thousands && raw !== '' ? formatWhileTyping(raw) : toPersianDigits(raw)

  return (
    <TextInput
      {...rest}
      inputMode="decimal"
      value={display}
      onChange={(next) => {
        const cleaned = toLatinDigits(next).replace(/[^\d.-]/g, '')
        onChange(cleaned)
      }}
      className={clsx('num text-right', rest.className)}
    />
  )
}

function formatWhileTyping(raw: string): string {
  const negative = raw.startsWith('-')
  const [intPart, decimalPart] = raw.replace('-', '').split('.')
  const grouped = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const text = decimalPart !== undefined ? `${grouped}.${decimalPart}` : grouped
  return `${negative ? '-' : ''}${toPersianDigits(text)}`
}

interface SelectInputProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  label?: ReactNode
  error?: string | string[]
  hint?: ReactNode
  wrapClassName?: string
  value: string | number
  onChange: (value: string) => void
  options: Array<{ value: string | number; label: string; disabled?: boolean }>
  placeholder?: string
}

export function SelectInput({
  label,
  error,
  hint,
  wrapClassName,
  value,
  onChange,
  options,
  placeholder,
  className,
  required,
  ...rest
}: SelectInputProps) {
  return (
    <FieldWrap
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={wrapClassName}
    >
      <select
        className={clsx('input appearance-none pl-8', error && 'border-rose-400', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238592bd' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'left 0.75rem center',
        }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  )
}

interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  label?: ReactNode
  error?: string | string[]
  hint?: ReactNode
  wrapClassName?: string
  value: string
  onChange: (value: string) => void
}

export function TextArea({
  label,
  error,
  hint,
  wrapClassName,
  value,
  onChange,
  className,
  required,
  rows = 3,
  ...rest
}: TextAreaProps) {
  return (
    <FieldWrap
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={wrapClassName}
    >
      <textarea
        rows={rows}
        className={clsx('input resize-y', error && 'border-rose-400', className)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </FieldWrap>
  )
}

interface SwitchProps {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: ReactNode
  disabled?: boolean
}

export function Switch({ label, checked, onChange, hint, disabled }: SwitchProps) {
  return (
    <label
      className={clsx(
        'flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 px-3.5 py-3 transition dark:border-ink-700',
        checked && 'border-brand-300 bg-brand-50/50 dark:border-brand-500/40 dark:bg-brand-500/10',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className={clsx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={clsx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            checked ? 'right-0.5' : 'right-4.5',
          )}
          style={{ right: checked ? '0.125rem' : '1.125rem' }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-700 dark:text-ink-200">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-400">{hint}</span>}
      </span>
    </label>
  )
}
