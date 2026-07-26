import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { Switch } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useAsync } from '@/hooks/useAsync'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { salesHistoryApi } from '@/services/endpoints'
import { formatCompactMoney, formatQuantity, toPersianDigits } from '@/utils/format'
import type { SalesHistoryItem, SalesImportBatch } from '@/types'

export function SalesHistoryPage() {
  const { can } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [createProducts, setCreateProducts] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [lastBatch, setLastBatch] = useState<SalesImportBatch | null>(null)
  const [deletingBatch, setDeletingBatch] = useState<SalesImportBatch | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const { data: summary, reload: reloadSummary } = useAsync(() => salesHistoryApi.summary(), [])

  const history = usePaginatedList<SalesHistoryItem>((params) => salesHistoryApi.list(params), {
    pageSize: 15,
  })
  const batches = usePaginatedList<SalesImportBatch>((params) => salesHistoryApi.batches(params), {
    pageSize: 10,
  })

  useEffect(() => {
    /* keep lists independent */
  }, [])

  const refresh = () => {
    history.reload()
    batches.reload()
    reloadSummary()
  }

  const handleUpload = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('create_missing_products', createProducts ? 'true' : 'false')
      const batch = await salesHistoryApi.upload(form)
      setLastBatch(batch)
      toast.success(
        `${toPersianDigits(batch.imported_rows)} ردیف وارد شد · ${toPersianDigits(
          batch.skipped_rows,
        )} رد شد`,
      )
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ورود فایل انجام نشد.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmDeleteBatch = async () => {
    if (!deletingBatch) return
    setDeletingBusy(true)
    try {
      const result = await salesHistoryApi.deleteBatchRecords(deletingBatch.id)
      toast.success(`${toPersianDigits(result.deleted)} رکورد حذف شد.`)
      setDeletingBatch(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'حذف انجام نشد.')
    } finally {
      setDeletingBusy(false)
    }
  }

  const historyColumns: Array<Column<SalesHistoryItem>> = [
    {
      key: 'date',
      header: 'تاریخ',
      render: (row) => <span className="num">{row.sale_date_jalali}</span>,
    },
    {
      key: 'product',
      header: 'کالا',
      render: (row) => row.product_name || row.product_name_raw,
    },
    {
      key: 'qty',
      header: 'تعداد',
      render: (row) => formatQuantity(row.quantity),
    },
    {
      key: 'amount',
      header: 'مبلغ',
      render: (row) => <Money value={row.total_amount} />,
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (row) => row.customer_name || '—',
    },
  ]

  const batchColumns: Array<Column<SalesImportBatch>> = [
    {
      key: 'file',
      header: 'فایل',
      render: (row) => (
        <div>
          <span className="block font-medium">{row.file_name}</span>
          <span className="num block text-xs text-ink-400">{row.created_at_jalali}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <Badge
          tone={
            row.status === 'done' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'
          }
        >
          {row.status_display}
        </Badge>
      ),
    },
    {
      key: 'rows',
      header: 'ردیف‌ها',
      render: (row) =>
        `${toPersianDigits(row.imported_rows)} / ${toPersianDigits(row.total_rows)} · رد ${toPersianDigits(
          row.skipped_rows,
        )}`,
    },
    {
      key: 'range',
      header: 'بازه',
      render: (row) =>
        row.date_from_jalali
          ? `${row.date_from_jalali} تا ${row.date_to_jalali}`
          : '—',
    },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (row) =>
        can('orders.delete') ? (
          <button
            type="button"
            onClick={() => setDeletingBatch(row)}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-rose-50 hover:text-rose-600"
            title="حذف رکوردهای این ورود"
          >
            <Trash2 size={16} />
          </button>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="سوابق فروش و ورود CSV"
        description="فایل فروش‌های گذشته را وارد کنید تا پیشنهادات هوشمند دقیق‌تر شود"
        icon={<FileSpreadsheet size={20} />}
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={() => void salesHistoryApi.downloadSample()}
          >
            دانلود نمونه CSV
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="تعداد رکوردها"
          value={toPersianDigits(summary?.count ?? 0)}
          tone="brand"
        />
        <StatCard
          label="جمع مبلغ فروش"
          value={formatCompactMoney(summary?.total_amount)}
          tone="success"
        />
        <StatCard
          label="کالاهای متمایز"
          value={toPersianDigits(summary?.distinct_products ?? 0)}
          tone="purple"
        />
        <StatCard
          label="بازه داده"
          value={
            summary?.first_date_jalali
              ? `${summary.first_date_jalali} تا ${summary.last_date_jalali}`
              : '—'
          }
          hint={`جمع تعداد: ${formatQuantity(summary?.total_quantity)}`}
          tone="neutral"
        />
      </div>

      {can('orders.add') && (
        <Card className="mb-5" title="ورود فایل CSV">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-sm text-ink-600 dark:text-ink-300">
                ستون‌های پشتیبانی‌شده: نام کالا، تاریخ، تعداد، قیمت واحد، مبلغ کل، نام مشتری، بهای تمام‌شده
                (فارسی یا انگلیسی). تاریخ شمسی و میلادی پذیرفته می‌شود.
              </p>
              <Switch
                label="در صورت نبود کالا، خودکار ساخته شود"
                checked={createProducts}
                onChange={setCreateProducts}
              />
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
              />
              <Button
                icon={<Upload size={16} />}
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                انتخاب و بارگذاری CSV
              </Button>
            </div>
          </div>

          {lastBatch && lastBatch.errors?.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="mb-2 font-semibold text-amber-800 dark:text-amber-200">
                برخی ردیف‌ها وارد نشدند:
              </p>
              <ul className="max-h-40 space-y-1 overflow-auto text-amber-900 dark:text-amber-100">
                {lastBatch.errors.slice(0, 12).map((item, index) => (
                  <li key={`${item.line}-${index}`}>
                    خط {toPersianDigits(item.line)}: {item.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">تاریخچه ورودها</h2>
        <DataTable
          columns={batchColumns}
          rows={batches.items}
          loading={batches.loading}
          rowKey={(r) => r.id}
          emptyMessage="هنوز فایلی وارد نشده است."
          footer={
            <Pagination
              page={batches.page}
              numPages={batches.numPages}
              count={batches.count}
              pageSize={batches.pageSize}
              onChange={batches.setPage}
            />
          }
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">آخرین سوابق فروش</h2>
        <DataTable
          columns={historyColumns}
          rows={history.items}
          loading={history.loading}
          rowKey={(r) => r.id}
          footer={
            <Pagination
              page={history.page}
              numPages={history.numPages}
              count={history.count}
              pageSize={history.pageSize}
              onChange={history.setPage}
            />
          }
        />
      </div>

      {summary && summary.top_products.length > 0 && (
        <Card className="mt-6" title="پرفروش‌ترین کالاها">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.top_products.slice(0, 6).map((item, index) => (
              <div
                key={`${item.product_name_raw}-${index}`}
                className="rounded-xl border border-ink-100 p-3 dark:border-ink-800"
              >
                <p className="font-medium">{item.product_name_raw}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {formatQuantity(item.quantity)} · {formatCompactMoney(item.amount)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deletingBatch)}
        title="حذف رکوردهای ورود"
        message={
          deletingBatch
            ? `تمام سوابق مربوط به «${deletingBatch.file_name}» حذف شود؟`
            : ''
        }
        confirmLabel="حذف"
        danger
        loading={deletingBusy}
        onConfirm={confirmDeleteBatch}
        onCancel={() => setDeletingBatch(null)}
      />
    </>
  )
}
