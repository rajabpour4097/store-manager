import { useEffect, useState } from 'react'
import {
  Boxes,
  History,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'

import { Badge, STOCK_STATE_TONES } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { SelectInput } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Money, PageHeader, ProgressBar, StatCard, Tabs } from '@/components/ui/Misc'
import { ProductFormModal } from './ProductFormModal'
import { CategoryFormModal } from './CategoryFormModal'
import { StockAdjustModal } from './StockAdjustModal'
import { ProductMovementsModal } from './ProductMovementsModal'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { catalogApi } from '@/services/endpoints'
import { formatCompactMoney, formatPercent, formatQuantity, toNumber, toPersianDigits } from '@/utils/format'
import type { Product, ProductCategory } from '@/types'

const STOCK_STATES = [
  { value: 'out_of_stock', label: 'ناموجود' },
  { value: 'low', label: 'زیر نقطه سفارش' },
  { value: 'ok', label: 'موجودی مناسب' },
]

export function ProductsPage() {
  const { can } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState<'products' | 'categories'>('products')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [category, setCategory] = useState('')
  const [stockState, setStockState] = useState('')
  const [activeFilter, setActiveFilter] = useState('')

  const [productModal, setProductModal] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  })
  const [categoryModal, setCategoryModal] = useState<{
    open: boolean
    category: ProductCategory | null
  }>({ open: false, category: null })
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [movementsProduct, setMovementsProduct] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState<
    { kind: 'product' | 'category'; id: number; title: string } | null
  >(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const { data: options } = useAsync(() => catalogApi.options(), [])
  const { data: summary, reload: reloadSummary } = useAsync(() => catalogApi.summary(), [])
  const { data: categories, reload: reloadCategories } = useAsync(
    () => catalogApi.categories({ page_size: 200 }),
    [],
  )

  const list = usePaginatedList<Product>((params) => catalogApi.products(params), { pageSize: 20 })

  useEffect(() => {
    list.updateFilters({
      search: debouncedSearch || null,
      category: category || null,
      stock_state: stockState || null,
      is_active: activeFilter || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, stockState, activeFilter])

  const refresh = () => {
    list.reload()
    reloadSummary()
    reloadCategories()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      if (deleting.kind === 'product') await catalogApi.removeProduct(deleting.id)
      else await catalogApi.removeCategory(deleting.id)
      toast.success('حذف انجام شد.')
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'حذف انجام نشد.')
    } finally {
      setDeletingBusy(false)
    }
  }

  const productColumns: Array<Column<Product>> = [
    {
      key: 'name',
      header: 'کالا',
      render: (row) => (
        <div>
          <span className="block truncate font-medium">{row.name}</span>
          <span className="num block text-xs text-ink-400">
            {row.sku}
            {row.category_name ? ` · ${row.category_name}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'موجودی',
      render: (row) => {
        const stock = toNumber(row.stock_quantity)
        const reorder = toNumber(row.reorder_point)
        const ratio = reorder > 0 ? (stock / (reorder * 2)) * 100 : stock > 0 ? 100 : 0
        return (
          <div className="min-w-28">
            <div className="flex items-center justify-between gap-2">
              <span className="num text-sm font-semibold">
                {formatQuantity(row.stock_quantity, row.unit_display)}
              </span>
              <Badge tone={STOCK_STATE_TONES[row.stock_state] ?? 'neutral'}>
                {row.stock_state_display}
              </Badge>
            </div>
            <ProgressBar
              className="mt-1.5"
              value={ratio}
              tone={row.stock_state === 'ok' ? 'success' : row.stock_state === 'low' ? 'warning' : 'danger'}
            />
            <span className="mt-1 block text-[11px] text-ink-400">
              نقطه سفارش: {formatQuantity(row.reorder_point)}
            </span>
          </div>
        )
      },
    },
    {
      key: 'prices',
      header: 'قیمت خرید / فروش',
      render: (row) => (
        <div className="text-xs">
          <span className="block">
            خرید: <Money value={row.purchase_price} />
          </span>
          <span className="block">
            فروش: <Money value={row.sale_price} className="font-semibold" />
          </span>
          <span className="block text-ink-400">حاشیه: {formatPercent(row.profit_margin)}</span>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'ارزش موجودی',
      render: (row) => <Money value={row.stock_value} className="font-semibold" />,
    },
    {
      key: 'supplier',
      header: 'تأمین‌کننده',
      render: (row) => (
        <div className="text-xs">
          <span className="block">{row.supplier_name || '—'}</span>
          <span className="block text-ink-400">
            زمان تأمین: {toPersianDigits(row.lead_time_days)} روز
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setMovementsProduct(row)}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
            title="گردش انبار"
          >
            <History size={16} />
          </button>
          {can('catalog.change') && (
            <>
              <button
                type="button"
                onClick={() => setAdjustProduct(row)}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10"
                title="اصلاح موجودی"
              >
                <SlidersHorizontal size={16} />
              </button>
              <button
                type="button"
                onClick={() => setProductModal({ open: true, product: row })}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
                title="ویرایش"
              >
                <Pencil size={16} />
              </button>
            </>
          )}
          {can('catalog.delete') && (
            <button
              type="button"
              onClick={() => setDeleting({ kind: 'product', id: row.id, title: row.name })}
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

  const categoryColumns: Array<Column<ProductCategory>> = [
    {
      key: 'name',
      header: 'نام دسته',
      render: (row) => (
        <div>
          <span className="block font-medium">{row.name}</span>
          {row.parent_name && <span className="block text-xs text-ink-400">زیرمجموعه {row.parent_name}</span>}
        </div>
      ),
    },
    {
      key: 'count',
      header: 'تعداد کالا',
      render: (row) => <span className="num">{toPersianDigits(row.products_count ?? 0)}</span>,
    },
    {
      key: 'description',
      header: 'توضیحات',
      render: (row) => <span className="text-xs text-ink-500">{row.description || '—'}</span>,
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <Badge tone={row.is_active ? 'success' : 'neutral'}>
          {row.is_active ? 'فعال' : 'غیرفعال'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          {can('catalog.change') && (
            <button
              type="button"
              onClick={() => setCategoryModal({ open: true, category: row })}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              title="ویرایش"
            >
              <Pencil size={16} />
            </button>
          )}
          {can('catalog.delete') && (
            <button
              type="button"
              onClick={() => setDeleting({ kind: 'category', id: row.id, title: row.name })}
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
        title="کالاها و موجودی انبار"
        description="مدیریت کالاها، قیمت‌ها، نقطه سفارش و گردش انبار"
        icon={<Boxes size={20} />}
        actions={
          can('catalog.add') && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={<Layers size={16} />}
                onClick={() => setCategoryModal({ open: true, category: null })}
              >
                دسته‌بندی جدید
              </Button>
              <Button
                icon={<Plus size={16} />}
                onClick={() => setProductModal({ open: true, product: null })}
              >
                کالای جدید
              </Button>
            </div>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ارزش موجودی انبار"
          value={formatCompactMoney(summary?.stock_value)}
          hint={`ارزش فروش: ${formatCompactMoney(summary?.retail_value)}`}
          tone="brand"
        />
        <StatCard
          label="کالاهای فعال"
          value={`${toPersianDigits(summary?.active_products ?? 0)} کالا`}
          hint={`از مجموع ${toPersianDigits(summary?.total_products ?? 0)} کالا`}
          tone="purple"
        />
        <StatCard
          label="زیر نقطه سفارش"
          value={`${toPersianDigits(summary?.low_stock ?? 0)} کالا`}
          hint="نیازمند سفارش خرید"
          tone="warning"
        />
        <StatCard
          label="ناموجود"
          value={`${toPersianDigits(summary?.out_of_stock ?? 0)} کالا`}
          hint={`${toPersianDigits(summary?.categories ?? 0)} دسته‌بندی`}
          tone="danger"
        />
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[
            { key: 'products', label: 'کالاها', badge: toPersianDigits(list.count) },
            {
              key: 'categories',
              label: 'دسته‌بندی‌ها',
              badge: toPersianDigits(categories?.count ?? 0),
            },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'products' ? (
        <>
          <Card className="mb-4" bodyClassName="!py-4">
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">جست‌وجو</label>
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
                  />
                  <input
                    className="input pr-9"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="نام، کد کالا، بارکد…"
                  />
                </div>
              </div>
              <SelectInput
                label="دسته‌بندی"
                value={category}
                onChange={setCategory}
                options={(categories?.results ?? []).map((item) => ({
                  value: item.id,
                  label: item.full_name || item.name,
                }))}
                placeholder="همه دسته‌ها"
              />
              <SelectInput
                label="وضعیت موجودی"
                value={stockState}
                onChange={setStockState}
                options={STOCK_STATES}
                placeholder="همه"
              />
              <SelectInput
                label="وضعیت کالا"
                value={activeFilter}
                onChange={setActiveFilter}
                options={[
                  { value: 'true', label: 'فقط فعال' },
                  { value: 'false', label: 'فقط غیرفعال' },
                ]}
                placeholder="همه"
              />
            </div>
            {(search || category || stockState || activeFilter) && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} />}
                  onClick={() => {
                    setSearch('')
                    setCategory('')
                    setStockState('')
                    setActiveFilter('')
                  }}
                >
                  پاک کردن فیلترها
                </Button>
              </div>
            )}
          </Card>

          <DataTable
            columns={productColumns}
            rows={list.items}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            emptyMessage="کالایی با این مشخصات یافت نشد."
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
        </>
      ) : (
        <DataTable
          columns={categoryColumns}
          rows={categories?.results ?? []}
          rowKey={(row) => row.id}
          emptyMessage="دسته‌بندی‌ای ثبت نشده است."
        />
      )}

      <ProductFormModal
        open={productModal.open}
        product={productModal.product}
        units={options?.units ?? []}
        categories={categories?.results ?? []}
        onClose={() => setProductModal({ open: false, product: null })}
        onSaved={refresh}
      />

      <CategoryFormModal
        open={categoryModal.open}
        category={categoryModal.category}
        categories={categories?.results ?? []}
        onClose={() => setCategoryModal({ open: false, category: null })}
        onSaved={refresh}
      />

      <StockAdjustModal
        open={adjustProduct !== null}
        product={adjustProduct}
        reasons={options?.movement_reasons ?? []}
        onClose={() => setAdjustProduct(null)}
        onSaved={refresh}
      />

      <ProductMovementsModal
        open={movementsProduct !== null}
        product={movementsProduct}
        onClose={() => setMovementsProduct(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف"
        message={deleting ? `«${deleting.title}» حذف شود؟` : ''}
        confirmLabel="حذف کن"
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
