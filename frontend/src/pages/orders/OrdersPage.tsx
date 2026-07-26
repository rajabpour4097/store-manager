import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'

import { Badge, ORDER_STATUS_TONES, PAYMENT_STATUS_TONES } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { SelectInput } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { OrderFormModal } from './OrderFormModal'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ordersApi } from '@/services/endpoints'
import { formatCompactMoney, toPersianDigits } from '@/utils/format'
import type { OrderListItem, OrderType } from '@/types'

export function OrdersPage() {
  const { can } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [orderType, setOrderType] = useState('')
  const [status, setStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [defaultType, setDefaultType] = useState<OrderType>('sale')
  const [deleting, setDeleting] = useState<OrderListItem | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

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
      payment_status: paymentStatus || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, orderType, status, paymentStatus])

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
      key: 'party',
      header: 'طرف حساب',
      render: (row) => <span className="truncate">{row.party_name}</span>,
    },
    {
      key: 'date',
      header: 'تاریخ',
      render: (row) => (
        <div>
          <span className="num block">{row.order_date_jalali}</span>
          {row.due_date_jalali && (
            <span className="num block text-xs text-ink-400">سرسید {row.due_date_jalali}</span>
          )}
        </div>
      ),
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
        title="سفارشات"
        description="ثبت و پیگیری سفارش‌های فروش و خرید فروشگاه"
        icon={<ShoppingCart size={20} />}
        actions={
          can('orders.add') && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={<Plus size={16} />}
                onClick={() => {
                  setDefaultType('purchase')
                  setFormOpen(true)
                }}
              >
                سفارش خرید
              </Button>
              <Button
                icon={<Plus size={16} />}
                onClick={() => {
                  setDefaultType('sale')
                  setFormOpen(true)
                }}
              >
                سفارش فروش
              </Button>
            </div>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="فروش‌ها"
          value={formatCompactMoney(summary?.sale.total_amount)}
          hint={`${toPersianDigits(summary?.sale.count ?? 0)} سفارش · باقیمانده ${formatCompactMoney(
            summary?.sale.remaining_amount,
          )}`}
          tone="success"
        />
        <StatCard
          label="خریدها"
          value={formatCompactMoney(summary?.purchase.total_amount)}
          hint={`${toPersianDigits(summary?.purchase.count ?? 0)} سفارش · باقیمانده ${formatCompactMoney(
            summary?.purchase.remaining_amount,
          )}`}
          tone="brand"
        />
        <StatCard
          label="پیش‌نویس‌ها"
          value={toPersianDigits(
            (summary?.sale.draft_count ?? 0) + (summary?.purchase.draft_count ?? 0),
          )}
          hint={`${toPersianDigits(summary?.overdue_count ?? 0)} سفارش سرسید گذشته`}
          tone="warning"
        />
        <StatCard
          label="پیشنهادات در انتظار"
          value={toPersianDigits(summary?.pending_suggestions ?? 0)}
          hint={`${toPersianDigits(summary?.cancelled_count ?? 0)} سفارش لغو شده`}
          tone="purple"
        />
      </div>

      <Card className="mb-4" bodyClassName="!py-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">جست‌وجو</label>
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pr-9"
                placeholder="شماره سفارش یا طرف حساب…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <SelectInput
            label="نوع"
            value={orderType}
            onChange={setOrderType}
            options={[
              { value: '', label: 'همه' },
              ...(options?.order_types ?? []),
            ]}
          />
          <SelectInput
            label="وضعیت"
            value={status}
            onChange={setStatus}
            options={[{ value: '', label: 'همه' }, ...(options?.statuses ?? [])]}
          />
          <SelectInput
            label="پرداخت"
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={[{ value: '', label: 'همه' }, ...(options?.payment_statuses ?? [])]}
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
            ? `سفارش ${toPersianDigits(deleting.number)} حذف شود؟ فقط پیش‌نویس قابل حذف است.`
            : ''
        }
        confirmLabel="حذف"
        danger
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
