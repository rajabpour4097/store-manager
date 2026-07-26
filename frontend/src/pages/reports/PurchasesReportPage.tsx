import { useEffect, useState } from 'react'
import { Loader2, ShoppingBag } from 'lucide-react'

import { GroupedBarChart } from '@/components/charts/Charts'
import { Card } from '@/components/ui/Card'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { reportsApi } from '@/services/endpoints'
import { formatCompactMoney, formatQuantity, toNumber, toPersianDigits } from '@/utils/format'
import { addDaysIso, todayIso } from '@/utils/jalali'
import type { PurchaseReport } from '@/types'

export function PurchasesReportPage() {
  const toast = useToast()
  const [range, setRange] = useState<DateRange>({ from: addDaysIso(-29), to: todayIso() })
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<PurchaseReport | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    reportsApi
      .purchases({ date_from: range.from, date_to: range.to })
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

  return (
    <>
      <PageHeader
        title="گزارش خرید"
        description="خرید از تأمین‌کنندگان در بازه انتخابی"
        icon={<ShoppingBag size={20} />}
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
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="جمع خرید"
              value={formatCompactMoney(report.totals.total_amount)}
              hint={`${toPersianDigits(report.totals.orders_count)} سفارش`}
              tone="brand"
            />
            <StatCard
              label="پرداخت‌شده"
              value={formatCompactMoney(report.totals.paid_amount)}
              tone="success"
            />
            <StatCard
              label="باقیمانده پرداخت"
              value={formatCompactMoney(report.totals.remaining_amount)}
              tone="warning"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="تأمین‌کنندگان">
              <GroupedBarChart
                data={report.by_supplier.slice(0, 8).map((row) => ({
                  name: row.party__name,
                  total: toNumber(row.total),
                }))}
                xKey="name"
                series={[{ key: 'total', label: 'خرید', color: '#0ea5e9' }]}
              />
            </Card>
            <Card title="کالاهای خریداری‌شده">
              <div className="space-y-3">
                {report.by_product.slice(0, 10).map((item) => (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2.5 dark:bg-ink-800/40"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-ink-400">{formatQuantity(item.quantity)}</p>
                    </div>
                    <Money value={item.amount} className="font-semibold" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  )
}
