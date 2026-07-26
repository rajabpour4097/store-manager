import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Receipt, Search, Tags, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { DatePicker } from '@/components/ui/DatePicker'
import { NumberInput, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard, Tabs } from '@/components/ui/Misc'
import { AsyncSelect } from '@/components/ui/AsyncSelect'
import { searchParties } from '@/components/ui/selectors'
import { DonutChart } from '@/components/charts/Charts'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ledgerApi } from '@/services/endpoints'
import { formatCompactMoney, formatMoney, toNumber, toPersianDigits } from '@/utils/format'
import { FINANCE_KINDS, PAYMENT_METHODS } from '@/utils/constants'
import { startOfJalaliMonthIso, todayIso } from '@/utils/jalali'
import type { FinanceCategory, FinanceRecord } from '@/types'

export function FinancePage() {
  const { can } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState<'records' | 'categories'>('records')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [kind, setKind] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(startOfJalaliMonthIso())
  const [dateTo, setDateTo] = useState(todayIso())

  const [recordModal, setRecordModal] = useState<{ open: boolean; record: FinanceRecord | null }>({
    open: false,
    record: null,
  })
  const [categoryModal, setCategoryModal] = useState<{
    open: boolean
    category: FinanceCategory | null
  }>({ open: false, category: null })
  const [deleting, setDeleting] = useState<
    { kind: 'record' | 'category'; id: number; title: string } | null
  >(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const { data: categories, reload: reloadCategories } = useAsync(
    () => ledgerApi.financeCategories({ page_size: 200 }),
    [],
  )
  const { data: summary, reload: reloadSummary } = useAsync(
    () =>
      ledgerApi.financeSummary({
        date_from: dateFrom || null,
        date_to: dateTo || null,
        kind: kind || null,
        category: categoryFilter || null,
        search: debouncedSearch || null,
      }),
    [dateFrom, dateTo, kind, categoryFilter, debouncedSearch],
  )

  const records = usePaginatedList<FinanceRecord>((params) => ledgerApi.financeRecords(params), {
    pageSize: 20,
  })

  useEffect(() => {
    records.updateFilters({
      search: debouncedSearch || null,
      kind: kind || null,
      category: categoryFilter || null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, kind, categoryFilter, dateFrom, dateTo])

  const refresh = () => {
    records.reload()
    reloadSummary()
    reloadCategories()
  }

  const expenseDonut = useMemo(
    () =>
      (summary?.by_category ?? [])
        .filter((row) => row.kind === 'expense')
        .slice(0, 7)
        .map((row) => ({ name: row.name, value: toNumber(row.total) })),
    [summary],
  )

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      if (deleting.kind === 'record') await ledgerApi.removeFinanceRecord(deleting.id)
      else await ledgerApi.removeFinanceCategory(deleting.id)
      toast.success('حذف انجام شد.')
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'حذف انجام نشد.')
    } finally {
      setDeletingBusy(false)
    }
  }

  const recordColumns: Array<Column<FinanceRecord>> = [
    { key: 'date', header: 'تاریخ', render: (row) => <span className="num">{row.date_jalali}</span> },
    {
      key: 'title',
      header: 'عنوان',
      render: (row) => (
        <div>
          <span className="block truncate font-medium">{row.title}</span>
          <span className="block text-xs text-ink-400">{row.category_name}</span>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'نوع',
      render: (row) => (
        <Badge tone={row.kind === 'expense' ? 'danger' : 'success'}>{row.kind_display}</Badge>
      ),
    },
    {
      key: 'amount',
      header: 'مبلغ (ریال)',
      render: (row) => (
        <Money
          value={row.amount}
          className={
            row.kind === 'expense'
              ? 'font-semibold text-rose-600 dark:text-rose-400'
              : 'font-semibold text-teal-600 dark:text-teal-400'
          }
        />
      ),
    },
    {
      key: 'method',
      header: 'روش پرداخت',
      render: (row) => (
        <div className="text-xs">
          <Badge tone="neutral">{row.payment_method_display}</Badge>
          {row.party_name && <span className="mt-1 block text-ink-400">{row.party_name}</span>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          {can('ledger.change') && (
            <button
              type="button"
              onClick={() => setRecordModal({ open: true, record: row })}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              title="ویرایش"
            >
              <Pencil size={16} />
            </button>
          )}
          {can('ledger.delete') && (
            <button
              type="button"
              onClick={() => setDeleting({ kind: 'record', id: row.id, title: row.title })}
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

  const categoryColumns: Array<Column<FinanceCategory>> = [
    { key: 'name', header: 'نام دسته', render: (row) => <span className="font-medium">{row.name}</span> },
    {
      key: 'kind',
      header: 'نوع',
      render: (row) => (
        <Badge tone={row.kind === 'expense' ? 'danger' : 'success'}>{row.kind_display}</Badge>
      ),
    },
    {
      key: 'count',
      header: 'تعداد رکورد',
      render: (row) => <span className="num">{toPersianDigits(row.records_count ?? 0)}</span>,
    },
    {
      key: 'description',
      header: 'توضیحات',
      render: (row) => <span className="text-xs text-ink-500">{row.description || '—'}</span>,
    },
    {
      key: 'active',
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
          {can('ledger.change') && (
            <button
              type="button"
              onClick={() => setCategoryModal({ open: true, category: row })}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              title="ویرایش"
            >
              <Pencil size={16} />
            </button>
          )}
          {can('ledger.delete') && (
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
        title="هزینه‌ها و درآمدهای عملیاتی"
        description="ثبت هزینه‌های جاری فروشگاه و درآمدهای غیرفروش؛ مبنای محاسبه سود خالص"
        icon={<Receipt size={20} />}
        actions={
          <div className="flex gap-2">
            {can('ledger.add') && tab === 'records' && (
              <Button
                icon={<Plus size={16} />}
                onClick={() => setRecordModal({ open: true, record: null })}
              >
                ثبت هزینه / درآمد
              </Button>
            )}
            {can('ledger.add') && tab === 'categories' && (
              <Button
                icon={<Plus size={16} />}
                onClick={() => setCategoryModal({ open: true, category: null })}
              >
                دسته‌بندی جدید
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="جمع هزینه‌های دوره"
          value={formatCompactMoney(summary?.total_expense)}
          hint={`${toPersianDigits(summary?.expense_count ?? 0)} رکورد`}
          tone="danger"
        />
        <StatCard
          label="جمع درآمدهای دوره"
          value={formatCompactMoney(summary?.total_income)}
          hint={`${toPersianDigits(summary?.income_count ?? 0)} رکورد`}
          tone="success"
        />
        <StatCard
          label="خالص (درآمد − هزینه)"
          value={formatCompactMoney(summary?.net)}
          tone={toNumber(summary?.net) >= 0 ? 'success' : 'warning'}
        />
        <StatCard
          label="تعداد دسته‌بندی‌ها"
          value={`${toPersianDigits(categories?.count ?? 0)} دسته`}
          tone="purple"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: 'records', label: 'رکوردها', badge: toPersianDigits(records.count) },
            { key: 'categories', label: 'دسته‌بندی‌ها', badge: toPersianDigits(categories?.count ?? 0) },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'records' ? (
        <>
          <Card className="mb-4" bodyClassName="!py-4">
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                    placeholder="عنوان یا توضیحات…"
                  />
                </div>
              </div>
              <SelectInput
                label="نوع"
                value={kind}
                onChange={setKind}
                options={FINANCE_KINDS.map((item) => ({ value: item.value, label: item.label }))}
                placeholder="همه"
              />
              <SelectInput
                label="دسته‌بندی"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={(categories?.results ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.kind_display})`,
                }))}
                placeholder="همه دسته‌ها"
              />
              <DatePicker label="از تاریخ" value={dateFrom} onChange={setDateFrom} />
              <DatePicker label="تا تاریخ" value={dateTo} onChange={setDateTo} />
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <DataTable
              columns={recordColumns}
              rows={records.items}
              rowKey={(row) => row.id}
              loading={records.loading}
              error={records.error}
              emptyMessage="رکوردی در این بازه ثبت نشده است."
              footer={
                <Pagination
                  page={records.page}
                  numPages={records.numPages}
                  count={records.count}
                  pageSize={records.pageSize}
                  onChange={records.setPage}
                />
              }
            />
            <Card title="ترکیب هزینه‌ها" subtitle="سهم دسته‌بندی‌ها از هزینه دوره">
              {expenseDonut.length > 0 ? (
                <DonutChart data={expenseDonut} />
              ) : (
                <p className="py-16 text-center text-sm text-ink-400">هزینه‌ای ثبت نشده است.</p>
              )}
            </Card>
          </div>
        </>
      ) : (
        <DataTable
          columns={categoryColumns}
          rows={categories?.results ?? []}
          rowKey={(row) => row.id}
          emptyMessage="دسته‌بندی‌ای ثبت نشده است."
        />
      )}

      <FinanceRecordModal
        open={recordModal.open}
        record={recordModal.record}
        categories={categories?.results ?? []}
        onClose={() => setRecordModal({ open: false, record: null })}
        onSaved={refresh}
      />

      <FinanceCategoryModal
        open={categoryModal.open}
        category={categoryModal.category}
        onClose={() => setCategoryModal({ open: false, category: null })}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف رکورد"
        message={deleting ? `«${deleting.title}» حذف شود؟` : ''}
        confirmLabel="حذف کن"
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

// ---------------------------------------------------------------- مدال رکورد
function FinanceRecordModal({
  open,
  record,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean
  record: FinanceRecord | null
  categories: FinanceCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [kind, setKind] = useState('expense')
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [party, setParty] = useState<number | null>(null)
  const [partyLabel, setPartyLabel] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(record?.kind ?? 'expense')
    setCategory(record ? String(record.category) : '')
    setTitle(record?.title ?? '')
    setAmount(record ? String(toNumber(record.amount)) : '')
    setDate(record?.date ?? todayIso())
    setPaymentMethod(record?.payment_method ?? 'cash')
    setParty(record?.party ?? null)
    setPartyLabel(record?.party_name ?? '')
    setDescription(record?.description ?? '')
    setErrors({})
  }, [open, record])

  const availableCategories = categories.filter((item) => item.kind === kind && item.is_active)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const localErrors: Record<string, string[]> = {}
    if (!title.trim()) localErrors.title = ['عنوان الزامی است.']
    if (!category) localErrors.category = ['دسته‌بندی را انتخاب کنید.']
    if (toNumber(amount) <= 0) localErrors.amount = ['مبلغ باید بزرگ‌تر از صفر باشد.']
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      return
    }

    const payload = {
      kind,
      category: Number(category),
      title: title.trim(),
      amount,
      date,
      payment_method: paymentMethod,
      party,
      description: description.trim(),
    }

    setSaving(true)
    try {
      if (record) {
        await ledgerApi.updateFinanceRecord(record.id, payload)
        toast.success('رکورد ویرایش شد.')
      } else {
        await ledgerApi.createFinanceRecord(payload)
        toast.success('رکورد ثبت شد.')
      }
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={record ? 'ویرایش رکورد' : 'ثبت هزینه یا درآمد'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {record ? 'ذخیره' : 'ثبت'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="نوع"
          value={kind}
          onChange={(value) => {
            setKind(value)
            setCategory('')
          }}
          options={FINANCE_KINDS.map((item) => ({ value: item.value, label: item.label }))}
          error={errors.kind}
        />
        <SelectInput
          label="دسته‌بندی"
          required
          value={category}
          onChange={setCategory}
          options={availableCategories.map((item) => ({ value: item.id, label: item.name }))}
          placeholder={
            availableCategories.length === 0 ? 'ابتدا دسته‌بندی بسازید' : 'انتخاب دسته‌بندی…'
          }
          error={errors.category}
        />
        <TextInput
          label="عنوان"
          required
          value={title}
          onChange={setTitle}
          error={errors.title}
          wrapClassName="sm:col-span-2"
          placeholder="مثال: اجاره مغازه مهر"
        />
        <NumberInput
          label="مبلغ (ریال)"
          required
          value={amount}
          onChange={setAmount}
          error={errors.amount}
          hint={amount ? formatMoney(amount) : undefined}
        />
        <DatePicker
          label="تاریخ"
          required
          value={date}
          onChange={setDate}
          clearable={false}
          error={errors.date}
        />
        <SelectInput
          label="روش پرداخت"
          value={paymentMethod}
          onChange={setPaymentMethod}
          options={PAYMENT_METHODS.map((item) => ({ value: item.value, label: item.label }))}
          error={errors.payment_method}
        />
        <AsyncSelect
          label="طرف حساب مرتبط"
          value={party}
          selectedLabel={partyLabel}
          onChange={(value, option) => {
            setParty(value)
            setPartyLabel(option?.label ?? '')
          }}
          search={searchParties}
          error={errors.party}
          placeholder="اختیاری"
        />
        <TextArea
          label="توضیحات"
          wrapClassName="sm:col-span-2"
          value={description}
          onChange={setDescription}
          error={errors.description}
        />
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------ مدال دسته‌بندی
function FinanceCategoryModal({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean
  category: FinanceCategory | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('expense')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setKind(category?.kind ?? 'expense')
    setDescription(category?.description ?? '')
    setIsActive(category?.is_active ?? true)
    setErrors({})
  }, [open, category])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setErrors({ name: ['نام دسته الزامی است.'] })
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), kind, description: description.trim(), is_active: isActive }
      if (category) {
        await ledgerApi.updateFinanceCategory(category.id, payload)
        toast.success('دسته‌بندی ویرایش شد.')
      } else {
        await ledgerApi.createFinanceCategory(payload)
        toast.success('دسته‌بندی ساخته شد.')
      }
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={category ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving} icon={<Tags size={15} />}>
            ذخیره
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput label="نام دسته" required value={name} onChange={setName} error={errors.name} />
        <SelectInput
          label="نوع"
          value={kind}
          onChange={setKind}
          options={FINANCE_KINDS.map((item) => ({ value: item.value, label: item.label }))}
          error={errors.kind}
        />
        <TextArea
          label="توضیحات"
          value={description}
          onChange={setDescription}
          error={errors.description}
          rows={2}
        />
        <Switch label="فعال" checked={isActive} onChange={setIsActive} />
      </form>
    </Modal>
  )
}
