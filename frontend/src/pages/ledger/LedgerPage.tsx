import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Plus, RotateCcw, ScrollText, Search, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectInput } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { LedgerEntryModal } from './LedgerEntryModal'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ledgerApi } from '@/services/endpoints'
import { formatCompactMoney, toNumber, toPersianDigits } from '@/utils/format'
import { ENTRY_TYPES } from '@/utils/constants'
import { startOfJalaliMonthIso, todayIso } from '@/utils/jalali'
import type { LedgerEntry } from '@/types'

export function LedgerPage() {
  const { can } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [category, setCategory] = useState('')
  const [entryType, setEntryType] = useState('')
  const [dateFrom, setDateFrom] = useState(startOfJalaliMonthIso())
  const [dateTo, setDateTo] = useState(todayIso())
  const [systemFilter, setSystemFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const { data: categories } = useAsync(() => ledgerApi.categories(), [])
  const { data: summary, reload: reloadSummary } = useAsync(
    () =>
      ledgerApi.summary({
        date_from: dateFrom || null,
        date_to: dateTo || null,
        category: category || null,
        entry_type: entryType || null,
        search: debouncedSearch || null,
        is_system_generated: systemFilter || null,
      }),
    [dateFrom, dateTo, category, entryType, debouncedSearch, systemFilter],
  )

  const list = usePaginatedList<LedgerEntry>((params) => ledgerApi.list(params), { pageSize: 20 })

  useEffect(() => {
    list.updateFilters({
      search: debouncedSearch || null,
      category: category || null,
      entry_type: entryType || null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      is_system_generated: systemFilter || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, entryType, dateFrom, dateTo, systemFilter])

  const refresh = () => {
    list.reload()
    reloadSummary()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await ledgerApi.remove(deleting.id)
      toast.success('سند حذف شد.')
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'حذف سند انجام نشد.')
    } finally {
      setDeletingBusy(false)
    }
  }

  const columns: Array<Column<LedgerEntry>> = [
    {
      key: 'date',
      header: 'تاریخ',
      render: (row) => <span className="num">{row.date_jalali}</span>,
    },
    {
      key: 'party',
      header: 'طرف حساب',
      render: (row) => (
        <Link
          to={`/parties/${row.party}`}
          className="block truncate font-medium transition hover:text-brand-600"
        >
          {row.party_detail?.name ?? '—'}
        </Link>
      ),
    },
    {
      key: 'description',
      header: 'شرح',
      render: (row) => (
        <div>
          <span className="block max-w-xs truncate text-sm">{row.description || '—'}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-400">
            <Badge tone="neutral">{row.category_display}</Badge>
            {row.document_number && (
              <span className="num">سند {toPersianDigits(row.document_number)}</span>
            )}
          </span>
        </div>
      ),
    },
    {
      key: 'debit',
      header: 'بدهکار',
      render: (row) =>
        toNumber(row.debit) > 0 ? (
          <Money value={row.debit} className="font-semibold text-rose-600 dark:text-rose-400" />
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'credit',
      header: 'بستانکار',
      render: (row) =>
        toNumber(row.credit) > 0 ? (
          <Money value={row.credit} className="font-semibold text-teal-600 dark:text-teal-400" />
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'source',
      header: 'منبع',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={row.is_system_generated ? 'info' : 'brand'}>
            {row.source_type_display}
          </Badge>
          {row.is_system_generated && <Lock size={13} className="text-ink-400" />}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'center',
      render: (row) =>
        can('ledger.delete') && !row.is_system_generated ? (
          <button
            type="button"
            onClick={() => setDeleting(row)}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            title="حذف سند"
          >
            <Trash2 size={16} />
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="دفتر بدهکار و بستانکار"
        description="همه اسناد مالی طرف‌حساب‌ها؛ اسناد سیستمی از چک و فاکتور ساخته می‌شوند."
        icon={<ScrollText size={20} />}
        actions={
          can('ledger.add') && (
            <Button icon={<Plus size={16} />} onClick={() => setFormOpen(true)}>
              ثبت سند دستی
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="جمع بدهکار دوره"
          value={formatCompactMoney(summary?.total_debit)}
          tone="danger"
        />
        <StatCard
          label="جمع بستانکار دوره"
          value={formatCompactMoney(summary?.total_credit)}
          tone="success"
        />
        <StatCard
          label="خالص (بدهکار − بستانکار)"
          value={formatCompactMoney(summary?.net)}
          tone={toNumber(summary?.net) >= 0 ? 'brand' : 'warning'}
        />
        <StatCard
          label="تعداد اسناد"
          value={`${toPersianDigits(summary?.count ?? 0)} سند`}
          tone="purple"
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
                placeholder="شرح، شماره سند، طرف حساب…"
              />
            </div>
          </div>
          <SelectInput
            label="سرفصل"
            value={category}
            onChange={setCategory}
            options={(categories ?? []).map((item) => ({ value: item.value, label: item.label }))}
            placeholder="همه سرفصل‌ها"
          />
          <SelectInput
            label="نوع سند"
            value={entryType}
            onChange={setEntryType}
            options={ENTRY_TYPES.map((item) => ({ value: item.value, label: item.label }))}
            placeholder="همه"
          />
          <DatePicker label="از تاریخ" value={dateFrom} onChange={setDateFrom} />
          <DatePicker label="تا تاریخ" value={dateTo} onChange={setDateTo} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <SelectInput
            value={systemFilter}
            onChange={setSystemFilter}
            options={[
              { value: 'false', label: 'فقط اسناد دستی' },
              { value: 'true', label: 'فقط اسناد سیستمی' },
            ]}
            placeholder="همه منابع"
            className="w-48"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={() => {
              setSearch('')
              setCategory('')
              setEntryType('')
              setSystemFilter('')
              setDateFrom(startOfJalaliMonthIso())
              setDateTo(todayIso())
            }}
          >
            بازنشانی فیلترها
          </Button>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        emptyMessage="سندی در این بازه ثبت نشده است."
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

      <LedgerEntryModal
        open={formOpen}
        categories={categories ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف سند"
        message="این سند مالی حذف شود؟ مانده حساب طرف حساب بازمحاسبه می‌شود."
        confirmLabel="حذف کن"
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
