import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Boxes, Loader2, TrendingDown, TrendingUp } from 'lucide-react'

import { GroupedBarChart, DonutChart } from '@/components/charts/Charts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePicker } from '@/components/ui/DatePicker'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { reportsApi } from '@/services/endpoints'
import { formatCompactMoney, formatQuantity, toNumber, toPersianDigits } from '@/utils/format'
import { startOfJalaliMonthIso, todayIso } from '@/utils/jalali'
import type { WarehouseStatsReport } from '@/types'

export function WarehouseStatsPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<WarehouseStatsReport | null>(null)
  const [dateFrom, setDateFrom] = useState(startOfJalaliMonthIso())
  const [dateTo, setDateTo] = useState(todayIso())

  const load = () => {
    setLoading(true)
    reportsApi
      .warehouseStats({ date_from: dateFrom, date_to: dateTo })
      .then(setReport)
      .catch((error) => {
        toast.error(error instanceof ApiError ? error.message : 'آمار انبار بارگذاری نشد.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo])

  if (loading && !report) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink-400">
        <Loader2 className="animate-spin" size={28} />
      </div>
    )
  }

  if (!report) return null

  const { summary } = report

  const reasonChart = report.by_reason.map((row) => ({
    name: row.reason_display,
    value: row.count,
  }))

  const dailyChart = report.daily.map((row) => ({
    label: row.label,
    in: toNumber(row.quantity_in),
    out: toNumber(row.quantity_out),
  }))

  return (
    <>
      <PageHeader
        title="آمار انبار"
        description="موجودی کالا، ورود و خروج انبار و گردش موجودی"
        icon={<Boxes size={20} />}
        actions={
          <Link to="/trade">
            <Button variant="secondary" icon={<ArrowRight size={16} />}>
              خرید و فروش
            </Button>
          </Link>
        }
      />

      <Card className="mb-5" bodyClassName="!py-4">
        <div className="flex flex-wrap items-end gap-3">
          <DatePicker label="از تاریخ" value={dateFrom} onChange={setDateFrom} />
          <DatePicker label="تا تاریخ" value={dateTo} onChange={setDateTo} />
          <Button variant="secondary" onClick={load} loading={loading}>
            به‌روزرسانی
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          بازه: {report.date_from_jalali} تا {report.date_to_jalali}
        </p>
      </Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ارزش موجودی (خرید)"
          value={formatCompactMoney(summary.total_stock_value)}
          hint={`${toPersianDigits(summary.total_products)} کالا`}
          tone="brand"
        />
        <StatCard
          label="ورود انبار"
          value={formatQuantity(summary.quantity_in)}
          hint={formatCompactMoney(summary.value_in)}
          tone="success"
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          label="خروج انبار"
          value={formatQuantity(summary.quantity_out)}
          hint={formatCompactMoney(summary.value_out)}
          tone="warning"
          icon={<TrendingDown size={18} />}
        />
        <StatCard
          label="خالص گردش"
          value={formatQuantity(summary.net_quantity)}
          hint={`${toPersianDigits(summary.movement_count)} گردش · ${toPersianDigits(summary.out_of_stock_count)} ناموجود`}
          tone="purple"
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="گردش روزانه">
          <GroupedBarChart
            data={dailyChart}
            series={[
              { key: 'in', label: 'ورود', color: '#10b981' },
              { key: 'out', label: 'خروج', color: '#f59e0b' },
            ]}
            xKey="label"
            height={260}
            money={false}
          />
        </Card>

        <Card title="علت گردش">
          {reasonChart.length > 0 ? (
            <DonutChart data={reasonChart} height={260} money={false} />
          ) : (
            <p className="py-8 text-center text-sm text-ink-400">گردشی در این بازه ثبت نشده است.</p>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="پرفروش‌ترین گردش‌ها">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500 dark:border-ink-700">
                  <th className="py-2 text-right">کالا</th>
                  <th className="py-2 text-right">ورود</th>
                  <th className="py-2 text-right">خروج</th>
                  <th className="py-2 text-right">موجودی</th>
                </tr>
              </thead>
              <tbody>
                {report.top_movers.map((row) => (
                  <tr key={row.product_id} className="border-b border-ink-100 dark:border-ink-800">
                    <td className="py-2">
                      <div>{row.product_name}</div>
                      <span className="text-xs text-ink-400">{row.category}</span>
                    </td>
                    <td className="num py-2 text-emerald-600">{formatQuantity(row.quantity_in)}</td>
                    <td className="num py-2 text-amber-600">{formatQuantity(row.quantity_out)}</td>
                    <td className="num py-2">{formatQuantity(row.current_stock)}</td>
                  </tr>
                ))}
                {report.top_movers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-400">
                      داده‌ای موجود نیست
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="کالاهای کم‌موجود و ناموجود">
          <div className="space-y-2">
            {report.inventory.out_of_stock.slice(0, 5).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-500/10"
              >
                <span>{row.name}</span>
                <Badge tone="danger">ناموجود</Badge>
              </div>
            ))}
            {report.inventory.low_stock.slice(0, 5).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10"
              >
                <span>{row.name}</span>
                <span className="num text-sm text-ink-500">
                  {formatQuantity(row.stock_quantity)} / {formatQuantity(row.reorder_point)}
                </span>
              </div>
            ))}
            {report.inventory.out_of_stock.length === 0 && report.inventory.low_stock.length === 0 && (
              <p className="py-4 text-center text-sm text-ink-400">همه کالاها موجودی مناسب دارند.</p>
            )}
          </div>
          <Link
            to="/reports/inventory"
            className="mt-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-300"
          >
            <ArrowLeft size={14} />
            گزارش کامل موجودی
          </Link>
        </Card>
      </div>

      <Card title="ارزش موجودی به تفکیک دسته">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {report.inventory.by_category.slice(0, 6).map((row) => (
            <div
              key={row.category}
              className="rounded-xl border border-ink-200 p-3 dark:border-ink-700"
            >
              <div className="text-sm text-ink-500">{row.category}</div>
              <div className="mt-1 font-semibold">
                <Money value={row.value} />
              </div>
              <div className="text-xs text-ink-400">{toPersianDigits(row.count)} کالا</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
