import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Camera,
  Eye,
  Hand,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { Badge, ORDER_STATUS_TONES, PAYMENT_STATUS_TONES } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { SelectInput, Switch } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard, Tabs } from '@/components/ui/Misc'
import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { searchPartiesForOrder } from '@/components/ui/selectors'
import { OrderFormModal } from '@/pages/orders/OrderFormModal'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ordersApi } from '@/services/endpoints'
import { formatCompactMoney, formatQuantity, toPersianDigits } from '@/utils/format'
import type { InvoiceUploadPreview, Order, OrderListItem, OrderType, ParsedInvoice } from '@/types'

type TradeTab = 'manual' | 'automatic'

interface EditableItem {
  key: string
  product_name: string
  quantity: string
  unit_price: string
  product_id: number | null
}

export function TradePage() {
  const { can } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<TradeTab>('manual')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [orderType, setOrderType] = useState('')
  const [status, setStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [defaultType, setDefaultType] = useState<OrderType>('sale')
  const [deleting, setDeleting] = useState<OrderListItem | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const [autoOrderType, setAutoOrderType] = useState<OrderType>('sale')
  const [autoParty, setAutoParty] = useState<number | null>(null)
  const [autoPartyLabel, setAutoPartyLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<ParsedInvoice | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [savingAuto, setSavingAuto] = useState(false)
  const [createMissingProducts, setCreateMissingProducts] = useState(true)
  const [editItems, setEditItems] = useState<EditableItem[]>([])

  const partySearch = useCallback(
    (term: string) => searchPartiesForOrder(term, autoOrderType),
    [autoOrderType],
  )

  const handleAutoOrderTypeChange = (value: OrderType) => {
    setAutoOrderType(value)
    setAutoParty(null)
    setAutoPartyLabel('')
  }

  const { data: options } = useAsync(() => ordersApi.options(), [])
  const { data: summary, reload: reloadSummary } = useAsync(() => ordersApi.summary(), [])

  const list = usePaginatedList<OrderListItem>((params) => ordersApi.list(params), {
    pageSize: 15,
  })

  useEffect(() => {
    list.updateFilters({
      search: debouncedSearch || null,
      order_type: orderType || null,
      status: status || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, orderType, status])

  const refresh = () => {
    list.reload()
    reloadSummary()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await ordersApi.remove(deleting.id)
      toast.success('سفارش حذف شد.')
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'حذف سفارش انجام نشد.')
    } finally {
      setDeletingBusy(false)
    }
  }

  const handleFileSelect = async (file: File | null) => {
    if (!file) return
    setPreviewImage(URL.createObjectURL(file))
    setPreviewFile(file)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('order_type', autoOrderType)
      form.append('confirm', 'false')
      if (autoParty) form.append('party', String(autoParty))

      const result = await ordersApi.uploadInvoice(form)
      if ('parsed' in result) {
        const parsed = (result as InvoiceUploadPreview).parsed
        setPreview(parsed)
        setEditItems(
          parsed.items.length > 0
            ? parsed.items.map((item, idx) => ({
                key: `${Date.now()}-${idx}`,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                product_id: item.product_id,
              }))
            : [{ key: `${Date.now()}`, product_name: '', quantity: '1', unit_price: '', product_id: null }],
        )
        if (parsed.items.length === 0) {
          toast.warning('ردیفی شناسایی نشد. لطفاً ردیف‌ها را دستی وارد کنید.')
        } else {
          toast.success('فاکتور تحلیل شد. ردیف‌ها را بررسی و در صورت نیاز ویرایش کنید.')
        }
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'تحلیل فاکتور انجام نشد.')
      setPreview(null)
      setPreviewFile(null)
      setPreviewImage(null)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const saveAutomatic = async () => {
    if (!previewFile) return
    const validItems = editItems.filter(
      (item) => item.product_name.trim() && item.quantity && item.unit_price,
    )
    if (validItems.length === 0) {
      toast.error('حداقل یک ردیف کالا با نام، تعداد و قیمت وارد کنید.')
      return
    }
    setSavingAuto(true)
    try {
      const form = new FormData()
      form.append('image', previewFile)
      form.append('order_type', autoOrderType)
      form.append('confirm', 'true')
      form.append('create_missing_products', createMissingProducts ? 'true' : 'false')
      form.append(
        'items',
        JSON.stringify(
          validItems.map((item) => ({
            product_name: item.product_name.trim(),
            quantity: item.quantity,
            unit_price: item.unit_price,
            product_id: item.product_id,
          })),
        ),
      )
      if (autoParty) form.append('party', String(autoParty))
      else if (preview?.party_id) form.append('party', String(preview.party_id))

      const order = (await ordersApi.uploadInvoice(form)) as Order
      toast.success(`سفارش ${toPersianDigits(order.number)} ثبت شد.`)
      setPreview(null)
      setPreviewFile(null)
      setPreviewImage(null)
      setEditItems([])
      setConfirmOpen(false)
      setTab('manual')
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ثبت سفارش انجام نشد.')
    } finally {
      setSavingAuto(false)
    }
  }

  const columns: Array<Column<OrderListItem>> = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <div>
          <Link
            to={`/orders/${row.id}`}
            className="num font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            {toPersianDigits(row.number)}
          </Link>
          <span className="mt-0.5 block text-xs text-ink-400">{row.order_type_display}</span>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'روش ثبت',
      render: (row) => (
        <Badge tone={row.entry_mode === 'automatic' ? 'purple' : 'neutral'}>
          {row.entry_mode_display}
        </Badge>
      ),
    },
    {
      key: 'party',
      header: 'طرف حساب',
      render: (row) => <span className="truncate">{row.party_name}</span>,
    },
    {
      key: 'date',
      header: 'تاریخ',
      render: (row) => <span className="num">{row.order_date_jalali}</span>,
    },
    {
      key: 'amount',
      header: 'مبلغ',
      render: (row) => <Money value={row.total_amount} className="font-semibold" />,
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={ORDER_STATUS_TONES[row.status] ?? 'neutral'}>{row.status_display}</Badge>
          <Badge tone={PAYMENT_STATUS_TONES[row.payment_status] ?? 'neutral'}>
            {row.payment_status_display}
          </Badge>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Link
            to={`/orders/${row.id}`}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
            title="جزئیات"
          >
            <Eye size={16} />
          </Link>
          {can('orders.delete') && row.status === 'draft' && (
            <button
              type="button"
              onClick={() => setDeleting(row)}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              title="حذف"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="خرید و فروش"
        description="ثبت ورود و خروج کالا با روش دستی یا اتوماتیک از روی فاکتور"
        icon={<ShoppingCart size={20} />}
        actions={
          <Link to="/warehouse">
            <Button variant="secondary">آمار انبار</Button>
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="فروش"
          value={formatCompactMoney(summary?.sale.total_amount)}
          hint={`${toPersianDigits(summary?.sale.count ?? 0)} سفارش · ${toPersianDigits(summary?.sale.automatic_count ?? 0)} اتوماتیک`}
          tone="success"
        />
        <StatCard
          label="خرید"
          value={formatCompactMoney(summary?.purchase.total_amount)}
          hint={`${toPersianDigits(summary?.purchase.count ?? 0)} سفارش · ${toPersianDigits(summary?.purchase.manual_count ?? 0)} دستی`}
          tone="brand"
        />
        <StatCard
          label="ثبت اتوماتیک"
          value={toPersianDigits(summary?.automatic_total ?? 0)}
          hint="از روی تصویر فاکتور"
          tone="purple"
        />
        <StatCard
          label="پیش‌نویس‌ها"
          value={toPersianDigits(
            (summary?.sale.draft_count ?? 0) + (summary?.purchase.draft_count ?? 0),
          )}
          hint="در انتظار تأیید"
          tone="warning"
        />
      </div>

      <Card className="mb-5" bodyClassName="!py-3">
        <Tabs
          tabs={[
            { key: 'manual', label: 'ثبت دستی', badge: <Hand size={14} /> },
            { key: 'automatic', label: 'ثبت اتوماتیک', badge: <Sparkles size={14} /> },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Card>

      {tab === 'manual' && (
        <>
          {can('orders.add') && (
            <Card className="mb-5" bodyClassName="!py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-ink-800 dark:text-ink-100">ثبت دستی خرید/فروش</h3>
                  <p className="mt-1 text-sm text-ink-500">
                    اطلاعات سفارش را به‌صورت دستی وارد کنید. پس از تأیید، موجودی انبار و دفتر معین به‌روز می‌شود.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={<ArrowDownToLine size={16} />}
                    onClick={() => {
                      setDefaultType('purchase')
                      setFormOpen(true)
                    }}
                  >
                    ثبت خرید
                  </Button>
                  <Button
                    icon={<ArrowUpFromLine size={16} />}
                    onClick={() => {
                      setDefaultType('sale')
                      setFormOpen(true)
                    }}
                  >
                    ثبت فروش
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'automatic' && can('orders.upload_invoice') && (
        <Card className="mb-5" bodyClassName="!py-5">
          {options?.ocr_capabilities && !options.ocr_capabilities.configured && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">موتور OCR فعال نیست</p>
              <p className="mt-1">
                برای شناسایی خودکار فاکتور، یکی از این دو را راه‌اندازی کنید:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  <strong>OpenAI Vision (پیشنهادی):</strong> کلید API را در فایل{' '}
                  <code className="rounded bg-amber-100 px-1">.env</code> قرار دهید:{' '}
                  <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY=sk-...</code>
                </li>
                <li>
                  <strong>Tesseract (محلی):</strong>{' '}
                  <code className="rounded bg-amber-100 px-1">
                    sudo apt install tesseract-ocr tesseract-ocr-fas
                  </code>
                </li>
              </ul>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 font-semibold text-ink-800 dark:text-ink-100">
                آپلود تصویر فاکتور
              </h3>
              <p className="mb-4 text-sm text-ink-500">
                عکس فاکتور خرید یا فروش را آپلود کنید. سیستم اطلاعات را استخراج کرده و پس از بررسی شما ثبت می‌کند.
              </p>

              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <SelectInput
                  label="نوع عملیات"
                  value={autoOrderType}
                  onChange={(v) => handleAutoOrderTypeChange(v as OrderType)}
                  options={options?.order_types ?? []}
                />
                <div>
                  <label className="label">
                    {autoOrderType === 'purchase' ? 'تأمین‌کننده (اختیاری)' : 'مشتری (اختیاری)'}
                  </label>
                  <AsyncSelect
                    value={autoParty}
                    selectedLabel={autoPartyLabel}
                    onChange={(id, option) => {
                      setAutoParty(id)
                      setAutoPartyLabel(option?.label ?? '')
                    }}
                    search={partySearch}
                    placeholder={
                      autoOrderType === 'purchase'
                        ? 'جست‌وجوی تأمین‌کننده…'
                        : 'جست‌وجوی مشتری…'
                    }
                  />
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFileSelect(e.target.files?.[0] ?? null)}
              />
              <Button
                icon={<Camera size={16} />}
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                انتخاب و تحلیل فاکتور
              </Button>
            </div>

            {previewImage && (
              <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
                <img src={previewImage} alt="پیش‌نمایش فاکتور" className="max-h-64 w-full object-contain" />
              </div>
            )}
          </div>

          {preview && (
            <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-500/5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">نتیجه استخراج</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.ocr_engine && (
                    <Badge tone="brand">
                      موتور: {preview.ocr_engine === 'openai' ? 'OpenAI Vision' : preview.ocr_engine}
                    </Badge>
                  )}
                  <Badge tone={preview.confidence >= 50 ? 'success' : 'warning'}>
                    اطمینان {toPersianDigits(preview.confidence)}٪
                  </Badge>
                </div>
              </div>

              {preview.warnings.length > 0 && (
                <ul className="mb-3 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                  {preview.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}

              <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-ink-400">طرف حساب: </span>
                  {preview.party_name || '—'}
                </div>
                <div>
                  <span className="text-ink-400">تاریخ: </span>
                  <span className="num">{preview.order_date_jalali}</span>
                </div>
                <div>
                  <span className="text-ink-400">ردیف‌ها: </span>
                  {toPersianDigits(editItems.filter((i) => i.product_name.trim()).length)}
                </div>
              </div>

              {preview && preview.ocr_engine === 'tesseract' && preview.confidence < 60 && (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                  Tesseract برای این نوع فاکتور دقیق نیست. ردیف‌ها را ویرایش کنید یا{' '}
                  <strong>OPENAI_API_KEY</strong> را در سرور تنظیم کنید.
                </div>
              )}

              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  ردیف‌های کالا (قابل ویرایش)
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={14} />}
                  onClick={() =>
                    setEditItems((current) => [
                      ...current,
                      {
                        key: `${Date.now()}-${Math.random()}`,
                        product_name: '',
                        quantity: '1',
                        unit_price: '',
                        product_id: null,
                      },
                    ])
                  }
                >
                  افزودن ردیف
                </Button>
              </div>

              <div className="mb-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-ink-500 dark:border-ink-700">
                      <th className="py-2 text-right">نام کالا</th>
                      <th className="w-24 py-2 text-right">تعداد</th>
                      <th className="w-36 py-2 text-right">قیمت واحد</th>
                      <th className="w-12 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((item) => (
                      <tr key={item.key} className="border-b border-ink-100 dark:border-ink-800">
                        <td className="py-2 pe-2">
                          <input
                            className="input w-full min-w-[180px] text-sm"
                            value={item.product_name}
                            placeholder="نام کالا…"
                            onChange={(e) =>
                              setEditItems((current) =>
                                current.map((row) =>
                                  row.key === item.key
                                    ? { ...row, product_name: e.target.value, product_id: null }
                                    : row,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="py-2 pe-2">
                          <input
                            className="input num w-full text-sm"
                            value={item.quantity}
                            inputMode="decimal"
                            onChange={(e) =>
                              setEditItems((current) =>
                                current.map((row) =>
                                  row.key === item.key ? { ...row, quantity: e.target.value } : row,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="py-2 pe-2">
                          <input
                            className="input num w-full text-sm"
                            value={item.unit_price}
                            inputMode="decimal"
                            placeholder="ریال"
                            onChange={(e) =>
                              setEditItems((current) =>
                                current.map((row) =>
                                  row.key === item.key ? { ...row, unit_price: e.target.value } : row,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                            onClick={() =>
                              setEditItems((current) => current.filter((row) => row.key !== item.key))
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {can('orders.add') && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Switch
                    label="ایجاد خودکار کالاهای جدید"
                    checked={createMissingProducts}
                    onChange={setCreateMissingProducts}
                    hint="کالاهایی که در انبار نیستند، هنگام ثبت ساخته می‌شوند"
                  />
                  <Button
                    icon={<Plus size={16} />}
                    onClick={() => setConfirmOpen(true)}
                    disabled={!autoParty && !preview?.party_id}
                  >
                    ثبت پیش‌نویس سفارش
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4" bodyClassName="!py-4">
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <div>
            <label className="label">جست‌وجو</label>
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pr-9"
                placeholder="شماره یا طرف حساب…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <SelectInput
            label="نوع"
            value={orderType}
            onChange={setOrderType}
            options={[{ value: '', label: 'همه' }, ...(options?.order_types ?? [])]}
          />
          <SelectInput
            label="وضعیت"
            value={status}
            onChange={setStatus}
            options={[{ value: '', label: 'همه' }, ...(options?.statuses ?? [])]}
          />
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={list.items}
        loading={list.loading}
        rowKey={(r) => r.id}
        footer={
          <Pagination
            page={list.page}
            numPages={list.numPages}
            count={list.count}
            pageSize={list.pageSize}
            onChange={list.setPage}
          />
        }
      />

      <OrderFormModal
        open={formOpen}
        defaultType={defaultType}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="حذف سفارش"
        message={
          deleting
            ? `سفارش ${toPersianDigits(deleting.number)} حذف شود؟`
            : ''
        }
        confirmLabel="حذف"
        danger
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="ثبت سفارش از فاکتور"
        message="پیش‌نویس سفارش با اطلاعات استخراج‌شده ایجاد می‌شود. پس از بررسی می‌توانید آن را تأیید کنید."
        confirmLabel="ثبت"
        loading={savingAuto}
        onConfirm={() => void saveAutomatic()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
