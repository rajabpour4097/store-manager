import { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'

import { Badge, CHEQUE_STATUS_TONES, DUE_STATE_TONES } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectInput } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { ChequeDetailModal } from './ChequeDetailModal'
import { ChequeFormModal } from './ChequeFormModal'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { chequesApi } from '@/services/endpoints'
import { formatCompactMoney, formatDayDistance, toPersianDigits } from '@/utils/format'
import type { Cheque, ChequeDirection } from '@/types'

const STATE_OPTIONS = [
  { value: 'open', label: 'در جریان' },
  { value: 'overdue', label: 'سرسید گذشته' },
  { value: 'upcoming', label: 'سرسید ۳۰ روز آینده' },
  { value: 'closed', label: 'تسویه/بسته‌شده' },
  { value: 'bounced', label: 'برگشتی' },
]

export function ChequesPage({ direction }: { direction: ChequeDirection }) {
  const { can } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [status, setStatus] = useState('')
  const [state, setState] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Cheque | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Cheque | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const { data: options } = useAsync(() => chequesApi.options(), [])
  const { data: summary, reload: reloadSummary } = useAsync(() => chequesApi.summary(), [])

  const list = usePaginatedList<Cheque>(
    (params) => chequesApi.list({ ...params, direction }),
    { pageSize: 15 },
  )

  useEffect(() => {
    list.updateFilters({
      search: debouncedSearch || null,
      status: status || null,
      state: state || null,
      due_from: dueFrom || null,
      due_to: dueTo || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, status, state, dueFrom, dueTo, direction])

  const isReceivable = direction === 'receivable'
  const side = isReceivable ? summary?.receivable : summary?.payable

  const refresh = () => {
    list.reload()
    reloadSummary()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await chequesApi.remove(deleting.id)
      toast.success('چک حذف شد.')
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'حذف چک انجام نشد.')
    } finally {
      setDeletingBusy(false)
    }
  }

  const columns: Array<Column<Cheque>> = [
    {
      key: 'serial',
      header: 'شماره چک',
      render: (row) => (
        <div>
          <span className="num block font-medium">{toPersianDigits(row.serial_number)}</span>
          <span className="block text-xs text-ink-400">{row.bank_display}</span>
        </div>
      ),
    },
    {
      key: 'party',
      header: 'طرف حساب',
      render: (row) => (
        <div>
          <span className="block truncate">{row.party_detail?.name ?? '—'}</span>
          {row.holder_name && (
            <span className="block text-xs text-ink-400">{row.holder_name}</span>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'مبلغ (ریال)',
      render: (row) => <Money value={row.amount} className="font-semibold" />,
    },
    {
      key: 'due',
      header: 'سرسید',
      render: (row) => (
        <div>
          <span className="num block">{row.due_date_jalali}</span>
          <Badge tone={DUE_STATE_TONES[row.due_state] ?? 'neutral'} className="mt-1">
            {row.is_open ? formatDayDistance(row.days_to_due) : row.due_state_display}
          </Badge>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <Badge tone={CHEQUE_STATUS_TONES[row.status] ?? 'neutral'}>{row.status_display}</Badge>
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
            onClick={() => setDetailId(row.id)}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
            title="جزئیات و تغییر وضعیت"
          >
            <Eye size={16} />
          </button>
          {can('cheques.change') && row.is_open && (
            <button
              type="button"
              onClick={() => {
                setEditing(row)
                setFormOpen(true)
              }}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800"
              title="ویرایش"
            >
              <Pencil size={16} />
            </button>
          )}
          {can('cheques.delete') && (
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
        title={isReceivable ? 'چک‌های دریافتی' : 'چک‌های پرداختی'}
        description={
          isReceivable
            ? 'چک‌های دریافتی از مشتریان، از ثبت تا وصول یا برگشت.'
            : 'چک‌های صادرشده به تأمین‌کنندگان و پیگیری سرسیدها.'
        }
        icon={isReceivable ? <ArrowDownToLine size={20} /> : <ArrowUpFromLine size={20} />}
        actions={
          can('cheques.add') && (
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              ثبت چک جدید
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مجموع در جریان"
          value={formatCompactMoney(side?.open_amount)}
          hint={`${toPersianDigits(side?.open_count ?? 0)} فقره`}
          tone="brand"
        />
        <StatCard
          label="سرسید گذشته"
          value={formatCompactMoney(side?.overdue_amount)}
          hint={`${toPersianDigits(side?.overdue_count ?? 0)} فقره نیازمند پیگیری`}
          tone="danger"
        />
        <StatCard
          label="سرسید ۷ روز آینده"
          value={formatCompactMoney(side?.due_7_days)}
          hint={`۳۰ روز آینده: ${formatCompactMoney(side?.due_30_days)}`}
          tone="warning"
        />
        <StatCard
          label={isReceivable ? 'وصول‌شده' : 'پاس‌شده'}
          value={formatCompactMoney(side?.cleared_amount)}
          hint={`برگشتی: ${toPersianDigits(side?.bounced_count ?? 0)} فقره`}
          tone="success"
        />
      </div>

      <Card className="mb-4" bodyClassName="!py-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="label">جست‌وجو</label>
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pr-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="شماره چک، طرف حساب، صیادی…"
              />
            </div>
          </div>
          <SelectInput
            label="وضعیت"
            value={status}
            onChange={setStatus}
            options={(options?.statuses ?? []).map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            placeholder="همه وضعیت‌ها"
          />
          <SelectInput
            label="فیلتر سریع"
            value={state}
            onChange={setState}
            options={STATE_OPTIONS}
            placeholder="بدون فیلتر"
          />
          <DatePicker label="سرسید از" value={dueFrom} onChange={setDueFrom} />
          <DatePicker label="سرسید تا" value={dueTo} onChange={setDueTo} />
        </div>
        {(search || status || state || dueFrom || dueTo) && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => {
                setSearch('')
                setStatus('')
                setState('')
                setDueFrom('')
                setDueTo('')
              }}
            >
              پاک کردن فیلترها
            </Button>
          </div>
        )}
      </Card>

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        emptyMessage="چکی با این مشخصات ثبت نشده است."
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

      <ChequeFormModal
        open={formOpen}
        direction={direction}
        cheque={editing}
        options={options}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      <ChequeDetailModal
        open={detailId !== null}
        chequeId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف چک"
        message={
          deleting
            ? `چک شماره ${deleting.serial_number} به مبلغ ${formatCompactMoney(deleting.amount)} حذف شود؟ اسناد مالی سیستمی مرتبط نیز حذف می‌شوند.`
            : ''
        }
        confirmLabel="حذف کن"
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
