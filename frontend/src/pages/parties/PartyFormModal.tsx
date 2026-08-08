import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { NumberInput, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { partiesApi } from '@/services/endpoints'
import { toNumber } from '@/utils/format'
import type { Choice, Party } from '@/types'

interface FormState {
  name: string
  party_type: string
  is_legal_entity: boolean
  national_id: string
  economic_code: string
  mobile: string
  phone: string
  email: string
  city: string
  address: string
  postal_code: string
  opening_balance: string
  credit_limit: string
  is_active: boolean
  notes: string
}

function initialState(
  party?: Party | null,
  defaults?: { partyType?: string; name?: string },
): FormState {
  return {
    name: party?.name ?? defaults?.name ?? '',
    party_type: party?.party_type ?? defaults?.partyType ?? 'customer',
    is_legal_entity: party?.is_legal_entity ?? false,
    national_id: party?.national_id ?? '',
    economic_code: party?.economic_code ?? '',
    mobile: party?.mobile ?? '',
    phone: party?.phone ?? '',
    email: party?.email ?? '',
    city: party?.city ?? '',
    address: party?.address ?? '',
    postal_code: party?.postal_code ?? '',
    opening_balance: party ? String(toNumber(party.opening_balance)) : '0',
    credit_limit: party ? String(toNumber(party.credit_limit)) : '0',
    is_active: party?.is_active ?? true,
    notes: party?.notes ?? '',
  }
}

interface PartyFormModalProps {
  open: boolean
  party?: Party | null
  types: Choice[]
  defaultPartyType?: string
  defaultName?: string
  onClose: () => void
  onSaved: (party: Party) => void
}

export function PartyFormModal({
  open,
  party,
  types,
  defaultPartyType,
  defaultName,
  onClose,
  onSaved,
}: PartyFormModalProps) {
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() =>
    initialState(party, { partyType: defaultPartyType, name: defaultName }),
  )
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialState(party, { partyType: defaultPartyType, name: defaultName }))
      setErrors({})
    }
  }, [open, party, defaultPartyType, defaultName])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setErrors({ name: ['نام طرف حساب الزامی است.'] })
      return
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      opening_balance: form.opening_balance || '0',
      credit_limit: form.credit_limit || '0',
    }

    setSaving(true)
    try {
      let saved: Party
      if (party) {
        saved = await partiesApi.update(party.id, payload)
        toast.success('طرف حساب ویرایش شد.')
      } else {
        saved = await partiesApi.create(payload)
        toast.success('طرف حساب جدید ثبت شد.')
      }
      onSaved(saved)
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت طرف حساب انجام نشد.')
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
      title={party ? `ویرایش ${party.name}` : 'ثبت طرف حساب جدید'}
      subtitle={party ? `کد: ${party.code}` : 'مشتری، تأمین‌کننده یا هر دو'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {party ? 'ذخیره تغییرات' : 'ثبت طرف حساب'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="نام / عنوان"
          required
          value={form.name}
          onChange={(value) => set('name', value)}
          error={errors.name}
          wrapClassName="sm:col-span-2"
        />
        <SelectInput
          label="نوع طرف حساب"
          value={form.party_type}
          onChange={(value) => set('party_type', value)}
          options={types.map((item) => ({ value: item.value, label: item.label }))}
          error={errors.party_type}
        />
        <TextInput
          label="موبایل"
          value={form.mobile}
          onChange={(value) => set('mobile', value)}
          error={errors.mobile}
          className="num text-right"
          placeholder="۰۹۱۲۰۰۰۰۰۰۰"
        />
        <TextInput
          label="تلفن ثابت"
          value={form.phone}
          onChange={(value) => set('phone', value)}
          error={errors.phone}
          className="num text-right"
        />
        <TextInput
          label="ایمیل"
          value={form.email}
          onChange={(value) => set('email', value)}
          error={errors.email}
          dir="ltr"
        />
        <TextInput
          label={form.is_legal_entity ? 'شناسه ملی' : 'کد ملی'}
          value={form.national_id}
          onChange={(value) => set('national_id', value)}
          error={errors.national_id}
          className="num text-right"
        />
        <TextInput
          label="کد اقتصادی"
          value={form.economic_code}
          onChange={(value) => set('economic_code', value)}
          error={errors.economic_code}
          className="num text-right"
        />
        <TextInput
          label="شهر"
          value={form.city}
          onChange={(value) => set('city', value)}
          error={errors.city}
        />
        <TextInput
          label="کد پستی"
          value={form.postal_code}
          onChange={(value) => set('postal_code', value)}
          error={errors.postal_code}
          className="num text-right"
        />
        <NumberInput
          label="مانده اولیه (ریال)"
          value={form.opening_balance}
          onChange={(value) => set('opening_balance', value)}
          error={errors.opening_balance}
          hint="مثبت = بدهکار، منفی = بستانکار"
        />
        <NumberInput
          label="سقف اعتبار (ریال)"
          value={form.credit_limit}
          onChange={(value) => set('credit_limit', value)}
          error={errors.credit_limit}
          hint="صفر یعنی بدون محدودیت"
        />
        <Switch
          label="شخص حقوقی است"
          hint="برای شرکت‌ها و مؤسسات"
          checked={form.is_legal_entity}
          onChange={(checked) => set('is_legal_entity', checked)}
        />
        <Switch
          label="فعال"
          hint="طرف‌حساب‌های غیرفعال در انتخابگرها نمایش داده نمی‌شوند."
          checked={form.is_active}
          onChange={(checked) => set('is_active', checked)}
        />
        <TextArea
          label="نشانی"
          wrapClassName="sm:col-span-2"
          value={form.address}
          onChange={(value) => set('address', value)}
          error={errors.address}
          rows={2}
        />
        <TextArea
          label="یادداشت"
          wrapClassName="sm:col-span-2"
          value={form.notes}
          onChange={(value) => set('notes', value)}
          error={errors.notes}
          rows={2}
        />
      </form>
    </Modal>
  )
}
