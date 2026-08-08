import { useEffect, useState } from 'react'

import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { Button } from '@/components/ui/Button'
import { NumberInput, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { searchParties } from '@/components/ui/selectors'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { catalogApi } from '@/services/endpoints'
import { formatMoney, formatPercent, toNumber } from '@/utils/format'
import type { Choice, Product, ProductCategory } from '@/types'

interface ProductFormModalProps {
  open: boolean
  product: Product | null
  units: Choice[]
  categories: ProductCategory[]
  defaultName?: string
  defaultPurchasePrice?: string
  defaultSalePrice?: string
  onClose: () => void
  onSaved: (product: Product) => void
}

export function ProductFormModal({
  open,
  product,
  units,
  categories,
  defaultName,
  defaultPurchasePrice,
  defaultSalePrice,
  onClose,
  onSaved,
}: ProductFormModalProps) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: '',
    barcode: '',
    category: '',
    unit: 'count',
    purchase_price: '',
    sale_price: '',
    reorder_point: '0',
    lead_time_days: '7',
    description: '',
    is_active: true,
  })
  const [supplier, setSupplier] = useState<number | null>(null)
  const [supplierLabel, setSupplierLabel] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      name: product?.name ?? defaultName ?? '',
      barcode: product?.barcode ?? '',
      category: product?.category ? String(product.category) : '',
      unit: product?.unit ?? units[0]?.value ?? 'count',
      purchase_price: product
        ? String(toNumber(product.purchase_price))
        : (defaultPurchasePrice ?? ''),
      sale_price: product ? String(toNumber(product.sale_price)) : (defaultSalePrice ?? ''),
      reorder_point: product ? String(toNumber(product.reorder_point)) : '0',
      lead_time_days: product ? String(product.lead_time_days) : '7',
      description: product?.description ?? '',
      is_active: product?.is_active ?? true,
    })
    setSupplier(product?.default_supplier ?? null)
    setSupplierLabel(product?.supplier_name ?? '')
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, defaultName, defaultPurchasePrice, defaultSalePrice])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const margin =
    toNumber(form.sale_price) > 0
      ? ((toNumber(form.sale_price) - toNumber(form.purchase_price)) / toNumber(form.sale_price)) *
        100
      : 0

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const localErrors: Record<string, string[]> = {}
    if (!form.name.trim()) localErrors.name = ['نام کالا الزامی است.']
    if (toNumber(form.sale_price) <= 0) localErrors.sale_price = ['قیمت فروش را وارد کنید.']
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      return
    }

    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      category: form.category ? Number(form.category) : null,
      unit: form.unit,
      purchase_price: form.purchase_price || '0',
      sale_price: form.sale_price || '0',
      reorder_point: form.reorder_point || '0',
      lead_time_days: Number(form.lead_time_days) || 0,
      default_supplier: supplier,
      description: form.description.trim(),
      is_active: form.is_active,
    }

    setSaving(true)
    try {
      let saved: Product
      if (product) {
        saved = await catalogApi.updateProduct(product.id, payload)
        toast.success('کالا ویرایش شد.')
      } else {
        saved = await catalogApi.createProduct(payload)
        toast.success('کالای جدید ثبت شد.')
      }
      onSaved(saved)
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت کالا انجام نشد.')
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
      title={product ? `ویرایش ${product.name}` : 'ثبت کالای جدید'}
      subtitle={product ? `کد کالا: ${product.sku}` : 'کد کالا به‌صورت خودکار ساخته می‌شود.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {product ? 'ذخیره تغییرات' : 'ثبت کالا'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="نام کالا"
          required
          value={form.name}
          onChange={(value) => set('name', value)}
          error={errors.name}
          wrapClassName="sm:col-span-2"
        />
        <SelectInput
          label="دسته‌بندی"
          value={form.category}
          onChange={(value) => set('category', value)}
          options={categories.map((item) => ({
            value: item.id,
            label: item.full_name || item.name,
          }))}
          placeholder="بدون دسته‌بندی"
          error={errors.category}
        />
        <SelectInput
          label="واحد شمارش"
          value={form.unit}
          onChange={(value) => set('unit', value)}
          options={units.map((item) => ({ value: item.value, label: item.label }))}
          error={errors.unit}
        />
        <NumberInput
          label="قیمت خرید (ریال)"
          value={form.purchase_price}
          onChange={(value) => set('purchase_price', value)}
          error={errors.purchase_price}
          hint={form.purchase_price ? formatMoney(form.purchase_price) : undefined}
        />
        <NumberInput
          label="قیمت فروش (ریال)"
          required
          value={form.sale_price}
          onChange={(value) => set('sale_price', value)}
          error={errors.sale_price}
          hint={
            form.sale_price
              ? `${formatMoney(form.sale_price)} · حاشیه سود ${formatPercent(margin)}`
              : undefined
          }
        />
        <NumberInput
          label="نقطه سفارش"
          value={form.reorder_point}
          onChange={(value) => set('reorder_point', value)}
          error={errors.reorder_point}
          hint="اگر موجودی به این عدد برسد، هشدار و پیشنهاد خرید صادر می‌شود."
          thousands={false}
        />
        <NumberInput
          label="زمان تأمین (روز)"
          value={form.lead_time_days}
          onChange={(value) => set('lead_time_days', value)}
          error={errors.lead_time_days}
          hint="فاصله بین ثبت سفارش و تحویل کالا"
          thousands={false}
        />
        <AsyncSelect
          label="تأمین‌کننده پیش‌فرض"
          value={supplier}
          selectedLabel={supplierLabel}
          onChange={(value, option) => {
            setSupplier(value)
            setSupplierLabel(option?.label ?? '')
          }}
          search={searchParties}
          placeholder="اختیاری"
          error={errors.default_supplier}
        />
        <TextInput
          label="بارکد"
          value={form.barcode}
          onChange={(value) => set('barcode', value)}
          error={errors.barcode}
          className="num text-right"
        />
        {product && (
          <div className="rounded-xl border border-dashed border-ink-300 px-3.5 py-2.5 dark:border-ink-700">
            <p className="text-[11px] text-ink-400">موجودی فعلی</p>
            <p className="num mt-1 text-sm font-semibold">
              {toNumber(product.stock_quantity).toLocaleString('en-US')} {product.unit_display}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400">
              تغییر موجودی از طریق «اصلاح موجودی» یا فاکتورها انجام می‌شود.
            </p>
          </div>
        )}
        <Switch
          label="کالای فعال"
          checked={form.is_active}
          onChange={(checked) => set('is_active', checked)}
        />
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
