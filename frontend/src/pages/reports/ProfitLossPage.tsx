import { useEffect, useState } from 'react'
import { BadgeDollarSign, Loader2 } from 'lucide-react'

import { DonutChart, GroupedBarChart, TrendAreaChart } from '@/components/charts/Charts'
import { Card } from '@/components/ui/Card'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { Switch } from '@/components/ui/Field'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { reportsApi } from '@/services/endpoints'
import { formatCompactMoney, formatPercent, toNumber, toPersianDigits } from '@/utils/format'
import { startOfJalaliMonthIso, todayIso } from '@/utils/jalali'
import type { ProfitLossReport } from '@/types'

export function ProfitLossPage() {
  const toast = useToast()
  const [range, setRange] = useState<DateRange>({
    from: startOfJalaliMonthIso(),
    to: todayIso(),
  })
  const [compare, setCompare] = useState(true)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ProfitLossReport | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    reportsApi
      .profitLoss({
        date_from: range.from,
        date_to: range.to,
        compare,
      })
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
  }, [range.from, range.to, compare])

  const monthly = (report?.monthly ?? []).map((row) => ({
    ...row,
    net_sales: toNumber(row.net_sales),
    net_profit: toNumber(row.net_profit),
    expenses: toNumber(row.expenses),
  }))

  const expensePie = (report?.expense_breakdown ?? []).map((row) => ({
    name: row.category,
    value: toNumber(row.amount),
  }))

  return (
    <>
      <PageHeader
        title="گزارش سود و زیان"
        description="تحلیل درآمد، هزینه و سود خالص در بازه دلخواه"
        icon={<BadgeDollarSign size={20} />}
      />

      <Card className="mb-5" bodyClassName="!py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <DateRangePicker value={range} onChange={setRange} />
          <Switch label="مقایسه با دوره قبل" checked={compare} onChange={setCompare} />
        </div>
      </Card>

      {loading || !report ? (
        <div className="grid min-h-[30vh] place-items-center text-ink-400">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-500">
            بازه{' '}
            <span className="num font-medium text-ink-700 dark:text-ink-200">
              {report.date_from_jalali}
            </span>{' '}
            تا{' '}
            <span className="num font-medium text-ink-700 dark:text-ink-200">
              {report.date_to_jalali}
            </span>{' '}
            · {toPersianDigits(report.days)} روز
          </p>

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="فروش خالص"
              value={formatCompactMoney(report.revenue.net_sales)}
              hint={`${toPersianDigits(report.revenue.sale_orders_count)} فاکتور فروش`}
              tone="brand"
            />
            <StatCard
              label="سود ناخالص"
              value={formatCompactMoney(report.gross_profit)}
              hint={`حاشیه ${formatPercent(report.gross_margin_percent)}`}
              tone="success"
            />
            <StatCard
              label="هزینه‌های عملیاتی"
              value={formatCompactMoney(report.operating_expenses)}
              tone="warning"
            />
            <StatCard
              label="سود خالص"
              value={formatCompactMoney(report.net_profit)}
              hint={`حاشیه ${formatPercent(report.net_margin_percent)}`}
              tone={toNumber(report.net_profit) >= 0 ? 'purple' : 'danger'}
            />
          </div>

          {report.previous_period && (
            <Card className="mb-5" title="مقایسه با دوره قبل">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <Compare
                  label="فروش خالص"
                  current={report.revenue.net_sales}
                  previous={report.previous_period.net_sales}
                />
                <Compare
                  label="سود ناخالص"
                  current={report.gross_profit}
                  previous={report.previous_period.gross_profit}
                />
                <Compare
                  label="هزینه"
                  current={report.operating_expenses}
                  previous={report.previous_period.operating_expenses}
                  invert
                />
                <Compare
                  label="سود خالص"
                  current={report.net_profit}
                  previous={report.previous_period.net_profit}
                />
              </div>
              <p className="mt-3 text-xs text-ink-400">
                دوره قبل: {report.previous_period.date_from_jalali} تا{' '}
                {report.previous_period.date_to_jalali}
              </p>
            </Card>
          )}

          <div className="mb-5 grid gap-4 xl:grid-cols-3">
            <Card title="روند ماهانه" className="xl:col-span-2">
              <TrendAreaChart
                data={monthly}
                xKey="month"
                series={[
                  { key: 'net_sales', label: 'فروش خالص', color: '#3563ff' },
                  { key: 'net_profit', label: 'سود خالص', color: '#14b8a6' },
                ]}
              />
            </Card>
            <Card title="ترکیب هزینه‌ها">
              {expensePie.length > 0 ? (
                <DonutChart data={expensePie} />
              ) : (
                <p className="py-16 text-center text-sm text-ink-400">هزینه‌ای ثبت نشده</p>
              )}
            </Card>
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <Card title="خلاصه درآمد">
              <dl className="space-y-2 text-sm">
                <Row label="فروش ناخالص" value={report.revenue.gross_sales} />
                <Row label="تخفیفات" value={report.revenue.discounts} />
                <Row label="فروش خالص" value={report.revenue.net_sales} bold />
                <Row label="مالیات دریافتی" value={report.revenue.tax_collected} />
                <Row label="ارسال" value={report.revenue.shipping} />
                <Row label="بهای تمام‌شده کالا" value={report.cost_of_goods_sold} />
                <Row label="سود ناخالص" value={report.gross_profit} bold />
              </dl>
            </Card>
            <Card title="خلاصه هزینه و سود">
              <dl className="space-y-2 text-sm">
                <Row label="هزینه عملیاتی" value={report.operating_expenses} />
                <Row label="سود عملیاتی" value={report.operating_profit} />
                <Row label="سایر درآمدها" value={report.other_income} />
                <Row label="خریدها" value={report.purchases.total} />
                <Row
                  label="چک‌های برگشتی"
                  value={`${formatCompactMoney(report.bounced_cheques.amount)} (${toPersianDigits(
                    report.bounced_cheques.count,
                  )} فقره)`}
                  raw
                />
                <Row label="سود خالص" value={report.net_profit} bold />
              </dl>
            </Card>
          </div>

          {monthly.length > 0 && (
            <Card title="مقایسه ماهانه فروش و هزینه">
              <GroupedBarChart
                data={monthly}
                xKey="month"
                series={[
                  { key: 'net_sales', label: 'فروش', color: '#3563ff' },
                  { key: 'expenses', label: 'هزینه', color: '#f59e0b' },
                  { key: 'net_profit', label: 'سود', color: '#14b8a6' },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </>
  )
}

function Row({
  label,
  value,
  bold,
  raw,
}: {
  label: string
  value: string
  bold?: boolean
  raw?: boolean
}) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? 'border-t border-ink-100 pt-2 font-semibold dark:border-ink-800' : ''}`}>
      <dt className="text-ink-500">{label}</dt>
      <dd>{raw ? value : <Money value={value} />}</dd>
    </div>
  )
}

function Compare({
  label,
  current,
  previous,
  invert = false,
}: {
  label: string
  current: string
  previous: string
  invert?: boolean
}) {
  const diff = toNumber(current) - toNumber(previous)
  const better = invert ? diff <= 0 : diff >= 0
  return (
    <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-800/40">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 font-semibold">
        <Money value={current} />
      </p>
      <p className={`mt-1 text-xs ${better ? 'text-teal-600' : 'text-rose-600'}`}>
        نسبت به قبل: {diff >= 0 ? '+' : '−'}
        {formatCompactMoney(Math.abs(diff))}
      </p>
    </div>
  )
}
