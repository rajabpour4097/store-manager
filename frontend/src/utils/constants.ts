import type { Choice } from '@/types'

export const PAYMENT_METHODS: Choice[] = [
  { value: 'cash', label: 'نقدی' },
  { value: 'card', label: 'کارت به کارت' },
  { value: 'transfer', label: 'حواله بانکی' },
  { value: 'cheque', label: 'چک' },
  { value: 'other', label: 'سایر' },
]

export const FINANCE_KINDS: Choice[] = [
  { value: 'expense', label: 'هزینه' },
  { value: 'income', label: 'درآمد' },
]

export const ENTRY_TYPES: Choice[] = [
  { value: 'debit', label: 'بدهکار (طلب فروشگاه)' },
  { value: 'credit', label: 'بستانکار (بدهی فروشگاه)' },
]
