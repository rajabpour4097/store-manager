import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Coins,
  LayoutDashboard,
  Lightbulb,
  PiggyBank,
  Receipt,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { Card } from '@/components/ui/Card'
import { DateRangePicker, defaultRange, type DateRange } from '@/components/ui/DateRangePicker'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { DonutChart, GroupedBarChart, TrendAreaChart } from '@/components/charts/Charts'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/contexts/AuthContext'
import { reportsApi } from '@/services/endpoints'
import { formatCompactMoney, formatNumber, formatPercent, toNumber, toPersianDigits } from '@/utils/format'
import { jalaliMonthLabel } from '@/utils/jalali'

export function DashboardPage() {
  const { user, can } = useAuth()
  const [range, setRange] = useState<DateRange>(defaultRange)

  const { data, loading, error, reload } = useAsync(
    () => reportsApi.dashboard({ date_from: range.from, date_to: range.to }),
    [range.from, range.to],
    { skip: !can('reports.view') },
  )

  const dailySeries = useMemo(
    () =>
      (data?.daily_series ?? []).map((item) => ({
        label: item.label,
        فروش: toNumber(item.sales),
        سود: toNumber(item.profit),
      })),
    [data],
  )

  const monthlySeries = useMemo(
    () =>
      (data?.monthly_trend ?? []).map((item) => ({
        label: jalaliMonthLabel(item.month),
        'فروش خالص': toNumber(item.net_sales),
        'سود ناخالص': toNumber(item.gross_profit),
        'سود خالص': toNumber(item.net_profit),
      })),
    [data],
  )

  const topProductsDonut = useMemo(
    () =>
      (data?.top_products ?? []).slice(0, 6).map((item) => ({
        name: item.product_name,
        value: toNumber(item.revenue),
      })),
    [data],
  )

  if (!can('reports.view')) {
    return (
      <>
        <PageHeader
          title={`سلام ${user?.first_name || user?.display_name || ''}`}
          description="به سامانه مدیریت فروشگاه خوش آمدید."
          icon={<LayoutDashboard size={20} />}
        />
        <Card>
          <p className="py-8 text-center text-sm text-ink-500">
            دسترسی مشاهده گزارش‌ها برای حساب شما فعال نیست. از منوی کنار به بخش‌های مجاز بروید.
          </p>
        </Card>
      </>
    )
  }

  if (error) {
    return (
      <>
        <PageHeader title="داشبورد" icon={<LayoutDashboard size={20} />} />
        <ErrorState message={error} onRetry={reload} />
      </>
    )
  }

  const kpis = data?.kpis
  const cheques = data?.cheques
  const netMargin = toNumber(kpis?.net_margin_percent)

  return (
    <>
      <PageHeader
        title={`سلام ${user?.first_name || user?.display_name || ''} 👋`}
        description={
          data
            ? `گزارش بازه ${data.date_from_jalali} تا ${data.date_to_jalali}`
            : 'در حال آماده‌سازی گزارش…'
        }
        icon={<LayoutDashboard size={20} />}
      />

      <Card className="mb-5" bodyClassName="!py-4">
        <DateRangePicker value={range} onChange={setRange} />
      </Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="فروش خالص دوره"
          value={formatCompactMoney(kpis?.net_sales)}
          hint={`${toPersianDigits(kpis?.sale_orders_count ?? 0)} فاکتور فروش`}
          icon={<Coins size={18} />}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label="سود ناخالص"
          value={formatCompactMoney(kpis?.gross_profit)}
          hint={`حاشیه سود خالص ${formatPercent(netMargin)}`}
          icon={<TrendingUp size={18} />}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="سود خالص"
          value={formatCompactMoney(kpis?.net_profit)}
          hint={`هزینه‌های عملیاتی ${formatCompactMoney(kpis?.operating_expenses)}`}
          icon={netMargin >= 0 ? <PiggyBank size={18} /> : <TrendingDown size={18} />}
          tone={toNumber(kpis?.net_profit) >= 0 ? 'success' : 'danger'}
          loading={loading}
        />
        <StatCard
          label="خرید دوره"
          value={formatCompactMoney(kpis?.purchases_total)}
          hint="مجموع فاکتورهای خرید ثبت‌شده"
          icon={<ShoppingCart size={18} />}
          tone="purple"
          loading={loading}
        />
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مجموع مطالبات (بدهکاران)"
          value={formatCompactMoney(kpis?.total_receivable)}
          hint="مانده‌ی حساب مشتریان بدهکار"
          icon={<Wallet size={18} />}
          tone="danger"
          loading={loading}
        />
        <StatCard
          label="مجموع بدهی‌ها (بستانکاران)"
          value={formatCompactMoney(kpis?.total_payable)}
          hint="مانده‌ی حساب تأمین‌کنندگان"
          icon={<Receipt size={18} />}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label="چک‌های دریافتی باز"
          value={formatCompactMoney(cheques?.receivable_open_amount)}
          hint={`${toPersianDigits(cheques?.receivable_open_count ?? 0)} فقره در جریان`}
          icon={<ArrowDownToLine size={18} />}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="چک‌های پرداختی باز"
          value={formatCompactMoney(cheques?.payable_open_amount)}
          hint={`${toPersianDigits(cheques?.payable_open_count ?? 0)} فقره در جریان`}
          icon={<ArrowUpFromLine size={18} />}
          tone="brand"
          loading={loading}
        />
      </div>

      {/* هشدارهای عملیاتی */}
      {!loading && data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AlertTile
            to="/cheques/receivable"
            tone={cheques && cheques.overdue_count > 0 ? 'danger' : 'neutral'}
            icon={<AlertTriangle size={16} />}
            title="چک سرسید گذشته"
            value={cheques?.overdue_count ?? 0}
            suffix="فقره"
          />
          <AlertTile
            to="/cheques/calendar"
            tone={cheques && cheques.due_7_days_count > 0 ? 'warning' : 'neutral'}
            icon={<ArrowUpFromLine size={16} />}
            title="سرسید ۷ روز آینده"
            value={cheques?.due_7_days_count ?? 0}
            suffix="فقره"
          />
          <AlertTile
            to="/products"
            tone={data.inventory.low_stock_count > 0 ? 'warning' : 'neutral'}
            icon={<Boxes size={16} />}
            title="کالای زیر نقطه سفارش"
            value={data.inventory.low_stock_count}
            suffix={`از ${toPersianDigits(data.inventory.total_products)} کالا`}
          />
          <AlertTile
            to="/suggestions"
            tone={data.suggestions.pending_count > 0 ? 'brand' : 'neutral'}
            icon={<Lightbulb size={16} />}
            title="پیشنهاد خرید در انتظار"
            value={data.suggestions.pending_count}
            suffix={`${toPersianDigits(data.suggestions.critical_count)} مورد بحرانی`}
          />
        </div>
      )}

      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        <Card
          title="روند فروش و سود روزانه"
          subtitle="بر پایه فاکتورهای تأیید‌شده در بازه انتخابی"
          className="xl:col-span-2"
        >
          {dailySeries.length > 0 ? (
            <TrendAreaChart
              data={dailySeries}
              xKey="label"
              series={[
                { key: 'فروش', label: 'فروش', color: '#3563ff' },
                { key: 'سود', label: 'سود', color: '#14b8a6' },
              ]}
            />
          ) : (
            <p className="py-16 text-center text-sm text-ink-400">
              در این بازه فروشی ثبت نشده است.
            </p>
          )}
        </Card>

        <Card title="سهم کالاها از فروش" subtitle="۶ کالای پرفروش دوره">
          {topProductsDonut.length > 0 ? (
            <DonutChart data={topProductsDonut} />
          ) : (
            <p className="py-16 text-center text-sm text-ink-400">داده‌ای موجود نیست.</p>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        <Card
          title="روند ماهانه سود و زیان"
          subtitle="مقایسه فروش خالص، سود ناخالص و سود خالص"
          className="xl:col-span-2"
        >
          {monthlySeries.length > 0 ? (
            <GroupedBarChart
              data={monthlySeries}
              xKey="label"
              series={[
                { key: 'فروش خالص', label: 'فروش خالص', color: '#3563ff' },
                { key: 'سود ناخالص', label: 'سود ناخالص', color: '#14b8a6' },
                { key: 'سود خالص', label: 'سود خالص', color: '#f59e0b' },
              ]}
            />
          ) : (
            <p className="py-16 text-center text-sm text-ink-400">داده‌ای موجود نیست.</p>
          )}
        </Card>

        <Card title="کالاهای پرفروش" subtitle="به ترتیب مبلغ فروش" noPadding>
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {(data?.top_products ?? []).slice(0, 8).map((item, index) => (
              <li key={item.product_id} className="flex items-center gap-3 px-5 py-3">
                <span className="num grid size-7 shrink-0 place-items-center rounded-lg bg-ink-100 text-xs font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                  {toPersianDigits(index + 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-800 dark:text-ink-100">
                    {item.product_name}
                  </span>
                  <span className="block text-xs text-ink-400">
                    {formatNumber(item.quantity)} {item.unit_display}
                  </span>
                </span>
                <Money value={item.revenue} className="text-sm font-semibold" />
              </li>
            ))}
            {(data?.top_products ?? []).length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-ink-400">داده‌ای موجود نیست.</li>
            )}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="بیشترین بدهکاران"
          subtitle="مانده‌ی حساب مشتریان"
          noPadding
          actions={
            <Link to="/parties?state=debtor" className="btn-ghost btn-sm">
              مشاهده همه
            </Link>
          }
        >
          <PartyList rows={data?.top_debtors ?? []} tone="danger" />
        </Card>
        <Card
          title="بیشترین بستانکاران"
          subtitle="مانده‌ی حساب تأمین‌کنندگان"
          noPadding
          actions={
            <Link to="/parties?state=creditor" className="btn-ghost btn-sm">
              مشاهده همه
            </Link>
          }
        >
          <PartyList rows={data?.top_creditors ?? []} tone="success" />
        </Card>
      </div>
    </>
  )
}

function PartyList({
  rows,
  tone,
}: {
  rows: Array<{ id: number; name: string; code: string; party_type_display: string; balance: string }>
  tone: 'danger' | 'success'
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-ink-400">موردی وجود ندارد.</p>
  }
  return (
    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
      {rows.slice(0, 7).map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
          <Link to={`/parties/${row.id}`} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink-800 hover:text-brand-600 dark:text-ink-100">
              {row.name}
            </span>
            <span className="num block text-xs text-ink-400">{row.code}</span>
          </Link>
          <Badge tone={tone}>
            <Money value={Math.abs(toNumber(row.balance))} />
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function AlertTile({
  to,
  tone,
  icon,
  title,
  value,
  suffix,
}: {
  to: string
  tone: 'danger' | 'warning' | 'brand' | 'neutral'
  icon: React.ReactNode
  title: string
  value: number
  suffix: string
}) {
  const tones = {
    danger: 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
    warning:
      'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
    brand:
      'border-brand-200 bg-brand-50/70 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200',
    neutral:
      'border-ink-200 bg-white text-ink-600 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-300',
  }
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-card ${tones[tone]}`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/70 dark:bg-white/10">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{title}</span>
        <span className="block text-sm">
          <span className="num font-bold">{toPersianDigits(value)}</span>{' '}
          <span className="text-[11px] opacity-80">{suffix}</span>
        </span>
      </span>
    </Link>
  )
}
