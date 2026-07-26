import { useEffect, useState } from 'react'

import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { NumberInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { searchParties } from '@/components/ui/selectors'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ledgerApi } from '@/services/endpoints'
import { formatMoney, toNumber } from '@/utils/format'
import { ENTRY_TYPES } from '@/utils/constants'
import { todayIso } from '@/utils/jalali'
import type { BankAccount, Choice } from '@/types'

interface LedgerEntryModalProps {
  open: boolean
  categories: Choice[]
  defaultParty?: { id: number; name: string } | null
  onClose: () => void
  onSaved: () => void
}

export function LedgerEntryModal({
  open,
  categories,
  defaultParty,
  onClose,
  onSaved,
}: LedgerEntryModalProps) {
  const toast = useToast()
  const [party, setParty] = useState<number | null>(defaultParty?.id ?? null)
  const [partyLabel, setPartyLabel] = useState(defaultParty?.name ?? '')
  const [date, setDate] = useState(todayIso())
  const [entryType, setEntryType] = useState('debit')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [documentNumber, setDocumentNumber] = useState('')
  const [description, setDescription] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setParty(defaultParty?.id ?? null)
    setPartyLabel(defaultParty?.name ?? '')
    setDate(todayIso())
    setEntryType('debit')
    setAmount('')
    setCategory('other')
    setDocumentNumber('')
    setDescription('')
    setBankAccount('')
    setErrors({})
    ledgerApi
      .banks({ page_size: 100, is_active: true })
      .then((response) => setBanks(response.results))
      .catch(() => setBanks([]))
  }, [open, defaultParty])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const localErrors: Record<string, string[]> = {}
    if (!party) localErrors.party = ['طرف حساب را انتخاب کنید.']
    if (toNumber(amount) <= 0) localErrors.amount = ['مبلغ باید بزرگ‌تر از صفر باشد.']
    if (!date) localErrors.date = ['تاریخ الزامی است.']
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      return
    }

    setSaving(true)
    try {
      await ledgerApi.quickEntry({
        party,
        date,
        entry_type: entryType,
        amount,
        category,
        document_number: documentNumber.trim(),
        description: description.trim(),
        bank_account: bankAccount ? Number(bankAccount) : null,
      })
      toast.success('سند مالی ثبت شد.')
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت سند انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت سند دستی"
      subtitle="برای ثبت بدهکاری یا بستانکاری خارج از فاکتور و چک"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            ثبت سند
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <AsyncSelect
          label="طرف حساب"
          required
          value={party}
          selectedLabel={partyLabel}
          onChange={(value, option) => {
            setParty(value)
            setPartyLabel(option?.label ?? '')
          }}
          search={searchParties}
          error={errors.party}
          className="sm:col-span-2"
        />
        <SelectInput
          label="نوع سند"
          value={entryType}
          onChange={setEntryType}
          options={ENTRY_TYPES.map((item) => ({ value: item.value, label: item.label }))}
          error={errors.entry_type}
          hint={
            entryType === 'debit'
              ? 'بدهکار: طرف حساب به فروشگاه بدهکار می‌شود.'
              : 'بستانکار: فروشگاه به طرف حساب بدهکار می‌شود.'
          }
        />
        <NumberInput
          label="مبلغ (ریال)"
          required
          value={amount}
          onChange={setAmount}
          error={errors.amount}
          hint={amount ? formatMoney(amount) : undefined}
        />
        <DatePicker
          label="تاریخ سند"
          required
          value={date}
          onChange={setDate}
          clearable={false}
          error={errors.date}
        />
        <SelectInput
          label="سرفصل"
          value={category}
          onChange={setCategory}
          options={categories.map((item) => ({ value: item.value, label: item.label }))}
          error={errors.category}
        />
        <TextInput
          label="شماره سند"
          value={documentNumber}
          onChange={setDocumentNumber}
          error={errors.document_number}
          className="num text-right"
        />
        <SelectInput
          label="حساب بانکی"
          value={bankAccount}
          onChange={setBankAccount}
          options={banks.map((bank) => ({
            value: bank.id,
            label: `${bank.title} — ${bank.bank_name}`,
          }))}
          placeholder="بدون حساب"
          error={errors.bank_account}
        />
        <TextArea
          label="توضیحات"
          wrapClassName="sm:col-span-2"
          value={description}
          onChange={setDescription}
          error={errors.description}
        />
      </form>
    </Modal>
  )
}
