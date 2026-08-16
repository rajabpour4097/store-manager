import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectInput, TextArea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { catalogApi } from '@/services/endpoints'
import { toPersianDigits } from '@/utils/format'
import { todayIso } from '@/utils/jalali'
import type { ProductDefect, ProductDefectStatus } from '@/types'

interface DefectStatusModalProps {
  open: boolean
  defect: ProductDefect | null
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'خراب' },
  { value: 'repaired', label: 'درست شده' },
]

export function DefectStatusModal({ open, defect, onClose, onSaved }: DefectStatusModalProps) {
  const toast = useToast()
  const { can } = useAuth()
  const canEdit = can('catalog.change')

  const [status, setStatus] = useState<ProductDefectStatus>('open')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [lastFollowUpAt, setLastFollowUpAt] = useState(todayIso())
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !defect) return
    setStatus(defect.status)
    setReason(defect.reason)
    setDescription(defect.description)
    setLastFollowUpAt(defect.last_follow_up_at || todayIso())
    setErrors({})
  }, [open, defect])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!defect || !canEdit) return
    if (!reason.trim()) {
      setErrors({ reason: ['علت خرابی را وارد کنید.'] })
      return
    }

    setSaving(true)
    try {
      if (status === 'repaired' && defect.status !== 'repaired') {
        await catalogApi.repairDefect(defect.id, {
          reason: reason.trim(),
          last_follow_up_at: lastFollowUpAt,
          description: description.trim(),
          repaired_at: todayIso(),
        })
        toast.success(
          defect.serial_number
            ? 'دستگاه درست‌شده ثبت شد و سریال به موجودی قابل‌فروش بازگشت.'
            : 'کالا درست‌شده ثبت شد و به آمار موجودی بازگشت.',
        )
      } else {
        await catalogApi.updateDefect(defect.id, {
          status,
          reason: reason.trim(),
          description: description.trim(),
          last_follow_up_at: lastFollowUpAt,
        })
        toast.success(
          status === 'open' && defect.status === 'repaired'
            ? defect.serial_number
              ? 'دستگاه دوباره خراب ثبت شد و سریال از فروش کنار گذاشته شد.'
              : 'کالا دوباره خراب ثبت شد و از آمار موجودی کنار گذاشته شد.'
            : 'وضعیت خرابی به‌روزرسانی شد.',
        )
      }
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('به‌روزرسانی انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="وضعیت کالای خراب"
      subtitle={
        defect
          ? `${defect.product_name}${defect.product_sku ? ` · ${defect.product_sku}` : ''}${
              defect.serial_number ? ` · ${defect.serial_number}` : ''
            }`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            بستن
          </Button>
          {canEdit && (
            <Button type="submit" form="defect-status-form" loading={saving}>
              ذخیره تغییرات
            </Button>
          )}
        </>
      }
    >
      {defect && (
        <form id="defect-status-form" className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 rounded-xl border border-ink-100 bg-ink-50/70 p-4 text-sm dark:border-ink-800 dark:bg-ink-950/40 sm:grid-cols-2">
            <div>
              <p className="text-xs text-ink-400">شماره سریال</p>
              <p className="num mt-1 font-medium font-mono" dir="ltr">
                {defect.serial_number || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-400">شرکت خریداری‌شده</p>
              <p className="mt-1 font-medium">{defect.supplier_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-400">وضعیت فعلی</p>
              <div className="mt-1">
                <Badge tone={defect.status === 'open' ? 'danger' : 'success'}>
                  {defect.status_display}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-ink-400">تاریخ ثبت</p>
              <p className="num mt-1 font-medium">
                {toPersianDigits(defect.registered_at_jalali || '—')}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-400">تاریخ درست شدن</p>
              <p className="num mt-1 font-medium">
                {toPersianDigits(defect.repaired_at_jalali || '—')}
              </p>
            </div>
          </div>

          <SelectInput
            label="وضعیت"
            value={status}
            onChange={(value) => setStatus(value as ProductDefectStatus)}
            options={STATUS_OPTIONS}
            disabled={!canEdit}
            error={errors.status}
            hint={
              defect.serial_number
                ? status === 'repaired'
                  ? 'با ثبت درست شدن، این سریال دوباره قابل فروش می‌شود.'
                  : 'تا زمان درست شدن، این سریال از فروش کنار گذاشته می‌شود.'
                : status === 'repaired'
                  ? 'با ثبت درست شدن، کالا دوباره در آمار موجودی لحاظ می‌شود.'
                  : 'تا زمان درست شدن، این کالا در آمار موجودی لحاظ نمی‌شود.'
            }
          />
          <TextArea
            label="علت خرابی"
            required
            value={reason}
            onChange={setReason}
            error={errors.reason}
            rows={3}
            disabled={!canEdit}
          />
          <DatePicker
            label="تاریخ آخرین پیگیری"
            value={lastFollowUpAt}
            onChange={setLastFollowUpAt}
            error={errors.last_follow_up_at?.[0]}
            disabled={!canEdit}
          />
          <TextArea
            label="توضیحات"
            value={description}
            onChange={setDescription}
            error={errors.description}
            rows={3}
            disabled={!canEdit}
          />
        </form>
      )}
    </Modal>
  )
}
