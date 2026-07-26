import { useEffect, useState } from 'react'
import { Download, Loader2, Store } from 'lucide-react'

import { GroupedBarChart, TrendAreaChart } from '@/components/charts/Charts'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { reportsApi } from '@/services/endpoints'
import { formatCompactMoney, formatQuantity, toNumber, toPersianDigits } from '@/utils/format'
import { addDaysIso, todayIso } from '@/utils/jalali'
import type { SalesReport } from '@/types'

export function SalesReportPage() {
  const toast = useToast()
  const [range, setRange] = useState<DateRange>({
    from: addDaysIso(-29),
    to: todayIso(),
  })
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<SalesReport | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    reportsApi
      .sales({ date_from: range.from, date_to: range.to })
      .then((data) => {
        if (active) setReport(data)
      })
      .catch((error) => {
        toast.error(error instanceof ApiError ? error.message : 'گزارش بارگذاری نشد.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to])

  const timeline = (report?.timeline ?? []).map((row) => ({
    ...row,
    total: toNumber(row.total),
    profit: toNumber(row.profit),
  }))

  return (
    <>
      <PageHeader
        title="گزارش فروش"
        description="فروش، سود و مشتریان در بازه انتخابی"
        icon={<Store size={20} />}
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={() =>
              void reportsApi.export(
                'sales',
                { date_from: range.from, date_to: range.to },
                'گزارش-فروش.csv',
              )
            }
          >
            خروجی CSV
          </Button>
        }
      />

      <Card className="mb-5" bodyClassName="!py-4">
        <DateRangePicker value={range} onChange={setRange} />
      </Card>

      {loading || !report ? (
        <div className="grid min-h-[30vh] place-items-center text-ink-400">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="جمع فروش"
              value={formatCompactMoney(report.totals.total_amount)}
              hint={`${toPersianDigits(report.totals.orders_count)} سفارش`}
              tone="brand"
            />
            <StatCard
              label="سود"
              value={formatCompactMoney(report.totals.profit)}
              tone="success"
            />
            <StatCard
              label="میانگین فاکتور"
              value={formatCompactMoney(report.totals.average_order)}
              tone="purple"
            />
            <StatCard
              label="مانده وصول‌نشده"
              value={formatCompactMoney(report.totals.remaining_amount)}
              tone="warning"
            />
          </div>

          <Card className="mb-5" title="روند فروش">
            <TrendAreaChart
              data={timeline}
              xKey="label"
              series={[
                { key: 'total', label: 'فروش', color: '#3563ff' },
                { key: 'profit', label: 'سود', color: '#14b8a6' },
              ]}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="برترین کالاها">
              <div className="space-y-3">
                {report.by_product.slice(0, 8).map((item) => (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-3 py-2.5 dark:bg-ink-800/40"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-ink-400">
                        {formatQuantity(item.quantity, item.unit_display)}
                      </p>
                    </div>
                    <div className="text-left text-sm">
                      <Money value={item.revenue} className="font-semibold" />
                      <p className="text-xs text-teal-600">سود <Money value={item.profit} /></p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="برترین مشتریان">
              <GroupedBarChart
                data={report.by_party.slice(0, 8).map((row) => ({
                  name: row.party__name,
                  total: toNumber(row.total),
                }))}
                xKey="name"
                series={[{ key: 'total', label: 'فروش', color: '#a855f7' }]}
                height={300}
              />
            </Card>
          </div>
        </>
      )}
    </>
  )
}
