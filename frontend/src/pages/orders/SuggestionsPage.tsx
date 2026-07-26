import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lightbulb, RefreshCw, ShoppingCart, Sparkles, X } from 'lucide-react'

import { Badge, PRIORITY_TONES } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { NumberInput, SelectInput, TextArea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useAsync } from '@/hooks/useAsync'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ordersApi, suggestionsApi } from '@/services/endpoints'
import { formatCompactMoney, formatPercent, formatQuantity, toPersianDigits } from '@/utils/format'
import type { PurchaseSuggestion } from '@/types'

export function SuggestionsPage() {
  const { can } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [status, setStatus] = useState('pending')
  const [priority, setPriority] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [coverageDays, setCoverageDays] = useState('30')
  const [horizonDays, setHorizonDays] = useState('60')
  const [lookbackDays, setLookbackDays] = useState('180')
  const [minConfidence, setMinConfidence] = useState('0')
  const [preferredWeekday, setPreferredWeekday] = useState('')
  const [generating, setGenerating] = useState(false)
  const [detail, setDetail] = useState<PurchaseSuggestion | null>(null)
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const { data: options } = useAsync(() => ordersApi.options(), [])
  const { data: summary, reload: reloadSummary } = useAsync(() => suggestionsApi.summary(), [])

  const list = usePaginatedList<PurchaseSuggestion>((params) => suggestionsApi.list(params), {
    pageSize: 20,
  })

  useEffect(() => {
    list.updateFilters({
      status: status || null,
      priority: priority || null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority])

  const refresh = () => {
    list.reload()
    reloadSummary()
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const result = await suggestionsApi.generate({
        coverage_days: Number(coverageDays) || 30,
        horizon_days: Number(horizonDays) || 60,
        lookback_days: Number(lookbackDays) || 180,
        min_confidence: Number(minConfidence) || 0,
        preferred_weekday: preferredWeekday === '' ? null : Number(preferredWeekday),
      })
      toast.success(
        `${toPersianDigits(result.created)} پیشنهاد جدید · تحلیل ${toPersianDigits(
          result.analyzed_products,
        )} کالا`,
      )
      setGenerateOpen(false)
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'تولید پیشنهاد انجام نشد.')
    } finally {
      setGenerating(false)
    }
  }

  const act = async (id: number, action: () => Promise<unknown>, message: string) => {
    setBusyId(id)
    try {
      await action()
      toast.success(message)
      setDetail(null)
      setNote('')
      refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'عملیات انجام نشد.')
    } finally {
      setBusyId(null)
    }
  }

  const createOrderFrom = async (suggestion: PurchaseSuggestion) => {
    setBusyId(suggestion.id)
    try {
      const order = await suggestionsApi.createOrder(suggestion.id, {})
      toast.success('سفارش خرید از پیشنهاد ساخته شد.')
      setDetail(null)
      refresh()
      navigate(`/orders/${order.id}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ایجاد سفارش انجام نشد.')
    } finally {
      setBusyId(null)
    }
  }

  const columns: Array<Column<PurchaseSuggestion>> = [
    {
      key: 'product',
      header: 'کالا',
      render: (row) => (
        <button type="button" className="text-right" onClick={() => setDetail(row)}>
          <span className="block font-medium text-brand-700 dark:text-brand-300">
            {row.product_name}
          </span>
          <span className="block text-xs text-ink-400">
            موجودی {formatQuantity(row.current_stock, row.unit_display)} ·{' '}
            {toPersianDigits(row.days_of_stock_left)} روز باقی
          </span>
        </button>
      ),
    },
    {
      key: 'date',
      header: 'زمان پیشنهادی',
      render: (row) => (
        <div>
          <span className="num block font-medium">{row.suggested_date_jalali}</span>
          <span className="block text-xs text-ink-400">{row.suggested_date_verbose}</span>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'مقدار',
      render: (row) => formatQuantity(row.suggested_quantity, row.unit_display),
    },
    {
      key: 'cost',
      header: 'برآورد هزینه',
      render: (row) => <Money value={row.estimated_cost} />,
    },
    {
      key: 'priority',
      header: 'اولویت',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge tone={PRIORITY_TONES[row.priority] ?? 'neutral'}>{row.priority_display}</Badge>
          <span className="text-xs text-ink-400">اطمینان {formatPercent(row.confidence, 0)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <Badge>{row.status_display}</Badge>,
    },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (row) =>
        row.status === 'pending' || row.status === 'accepted' ? (
          <div className="flex items-center justify-center gap-1">
            {can('orders.add') && (
              <button
                type="button"
                title="ایجاد سفارش خرید"
                disabled={busyId === row.id}
                onClick={() => void createOrderFrom(row)}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-brand-50 hover:text-brand-600"
              >
                <ShoppingCart size={16} />
              </button>
            )}
            {can('orders.change') && row.status === 'pending' && (
              <>
                <button
                  type="button"
                  title="پذیرش"
                  disabled={busyId === row.id}
                  onClick={() =>
                    void act(row.id, () => suggestionsApi.accept(row.id), 'پیشنهاد پذیرفته شد.')
                  }
                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-teal-50 hover:text-teal-600"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  title="رد"
                  disabled={busyId === row.id}
                  onClick={() =>
                    void act(row.id, () => suggestionsApi.reject(row.id), 'پیشنهاد رد شد.')
                  }
                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
  ]

  const weekdayOptions = [
    { value: '', label: 'بدون ترجیح' },
    ...(options?.weekdays ?? []).map((item) => ({
      value: String(item.value),
      label: item.label,
    })),
  ]

  return (
    <>
      <PageHeader
        title="پیشنهادات هوشمند خرید"
        description="بر اساس فروش‌های گذشته، زمان و مقدار خرید را پیشنهاد می‌دهد"
        icon={<Lightbulb size={20} />}
        actions={
          can('orders.add') && (
            <Button icon={<Sparkles size={16} />} onClick={() => setGenerateOpen(true)}>
              تولید پیشنهادات
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="در انتظار بررسی"
          value={toPersianDigits(summary?.pending ?? 0)}
          hint={`${toPersianDigits(summary?.due_this_week ?? 0)} مورد این هفته`}
          tone="warning"
        />
        <StatCard
          label="بحرانی"
          value={toPersianDigits(summary?.critical_count ?? 0)}
          tone="danger"
        />
        <StatCard
          label="سفارش‌شده"
          value={toPersianDigits(summary?.ordered ?? 0)}
          hint={`${toPersianDigits(summary?.accepted ?? 0)} پذیرفته شده`}
          tone="success"
        />
        <StatCard
          label="برآورد هزینه پیشنهادات"
          value={formatCompactMoney(summary?.estimated_cost)}
          tone="purple"
        />
      </div>

      <Card className="mb-4" bodyClassName="!py-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SelectInput
            label="وضعیت"
            value={status}
            onChange={setStatus}
            options={[{ value: '', label: 'همه' }, ...(options?.suggestion_statuses ?? [])]}
          />
          <SelectInput
            label="اولویت"
            value={priority}
            onChange={setPriority}
            options={[{ value: '', label: 'همه' }, ...(options?.priorities ?? [])]}
          />
          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={refresh}>
            بازخوانی
          </Button>
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

      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="تولید پیشنهادات هوشمند"
        subtitle="پارامترهای تحلیل فروش را تنظیم کنید"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenerateOpen(false)}>
              انصراف
            </Button>
            <Button
              loading={generating}
              icon={<Sparkles size={16} />}
              onClick={() => void generate()}
            >
              تولید
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberInput
            label="روز پوشش موجودی هدف"
            value={coverageDays}
            onChange={setCoverageDays}
            hint="مثلاً ۳۰ روز موجودی پس از خرید"
          />
          <NumberInput
            label="افق زمانی پیشنهاد (روز)"
            value={horizonDays}
            onChange={setHorizonDays}
          />
          <NumberInput
            label="بازنگری فروش گذشته (روز)"
            value={lookbackDays}
            onChange={setLookbackDays}
          />
          <NumberInput
            label="حداقل اطمینان (۰–۱۰۰)"
            value={minConfidence}
            onChange={setMinConfidence}
          />
          <SelectInput
            label="روز هفته ترجیحی سفارش"
            value={preferredWeekday}
            onChange={setPreferredWeekday}
            options={weekdayOptions}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.product_name ?? 'جزئیات پیشنهاد'}
        size="lg"
        footer={
          detail &&
          (detail.status === 'pending' || detail.status === 'accepted') && (
            <>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                بستن
              </Button>
              {can('orders.change') && detail.status === 'pending' && (
                <>
                  <Button
                    variant="secondary"
                    loading={busyId === detail.id}
                    onClick={() =>
                      void act(
                        detail.id,
                        () => suggestionsApi.reject(detail.id, note),
                        'پیشنهاد رد شد.',
                      )
                    }
                  >
                    رد
                  </Button>
                  <Button
                    variant="success"
                    loading={busyId === detail.id}
                    onClick={() =>
                      void act(
                        detail.id,
                        () => suggestionsApi.accept(detail.id, note),
                        'پیشنهاد پذیرفته شد.',
                      )
                    }
                  >
                    پذیرش
                  </Button>
                </>
              )}
              {can('orders.add') && (
                <Button
                  loading={busyId === detail.id}
                  icon={<ShoppingCart size={16} />}
                  onClick={() => void createOrderFrom(detail)}
                >
                  ایجاد سفارش خرید
                </Button>
              )}
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="تاریخ پیشنهادی" value={detail.suggested_date_jalali} />
              <Info
                label="مقدار"
                value={formatQuantity(detail.suggested_quantity, detail.unit_display)}
              />
              <Info label="برآورد هزینه" value={formatCompactMoney(detail.estimated_cost)} />
              <Info
                label="میانگین فروش روزانه"
                value={formatQuantity(detail.avg_daily_sales, detail.unit_display)}
              />
              <Info label="تأمین‌کننده" value={detail.supplier_name || '—'} />
              <Info label="بهترین روز هفته" value={detail.best_weekday_name || '—'} />
              <Info label="روند رشد" value={formatPercent(detail.trend_percent)} />
              <Info label="ضریب فصلی" value={toPersianDigits(detail.seasonality_factor)} />
              <Info label="اطمینان" value={formatPercent(detail.confidence, 0)} />
            </div>
            <div className="rounded-xl bg-ink-50 p-4 text-sm leading-7 text-ink-700 dark:bg-ink-800/50 dark:text-ink-200">
              {detail.reason || 'دلیلی ثبت نشده است.'}
            </div>
            {detail.status === 'pending' && (
              <TextArea
                label="یادداشت بررسی"
                value={note}
                onChange={setNote}
                rows={2}
                placeholder="اختیاری…"
              />
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-100 p-3 dark:border-ink-800">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  )
}
