import { useEffect, useMemo, useState } from 'react'

import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { NumberInput, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { searchParties } from '@/components/ui/selectors'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { chequesApi, ledgerApi } from '@/services/endpoints'
import { formatMoney, toNumber } from '@/utils/format'
import { addDaysIso, todayIso } from '@/utils/jalali'
import type { BankAccount, Cheque, ChequeDirection, ChequeOptions } from '@/types'

interface FormState {
  serial_number: string
  sayad_id: string
  bank_name: string
  branch: string
  account_number: string
  amount: string
  issue_date: string
  due_date: string
  party: number | null
  party_label: string
  holder_name: string
  bank_account: string
  description: string
  create_ledger_entry: boolean
}

function initialState(cheque?: Cheque | null): FormState {
  if (cheque) {
    return {
      serial_number: cheque.serial_number,
      sayad_id: cheque.sayad_id ?? '',
      bank_name: cheque.bank_name,
      branch: cheque.branch ?? '',
      account_number: cheque.account_number ?? '',
      amount: String(toNumber(cheque.amount)),
      issue_date: cheque.issue_date,
      due_date: cheque.due_date,
      party: cheque.party,
      party_label: cheque.party_detail?.name ?? '',
      holder_name: cheque.holder_name ?? '',
      bank_account: cheque.bank_account ? String(cheque.bank_account) : '',
      description: cheque.description ?? '',
      create_ledger_entry: cheque.create_ledger_entry,
    }
  }
  return {
    serial_number: '',
    sayad_id: '',
    bank_name: '',
    branch: '',
    account_number: '',
    amount: '',
    issue_date: todayIso(),
    due_date: addDaysIso(30),
    party: null,
    party_label: '',
    holder_name: '',
    bank_account: '',
    description: '',
    create_ledger_entry: true,
  }
}

interface ChequeFormModalProps {
  open: boolean
  direction: ChequeDirection
  cheque?: Cheque | null
  options: ChequeOptions | null
  onClose: () => void
  onSaved: () => void
}

export function ChequeFormModal({
  open,
  direction,
  cheque,
  options,
  onClose,
  onSaved,
}: ChequeFormModalProps) {
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => initialState(cheque))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [banks, setBanks] = useState<BankAccount[]>([])

  useEffect(() => {
    if (open) {
      setForm(initialState(cheque))
      setErrors({})
    }
  }, [open, cheque])

  useEffect(() => {
    if (!open) return
    ledgerApi
      .banks({ page_size: 100, is_active: true })
      .then((response) => setBanks(response.results))
      .catch(() => setBanks([]))
  }, [open])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const bankOptions = useMemo(
    () => (options?.banks ?? []).map((bank) => ({ value: bank.value, label: bank.label })),
    [options],
  )

  const isReceivable = direction === 'receivable'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrors({})

    const localErrors: Record<string, string[]> = {}
    if (!form.serial_number.trim()) localErrors.serial_number = ['شماره چک الزامی است.']
    if (!form.bank_name) localErrors.bank_name = ['بانک را انتخاب کنید.']
    if (!form.party) localErrors.party = ['طرف حساب را انتخاب کنید.']
    if (toNumber(form.amount) <= 0) localErrors.amount = ['مبلغ باید بزرگ‌تر از صفر باشد.']
    if (!form.issue_date) localErrors.issue_date = ['تاریخ صدور الزامی است.']
    if (!form.due_date) localErrors.due_date = ['تاریخ سرسید الزامی است.']
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      return
    }

    const payload = {
      direction,
      serial_number: form.serial_number.trim(),
      sayad_id: form.sayad_id.trim(),
      bank_name: form.bank_name,
      branch: form.branch.trim(),
      account_number: form.account_number.trim(),
      amount: form.amount,
      issue_date: form.issue_date,
      due_date: form.due_date,
      party: form.party,
      holder_name: form.holder_name.trim(),
      bank_account: form.bank_account ? Number(form.bank_account) : null,
      description: form.description.trim(),
      create_ledger_entry: form.create_ledger_entry,
    }

    setSaving(true)
    try {
      if (cheque) {
        await chequesApi.update(cheque.id, payload)
        toast.success('چک با موفقیت ویرایش شد.')
      } else {
        await chequesApi.create(payload)
        toast.success('چک جدید ثبت شد.')
      }
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت چک انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={cheque ? `ویرایش چک ${cheque.serial_number}` : `ثبت چک ${isReceivable ? 'دریافتی' : 'پرداختی'}`}
      subtitle={
        isReceivable
          ? 'چکی که از مشتری دریافت کرده‌اید (بدهی مشتری کم می‌شود).'
          : 'چکی که به تأمین‌کننده داده‌اید (در صورت نداشتن بدهی قبلی، بدهی شما ثبت می‌شود).'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {cheque ? 'ذخیره تغییرات' : 'ثبت چک'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="شماره چک"
          required
          value={form.serial_number}
          onChange={(value) => set('serial_number', value)}
          error={errors.serial_number}
          placeholder="۱۲۳۴۵۶"
          className="num text-right"
        />
        <TextInput
          label="شناسه صیادی (۱۶ رقم)"
          value={form.sayad_id}
          onChange={(value) => set('sayad_id', value)}
          error={errors.sayad_id}
          hint="اختیاری"
          className="num text-right"
        />
        <SelectInput
          label="بانک"
          required
          value={form.bank_name}
          onChange={(value) => set('bank_name', value)}
          options={bankOptions}
          placeholder="انتخاب بانک…"
          error={errors.bank_name}
        />
        <TextInput
          label="شعبه"
          value={form.branch}
          onChange={(value) => set('branch', value)}
          error={errors.branch}
        />
        <NumberInput
          label="مبلغ (ریال)"
          required
          value={form.amount}
          onChange={(value) => set('amount', value)}
          error={errors.amount}
          hint={form.amount ? formatMoney(form.amount) : undefined}
        />
        <TextInput
          label="شماره حساب"
          value={form.account_number}
          onChange={(value) => set('account_number', value)}
          error={errors.account_number}
          className="num text-right"
        />
        <DatePicker
          label="تاریخ صدور"
          required
          value={form.issue_date}
          onChange={(iso) => set('issue_date', iso)}
          error={errors.issue_date}
          clearable={false}
        />
        <DatePicker
          label="تاریخ سرسید"
          required
          value={form.due_date}
          onChange={(iso) => set('due_date', iso)}
          error={errors.due_date}
          clearable={false}
        />
        <AsyncSelect
          label={isReceivable ? 'مشتری (صادرکننده)' : 'تأمین‌کننده (دریافت‌کننده)'}
          required
          value={form.party}
          selectedLabel={form.party_label}
          onChange={(value, option) => {
            set('party', value)
            set('party_label', option?.label ?? '')
          }}
          search={searchParties}
          error={errors.party}
        />
        <TextInput
          label="نام صاحب چک / در وجه"
          value={form.holder_name}
          onChange={(value) => set('holder_name', value)}
          error={errors.holder_name}
          hint="در صورت تفاوت با طرف حساب"
        />
        <SelectInput
          label="حساب بانکی مرتبط"
          value={form.bank_account}
          onChange={(value) => set('bank_account', value)}
          options={banks.map((bank) => ({
            value: bank.id,
            label: `${bank.title} — ${bank.bank_name}`,
          }))}
          placeholder="بدون حساب مشخص"
          error={errors.bank_account}
        />
        <div className="sm:col-span-2">
          <Switch
            label="ثبت خودکار سند در دفتر بدهکار/بستانکار"
            hint="با ثبت چک، سند مالی طرف حساب به‌صورت سیستمی ایجاد و با تغییر وضعیت به‌روزرسانی می‌شود."
            checked={form.create_ledger_entry}
            onChange={(checked) => set('create_ledger_entry', checked)}
          />
        </div>
        <TextArea
          label="توضیحات"
          wrapClassName="sm:col-span-2"
          value={form.description}
          onChange={(value) => set('description', value)}
          error={errors.description}
        />
      </form>
    </Modal>
  )
}
