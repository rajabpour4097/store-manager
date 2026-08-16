import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { NumberInput, SelectInput, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { searchPartiesForOrder, searchProducts, searchSerials } from '@/components/ui/selectors'
import { ProductFormModal } from '@/pages/catalog/ProductFormModal'
import { PartyFormModal } from '@/pages/parties/PartyFormModal'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { catalogApi, ordersApi, partiesApi } from '@/services/endpoints'
import { formatMoney, toLatinDigits, toNumber } from '@/utils/format'
import { todayIso } from '@/utils/jalali'
import type { OrderType } from '@/types'

interface LineItem {
  key: string
  product: number | null
  productLabel: string
  serial: string
  serialId: number | null
  quantity: string
  unit_price: string
  discount_amount: string
}

interface OrderFormModalProps {
  open: boolean
  defaultType?: OrderType
  onClose: () => void
  onSaved: (orderId?: number) => void
}

function emptyLine(): LineItem {
  return {
    key: `${Date.now()}-${Math.random()}`,
    product: null,
    productLabel: '',
    serial: '',
    serialId: null,
    quantity: '1',
    unit_price: '',
    discount_amount: '0',
  }
}

export function OrderFormModal({
  open,
  defaultType = 'sale',
  onClose,
  onSaved,
}: OrderFormModalProps) {
  const toast = useToast()
  const { can } = useAuth()
  const [orderType, setOrderType] = useState<OrderType>(defaultType)
  const [party, setParty] = useState<number | null>(null)
  const [partyLabel, setPartyLabel] = useState('')
  const [orderDate, setOrderDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState('')
  const [discount, setDiscount] = useState('0')
  const [taxPercent, setTaxPercent] = useState('0')
  const [shipping, setShipping] = useState('0')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<LineItem[]>([emptyLine()])
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [partyFormOpen, setPartyFormOpen] = useState(false)
  const [productFormOpen, setProductFormOpen] = useState(false)
  const [productFormLineKey, setProductFormLineKey] = useState<string | null>(null)

  const { data: partyTypes } = useAsync(() => partiesApi.types(), [])
  const { data: catalogOptions } = useAsync(() => catalogApi.options(), [])
  const { data: categories } = useAsync(
    () => catalogApi.categories({ page_size: 200 }),
    [],
  )

  useEffect(() => {
    if (!open) return
    setOrderType(defaultType)
    setParty(null)
    setPartyLabel('')
    setOrderDate(todayIso())
    setDueDate('')
    setDiscount('0')
    setTaxPercent('0')
    setShipping('0')
    setDescription('')
    setItems([emptyLine()])
    setErrors({})
    setPartyFormOpen(false)
    setProductFormOpen(false)
    setProductFormLineKey(null)
  }, [open, defaultType])

  const partySearch = useCallback(
    (term: string) => searchPartiesForOrder(term, orderType),
    [orderType],
  )

  const handleOrderTypeChange = (value: OrderType) => {
    setOrderType(value)
    setParty(null)
    setPartyLabel('')
    setItems([emptyLine()])
  }

  const subtotal = items.reduce((sum, item) => {
    if (!item.product) return sum
    return (
      sum +
      Math.max(0, toNumber(item.quantity) * toNumber(item.unit_price) - toNumber(item.discount_amount))
    )
  }, 0)
  const tax = (Math.max(0, subtotal - toNumber(discount)) * toNumber(taxPercent)) / 100
  const total = Math.max(0, subtotal - toNumber(discount) + tax + toNumber(shipping))

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const handleProductPick = async (key: string, productId: number | null, label: string) => {
    updateItem(key, {
      product: productId,
      productLabel: label,
      ...(orderType === 'sale' ? { serial: '', serialId: null } : {}),
    })
    if (!productId) return
    try {
      const product = await catalogApi.product(productId)
      updateItem(key, {
        product: productId,
        productLabel: product.name,
        unit_price: String(
          toNumber(orderType === 'sale' ? product.sale_price : product.purchase_price),
        ),
      })
    } catch {
      /* ignore */
    }
  }

  const handleSerialPick = async (
    key: string,
    serialId: number | null,
    option: { label: string; meta?: Record<string, unknown> } | null,
  ) => {
    if (serialId === null || !option) {
      updateItem(key, { serial: '', serialId: null })
      return
    }
    const productId = Number(option.meta?.productId ?? 0) || null
    const productName = String(option.meta?.productName ?? '')
    const serial = String(option.meta?.serialNumber ?? option.label)
    const salePrice = option.meta?.salePrice
    updateItem(key, {
      serialId,
      serial,
      product: productId,
      productLabel: productName,
      quantity: '1',
      ...(salePrice != null && salePrice !== ''
        ? { unit_price: String(toNumber(String(salePrice))) }
        : {}),
    })
    if (!productId) return
    try {
      const product = await catalogApi.product(productId)
      updateItem(key, {
        product: productId,
        productLabel: product.name,
        unit_price: String(toNumber(product.sale_price)),
      })
    } catch {
      /* ignore */
    }
  }

  const openProductForm = (lineKey: string) => {
    setProductFormLineKey(lineKey)
    setProductFormOpen(true)
  }

  const productFormDefaults = productFormLineKey
    ? items.find((item) => item.key === productFormLineKey)
    : null

  const defaultPartyType = orderType === 'purchase' ? 'supplier' : 'customer'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const localErrors: Record<string, string[]> = {}
    if (!party) localErrors.party = ['طرف حساب الزامی است.']
    if (!orderDate) localErrors.order_date = ['تاریخ سفارش الزامی است.']
    const validItems = items.filter((item) => item.product)
    if (validItems.length === 0) localErrors.items = ['حداقل یک قلم کالا اضافه کنید.']
    const serials = validItems
      .map((item) => item.serial.trim().toLowerCase())
      .filter(Boolean)
    if (new Set(serials).size !== serials.length) {
      localErrors.items = ['سریال تکراری در اقلام سفارش وجود دارد.']
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      return
    }

    setSaving(true)
    try {
      const order = await ordersApi.create({
        order_type: orderType,
        party,
        order_date: orderDate,
        due_date: dueDate || null,
        discount_amount: discount || '0',
        tax_percent: taxPercent || '0',
        shipping_amount: shipping || '0',
        description: description.trim(),
        items: validItems.map((item) => ({
          product: item.product,
          quantity: '1',
          unit_price: item.unit_price || '0',
          discount_amount: item.discount_amount || '0',
          serial_number: toLatinDigits(item.serial).trim(),
        })),
      })
      toast.success('سفارش ثبت شد.')
      onClose()
      onSaved(order.id)
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        setErrors(error.fieldErrors)
      }
      toast.error(error instanceof ApiError ? error.message : 'ثبت سفارش انجام نشد.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت سفارش جدید"
      subtitle="اقلام، طرف حساب و شرایط پرداخت را مشخص کنید"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={saving} onClick={handleSubmit}>
            ثبت سفارش
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectInput
            label="نوع سفارش"
            required
            value={orderType}
            onChange={(value) => handleOrderTypeChange(value as OrderType)}
            options={[
              { value: 'sale', label: 'فروش' },
              { value: 'purchase', label: 'خرید' },
            ]}
          />
          <AsyncSelect
            label={orderType === 'purchase' ? 'تأمین‌کننده' : 'مشتری'}
            required
            value={party}
            selectedLabel={partyLabel}
            onChange={(value, option) => {
              setParty(value)
              setPartyLabel(option?.label ?? '')
            }}
            search={partySearch}
            placeholder={orderType === 'purchase' ? 'جست‌وجوی تأمین‌کننده…' : 'جست‌وجوی مشتری…'}
            error={errors.party}
            onCreateNew={can('parties.add') ? () => setPartyFormOpen(true) : undefined}
            createLabel={
              orderType === 'purchase' ? 'ثبت تأمین‌کننده جدید' : 'ثبت مشتری جدید'
            }
          />
          <DatePicker
            label="تاریخ سفارش"
            required
            value={orderDate}
            onChange={setOrderDate}
            error={errors.order_date}
          />
          <DatePicker label="سرسید پرداخت" value={dueDate} onChange={setDueDate} />
        </div>

        <div className="rounded-2xl border border-ink-200 dark:border-ink-700">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
            <div>
              <p className="text-sm font-semibold">اقلام سفارش</p>
              <p className="mt-0.5 text-xs text-ink-400">
                {orderType === 'purchase'
                  ? 'سریال اختیاری است؛ اگر وارد شود باید یکتا باشد. موجودی بر اساس نام و مدل کالا شمرده می‌شود.'
                  : 'سریال اختیاری است. با جست‌وجوی سریال می‌توانید دستگاه موجود را سریع‌تر پیدا کنید.'}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={() => setItems((current) => [...current, emptyLine()])}
            >
              قلم جدید
            </Button>
          </div>
          <div className="space-y-3 p-4">
            {items.map((item, index) => (
              <div
                key={item.key}
                className="grid gap-3 rounded-xl bg-ink-50/70 p-3 dark:bg-ink-800/40 lg:grid-cols-[1.5fr_1.15fr_0.9fr_0.75fr_auto]"
              >
                <AsyncSelect
                  label={index === 0 ? 'کالا' : undefined}
                  value={item.product}
                  selectedLabel={item.productLabel}
                  onChange={(value, option) =>
                    void handleProductPick(item.key, value, option?.label ?? '')
                  }
                  search={searchProducts}
                  onCreateNew={
                    can('catalog.add') ? () => openProductForm(item.key) : undefined
                  }
                  createLabel="ثبت کالای جدید"
                />
                {orderType === 'sale' ? (
                  <AsyncSelect
                    label={index === 0 ? 'سریال' : undefined}
                    value={item.serialId}
                    selectedLabel={item.serial}
                    onChange={(value, option) => void handleSerialPick(item.key, value, option)}
                    search={searchSerials}
                    placeholder="جست‌وجوی سریال (اختیاری)"
                    emptyText="سریال موجودی یافت نشد."
                  />
                ) : (
                  <TextInput
                    label={index === 0 ? 'سریال' : undefined}
                    value={item.serial}
                    onChange={(value) => updateItem(item.key, { serial: value, serialId: null })}
                    placeholder="اختیاری"
                    dir="ltr"
                    className="font-mono text-sm"
                  />
                )}
                <NumberInput
                  label={index === 0 ? 'فی (ریال)' : undefined}
                  value={item.unit_price}
                  onChange={(value) => updateItem(item.key, { unit_price: value })}
                />
                <NumberInput
                  label={index === 0 ? 'تخفیف' : undefined}
                  value={item.discount_amount}
                  onChange={(value) => updateItem(item.key, { discount_amount: value })}
                />
                <div className={index === 0 ? 'pt-7' : ''}>
                  <button
                    type="button"
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) => current.filter((row) => row.key !== item.key))
                    }
                    className="rounded-lg p-2 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {errors.items && <p className="text-xs text-rose-600">{errors.items[0]}</p>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberInput label="تخفیف کل" value={discount} onChange={setDiscount} />
          <NumberInput label="مالیات (٪)" value={taxPercent} onChange={setTaxPercent} />
          <NumberInput label="هزینه ارسال" value={shipping} onChange={setShipping} />
          <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-500/10">
            <p className="text-xs text-ink-500">جمع کل</p>
            <p className="mt-1 text-lg font-bold text-brand-700 dark:text-brand-200">
              {formatMoney(total)}
            </p>
          </div>
        </div>

        <TextArea
          label="توضیحات"
          value={description}
          onChange={setDescription}
          rows={2}
          placeholder="یادداشت اختیاری…"
        />
      </form>

      <PartyFormModal
        open={partyFormOpen}
        types={partyTypes ?? []}
        defaultPartyType={defaultPartyType}
        onClose={() => setPartyFormOpen(false)}
        onSaved={(created) => {
          setParty(created.id)
          setPartyLabel(created.name)
        }}
      />

      <ProductFormModal
        open={productFormOpen}
        product={null}
        units={catalogOptions?.units ?? []}
        categories={categories?.results ?? []}
        defaultName={productFormDefaults?.productLabel}
        defaultSalePrice={
          orderType === 'sale' ? productFormDefaults?.unit_price : undefined
        }
        defaultPurchasePrice={
          orderType === 'purchase' ? productFormDefaults?.unit_price : undefined
        }
        onClose={() => {
          setProductFormOpen(false)
          setProductFormLineKey(null)
        }}
        onSaved={(created) => {
          if (productFormLineKey) {
            void handleProductPick(productFormLineKey, created.id, created.name)
          }
        }}
      />
    </Modal>
  )
}
