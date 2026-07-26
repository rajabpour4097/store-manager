import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { NumberInput, SelectInput, TextArea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { catalogApi } from '@/services/endpoints'
import { formatQuantity, toNumber } from '@/utils/format'
import { todayIso } from '@/utils/jalali'
import type { Choice, Product } from '@/types'

interface StockAdjustModalProps {
  open: boolean
  product: Product | null
  reasons: Choice[]
  onClose: () => void
  onSaved: () => void
}

export function StockAdjustModal({
  open,
  product,
  reasons,
  onClose,
  onSaved,
}: StockAdjustModalProps) {
  const toast = useToast()
  const [sign, setSign] = useState<1 | -1>(1)
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(todayIso())
  const [reason, setReason] = useState('adjustment')
  const [unitCost, setUnitCost] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSign(1)
    setQuantity('')
    setDate(todayIso())
    setReason('adjustment')
    setUnitCost(product ? String(toNumber(product.purchase_price)) : '')
    setDescription('')
    setErrors({})
  }, [open, product])

  const newStock = product ? toNumber(product.stock_quantity) + sign * toNumber(quantity) : 0

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!product) return
    if (toNumber(quantity) <= 0) {
      setErrors({ quantity: ['مقدار باید بزرگ‌تر از صفر باشد.'] })
      return
    }

    setSaving(true)
    try {
      await catalogApi.adjustStock({
        product: product.id,
        date,
        quantity: String(sign * toNumber(quantity)),
        reason,
        unit_cost: unitCost || '0',
        description: description.trim(),
      })
      toast.success('گردش انبار ثبت شد.')
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت گردش انبار انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="اصلاح موجودی انبار"
      subtitle={
        product
          ? `${product.name} — موجودی فعلی ${formatQuantity(product.stock_quantity, product.unit_display)}`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            ثبت گردش
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">نوع گردش</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSign(1)}
              className={clsx(
                'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                sign === 1
                  ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
                  : 'border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300',
              )}
            >
              <Plus size={15} />
              افزایش موجودی
            </button>
            <button
              type="button"
              onClick={() => setSign(-1)}
              className={clsx(
                'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                sign === -1
                  ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300',
              )}
            >
              <Minus size={15} />
              کاهش موجودی
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput
            label={`مقدار (${product?.unit_display ?? ''})`}
            required
            value={quantity}
            onChange={setQuantity}
            error={errors.quantity}
            thousands={false}
            hint={
              quantity
                ? `موجودی پس از ثبت: ${formatQuantity(newStock, product?.unit_display)}`
                : undefined
            }
          />
          <DatePicker label="تاریخ" value={date} onChange={setDate} clearable={false} />
          <SelectInput
            label="دلیل"
            value={reason}
            onChange={setReason}
            options={reasons.map((item) => ({ value: item.value, label: item.label }))}
            error={errors.reason}
          />
          <NumberInput
            label="بهای واحد (ریال)"
            value={unitCost}
            onChange={setUnitCost}
            error={errors.unit_cost}
            hint="برای محاسبه ارزش گردش"
          />
        </div>

        <TextArea
          label="توضیحات"
          value={description}
          onChange={setDescription}
          error={errors.description}
          rows={2}
        />

        {newStock < 0 && (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-6 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            توجه: با این گردش، موجودی کالا منفی می‌شود.
          </p>
        )}
      </form>
    </Modal>
  )
}
