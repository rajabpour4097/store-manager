import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, Pencil, Plus, RotateCcw, Search, Trash2, Users } from 'lucide-react'

import { BALANCE_STATE_TONES, Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { SelectInput } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { PartyFormModal } from './PartyFormModal'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { partiesApi } from '@/services/endpoints'
import { formatCompactMoney, toNumber, toPersianDigits } from '@/utils/format'
import type { Party } from '@/types'

const BALANCE_OPTIONS = [
  { value: 'debtor', label: 'بدهکار' },
  { value: 'creditor', label: 'بستانکار' },
  { value: 'settled', label: 'تسویه‌شده' },
]

export function PartiesPage() {
  const { can } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [partyType, setPartyType] = useState('')
  const [balanceState, setBalanceState] = useState(searchParams.get('state') ?? '')
  const [activeOnly, setActiveOnly] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Party | null>(null)
  const [deleting, setDeleting] = useState<Party | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const { data: types } = useAsync(() => partiesApi.types(), [])
  const { data: summary, reload: reloadSummary } = useAsync(() => partiesApi.summary(), [])

  const list = usePaginatedList<Party>((params) => partiesApi.list(params), { pageSize: 20 })

  useEffect(() => {
    list.updateFilters({
      search: debouncedSearch || null,
      party_type: partyType || null,
      balance_state: balanceState || null,
      is_active: activeOnly || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, partyType, balanceState, activeOnly])

  const refresh = () => {
    list.reload()
    reloadSummary()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await partiesApi.remove(deleting.id)
      toast.success('طرف حساب حذف شد.')
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'حذف انجام نشد؛ ممکن است اسناد مرتبط داشته باشد.',
      )
    } finally {
      setDeletingBusy(false)
    }
  }

  const columns: Array<Column<Party>> = [
    {
      key: 'name',
      header: 'طرف حساب',
      render: (row) => (
        <div>
          <Link
            to={`/parties/${row.id}`}
            className="block truncate font-medium text-ink-800 transition hover:text-brand-600 dark:text-ink-100"
          >
            {row.name}
          </Link>
          <span className="num block text-xs text-ink-400">{row.code}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'نوع',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">{row.party_type_display}</Badge>
          {row.is_legal_entity && <Badge tone="purple">حقوقی</Badge>}
          {!row.is_active && <Badge tone="neutral">غیرفعال</Badge>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'تماس',
      render: (row) => (
        <div className="text-xs text-ink-500 dark:text-ink-400">
          {row.mobile && <span className="num block">{toPersianDigits(row.mobile)}</span>}
          {row.city && <span className="block">{row.city}</span>}
          {!row.mobile && !row.city && '—'}
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'مانده حساب (ریال)',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Money value={Math.abs(toNumber(row.balance))} className="font-semibold" />
          <Badge tone={BALANCE_STATE_TONES[row.balance_state] ?? 'neutral'}>
            {row.balance_state_display}
          </Badge>
        </div>
      ),
    },
    {
      key: 'credit',
      header: 'سقف اعتبار',
      render: (row) =>
        toNumber(row.credit_limit) > 0 ? (
          <div>
            <Money value={row.credit_limit} className="text-xs" />
            {toNumber(row.balance) > toNumber(row.credit_limit) && (
              <Badge tone="danger" className="mt-1">
                عبور از سقف
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-xs text-ink-400">بدون محدودیت</span>
        ),
    },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Link
            to={`/parties/${row.id}`}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
            title="صورتحساب"
          >
            <FileText size={16} />
          </Link>
          {can('parties.change') && (
            <button
              type="button"
              onClick={() => {
                setEditing(row)
                setFormOpen(true)
              }}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              title="ویرایش"
            >
              <Pencil size={16} />
            </button>
          )}
          {can('parties.delete') && (
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
        title="طرف‌حساب‌ها"
        description="مدیریت مشتریان و تأمین‌کنندگان همراه با مانده بدهکار و بستانکار"
        icon={<Users size={20} />}
        actions={
          can('parties.add') && (
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              طرف حساب جدید
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مجموع مطالبات (بدهکاران)"
          value={formatCompactMoney(summary?.total_debtor_amount)}
          hint={`${toPersianDigits(summary?.debtor_count ?? 0)} طرف حساب بدهکار`}
          tone="danger"
        />
        <StatCard
          label="مجموع بدهی‌ها (بستانکاران)"
          value={formatCompactMoney(summary?.total_creditor_amount)}
          hint={`${toPersianDigits(summary?.creditor_count ?? 0)} طرف حساب بستانکار`}
          tone="success"
        />
        <StatCard
          label="مانده خالص"
          value={formatCompactMoney(summary?.net_balance)}
          hint={toNumber(summary?.net_balance) >= 0 ? 'طلب بیشتر از بدهی' : 'بدهی بیشتر از طلب'}
          tone="brand"
        />
        <StatCard
          label="تعداد طرف‌حساب‌ها"
          value={`${toPersianDigits(summary?.total_parties ?? 0)} مورد`}
          hint={`${toPersianDigits(summary?.customers ?? 0)} مشتری · ${toPersianDigits(
            summary?.suppliers ?? 0,
          )} تأمین‌کننده`}
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
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="نام، کد، موبایل…"
              />
            </div>
          </div>
          <SelectInput
            label="نوع"
            value={partyType}
            onChange={setPartyType}
            options={(types ?? []).map((item) => ({ value: item.value, label: item.label }))}
            placeholder="همه انواع"
          />
          <SelectInput
            label="وضعیت مانده"
            value={balanceState}
            onChange={setBalanceState}
            options={BALANCE_OPTIONS}
            placeholder="همه"
          />
          <SelectInput
            label="وضعیت فعال بودن"
            value={activeOnly}
            onChange={setActiveOnly}
            options={[
              { value: 'true', label: 'فقط فعال' },
              { value: 'false', label: 'فقط غیرفعال' },
            ]}
            placeholder="همه"
          />
        </div>
        {(search || partyType || balanceState || activeOnly) && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => {
                setSearch('')
                setPartyType('')
                setBalanceState('')
                setActiveOnly('')
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
        emptyMessage="طرف حسابی با این مشخصات یافت نشد."
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

      <PartyFormModal
        open={formOpen}
        party={editing}
        types={types ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف طرف حساب"
        message={
          deleting
            ? `«${deleting.name}» و تمام سفارش‌ها، چک‌ها و اسناد دفتر مرتبط با آن حذف شوند؟ این عملیات قابل بازگشت نیست.`
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
