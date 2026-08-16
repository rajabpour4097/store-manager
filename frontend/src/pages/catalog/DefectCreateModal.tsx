import { useEffect, useState } from 'react'

import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { TextArea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { searchAvailableProducts, searchSerials } from '@/components/ui/selectors'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { catalogApi } from '@/services/endpoints'
import { toLatinDigits } from '@/utils/format'
import { todayIso } from '@/utils/jalali'

interface DefectCreateModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function DefectCreateModal({ open, onClose, onSaved }: DefectCreateModalProps) {
  const toast = useToast()
  const [productId, setProductId] = useState<number | null>(null)
  const [productLabel, setProductLabel] = useState('')
  const [serialId, setSerialId] = useState<number | null>(null)
  const [serialLabel, setSerialLabel] = useState('')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [registeredAt, setRegisteredAt] = useState(todayIso())
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setProductId(null)
    setProductLabel('')
    setSerialId(null)
    setSerialLabel('')
    setReason('')
    setDescription('')
    setRegisteredAt(todayIso())
    setErrors({})
  }, [open])

  const handleSerialPick = (
    value: number | null,
    option: { label: string; meta?: Record<string, unknown> } | null,
  ) => {
    if (value === null || !option) {
      setSerialId(null)
      setSerialLabel('')
      return
    }
    const nextProductId = Number(option.meta?.productId ?? 0) || null
    setSerialId(value)
    setSerialLabel(String(option.meta?.serialNumber ?? option.label))
    if (nextProductId) {
      setProductId(nextProductId)
      setProductLabel(String(option.meta?.productName ?? ''))
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!productId && !serialId) {
      setErrors({ product: ['کالا یا سریال را انتخاب کنید.'] })
      return
    }
    if (!reason.trim()) {
      setErrors({ reason: ['علت خرابی را وارد کنید.'] })
      return
    }

    setSaving(true)
    try {
      const serial = toLatinDigits(serialLabel).trim()
      await catalogApi.createDefect({
        ...(productId ? { product: productId } : {}),
        serial_number: serial,
        reason: reason.trim(),
        description: description.trim(),
        registered_at: registeredAt,
        last_follow_up_at: registeredAt,
      })
      toast.success(
        serial
          ? 'خرابی دستگاه ثبت شد و این سریال از فروش کنار گذاشته شد.'
          : 'کالای خراب ثبت شد و از آمار موجودی کنار گذاشته شد.',
      )
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت کالای خراب انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت کالای خراب"
      subtitle="با جست‌وجوی سریال همان دستگاه موجود مشخص می‌شود؛ بدون سریال کل مدل از آمار موجودی کنار می‌رود"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button type="submit" form="defect-create-form" loading={saving}>
            ثبت خرابی
          </Button>
        </>
      }
    >
      <form id="defect-create-form" className="space-y-4" onSubmit={handleSubmit}>
        <AsyncSelect
          label="سریال"
          value={serialId}
          selectedLabel={serialLabel}
          onChange={handleSerialPick}
          search={searchSerials}
          error={errors.serial_number}
          placeholder="جست‌وجوی سریال دستگاه موجود…"
          emptyText="سریال موجودی یافت نشد."
          hint="اختیاری؛ با انتخاب سریال، کالا به‌صورت خودکار پر می‌شود."
        />
        <AsyncSelect
          label="کالا"
          required
          value={productId}
          selectedLabel={productLabel}
          onChange={(value, option) => {
            setProductId(value)
            setProductLabel(option?.label ?? '')
            if (value !== productId) {
              setSerialId(null)
              setSerialLabel('')
            }
          }}
          search={searchAvailableProducts}
          error={errors.product}
          placeholder="جست‌وجو در کالاهای موجود…"
        />
        <TextArea
          label="علت خرابی"
          required
          value={reason}
          onChange={setReason}
          error={errors.reason}
          rows={3}
          placeholder="مثلاً شکستگی بدنه، نقص کارخانه، آب‌خوردگی…"
        />
        <DatePicker
          label="تاریخ ثبت"
          value={registeredAt}
          onChange={setRegisteredAt}
          error={errors.registered_at?.[0]}
        />
        <TextArea
          label="توضیحات"
          value={description}
          onChange={setDescription}
          error={errors.description}
          rows={3}
          placeholder="اختیاری"
        />
      </form>
    </Modal>
  )
}
