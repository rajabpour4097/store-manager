import { useEffect, useState } from 'react'
import { Plus, Search, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { SelectInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/Misc'
import { DefectCreateModal } from './DefectCreateModal'
import { DefectStatusModal } from './DefectStatusModal'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { catalogApi } from '@/services/endpoints'
import { toPersianDigits } from '@/utils/format'
import type { ProductDefect } from '@/types'

const STATUS_FILTERS = [
  { value: '', label: 'همه وضعیت‌ها' },
  { value: 'open', label: 'خراب' },
  { value: 'repaired', label: 'درست شده' },
]

export function DefectsPage() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [status, setStatus] = useState('open')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<ProductDefect | null>(null)

  const list = usePaginatedList<ProductDefect>((params) => catalogApi.defects(params), {
    pageSize: 20,
  })

  useEffect(() => {
    list.updateFilters({
      search: debouncedSearch || null,
      status: status || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, status])

  const columns: Array<Column<ProductDefect>> = [
    {
      key: 'name',
      header: 'نام کالا',
      render: (row) => (
        <div>
          <span className="block truncate font-medium">{row.product_name}</span>
          <span className="num block text-xs text-ink-400">{row.product_sku}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'علت خرابی',
      render: (row) => <span className="line-clamp-2 max-w-56 text-sm">{row.reason}</span>,
    },
    {
      key: 'supplier',
      header: 'شرکت خریداری‌شده',
      render: (row) => row.supplier_name || '—',
    },
    {
      key: 'registered_at',
      header: 'تاریخ ثبت',
      render: (row) => (
        <span className="num text-sm">{toPersianDigits(row.registered_at_jalali || '—')}</span>
      ),
    },
    {
      key: 'last_follow_up_at',
      header: 'تاریخ آخرین پیگیری',
      render: (row) => (
        <span className="num text-sm">{toPersianDigits(row.last_follow_up_at_jalali || '—')}</span>
      ),
    },
    {
      key: 'description',
      header: 'توضیحات',
      render: (row) => (
        <span className="line-clamp-2 max-w-48 text-sm text-ink-600 dark:text-ink-300">
          {row.description || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <Badge tone={row.status === 'open' ? 'danger' : 'success'}>{row.status_display}</Badge>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="آمار خرابی‌ها"
        description="لیست کالاهای خراب، پیگیری و ثبت درست شدن"
        icon={<TriangleAlert size={20} />}
        actions={
          can('catalog.add') ? (
            <Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
              ثبت کالای خراب جدید
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4" bodyClassName="!py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="relative min-w-56 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              className="input pr-9"
              placeholder="جست‌وجو بر اساس کالا، علت یا شرکت…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <SelectInput
            wrapClassName="w-44"
            value={status}
            onChange={setStatus}
            options={STATUS_FILTERS}
          />
        </div>
      </Card>

      <Card bodyClassName="!p-0">
        <DataTable
          columns={columns}
          rows={list.items}
          rowKey={(row) => row.id}
          loading={list.loading}
          error={list.error}
          emptyMessage="کالای خرابی ثبت نشده است."
          emptyAction={
            can('catalog.add') ? (
              <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
                ثبت اولین مورد
              </Button>
            ) : undefined
          }
          onRowClick={setSelected}
        />
        <Pagination
          page={list.page}
          numPages={list.numPages}
          count={list.count}
          pageSize={list.pageSize}
          onChange={list.setPage}
        />
      </Card>

      <DefectCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => list.reload()}
      />
      <DefectStatusModal
        open={Boolean(selected)}
        defect={selected}
        onClose={() => setSelected(null)}
        onSaved={() => list.reload()}
      />
    </>
  )
}
