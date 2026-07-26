import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CalendarRange } from 'lucide-react'

import { Badge, CHEQUE_STATUS_TONES, DUE_STATE_TONES } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { SelectInput } from '@/components/ui/Field'
import { ErrorState, Money, PageHeader, Spinner, StatCard } from '@/components/ui/Misc'
import { GroupedBarChart } from '@/components/charts/Charts'
import { ChequeDetailModal } from './ChequeDetailModal'
import { useAsync } from '@/hooks/useAsync'
import { chequesApi } from '@/services/endpoints'
import { formatCompactMoney, toNumber, toPersianDigits } from '@/utils/format'
import { jalaliMonthLabel } from '@/utils/jalali'

const MONTH_OPTIONS = [
  { value: '3', label: '۳ ماه آینده' },
  { value: '6', label: '۶ ماه آینده' },
  { value: '12', label: '۱۲ ماه آینده' },
]

export function ChequeCalendarPage() {
  const [months, setMonths] = useState('6')
  const [detailId, setDetailId] = useState<number | null>(null)

  const { data, loading, error, reload } = useAsync(
    () => chequesApi.calendar(Number(months)),
    [months],
  )

  const chartData = useMemo(
    () =>
      (data?.months ?? []).map((month) => ({
        label: jalaliMonthLabel(month.month),
        دریافتی: toNumber(month.receivable_amount),
        پرداختی: toNumber(month.payable_amount),
      })),
    [data],
  )

  const totals = useMemo(() => {
    const rows = data?.months ?? []
    const receivable = rows.reduce((sum, row) => sum + toNumber(row.receivable_amount), 0)
    const payable = rows.reduce((sum, row) => sum + toNumber(row.payable_amount), 0)
    const count = rows.reduce((sum, row) => sum + row.payable_count + row.receivable_count, 0)
    return { receivable, payable, net: receivable - payable, count }
  }, [data])

  return (
    <>
      <PageHeader
        title="تقویم سرسید چک‌ها"
        description="نمای ماه‌به‌ماه چک‌های در جریان برای برنامه‌ریزی نقدینگی"
        icon={<CalendarRange size={20} />}
        actions={
          <SelectInput
            value={months}
            onChange={setMonths}
            options={MONTH_OPTIONS}
            className="!py-2"
          />
        }
      />

      {error && <ErrorState message={error} onRetry={reload} />}

      {!error && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="جمع چک‌های دریافتی"
              value={formatCompactMoney(totals.receivable)}
              icon={<ArrowDownToLine size={18} />}
              tone="success"
              loading={loading}
            />
            <StatCard
              label="جمع چک‌های پرداختی"
              value={formatCompactMoney(totals.payable)}
              icon={<ArrowUpFromLine size={18} />}
              tone="danger"
              loading={loading}
            />
            <StatCard
              label="خالص جریان نقدی چک"
              value={formatCompactMoney(totals.net)}
              hint={totals.net >= 0 ? 'ورودی بیشتر از خروجی' : 'خروجی بیشتر از ورودی'}
              tone={totals.net >= 0 ? 'success' : 'warning'}
              loading={loading}
            />
            <StatCard
              label="تعداد چک‌های در جریان"
              value={`${toPersianDigits(totals.count)} فقره`}
              tone="brand"
              loading={loading}
            />
          </div>

          <Card title="مقایسه ماهانه سرسیدها" className="mb-5">
            {loading ? (
              <Spinner />
            ) : chartData.length > 0 ? (
              <GroupedBarChart
                data={chartData}
                xKey="label"
                series={[
                  { key: 'دریافتی', label: 'دریافتی', color: '#14b8a6' },
                  { key: 'پرداختی', label: 'پرداختی', color: '#f43f5e' },
                ]}
              />
            ) : (
              <p className="py-16 text-center text-sm text-ink-400">
                چک در جریانی برای این بازه وجود ندارد.
              </p>
            )}
          </Card>

          {loading && !data && <Spinner />}

          <div className="grid gap-4 lg:grid-cols-2">
            {(data?.months ?? []).map((month) => (
              <Card
                key={month.month}
                title={jalaliMonthLabel(month.month)}
                subtitle={
                  <span className="flex flex-wrap gap-3">
                    <span className="text-teal-600 dark:text-teal-400">
                      دریافتی: <Money value={month.receivable_amount} /> (
                      {toPersianDigits(month.receivable_count)})
                    </span>
                    <span className="text-rose-600 dark:text-rose-400">
                      پرداختی: <Money value={month.payable_amount} /> (
                      {toPersianDigits(month.payable_count)})
                    </span>
                  </span>
                }
                actions={
                  <Badge tone={toNumber(month.net) >= 0 ? 'success' : 'danger'}>
                    خالص: <Money value={month.net} />
                  </Badge>
                }
                noPadding
              >
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {month.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setDetailId(item.id)}
                        className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-brand-50/50 dark:hover:bg-ink-800/40"
                      >
                        <span
                          className={
                            item.direction === 'receivable'
                              ? 'grid size-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/15'
                              : 'grid size-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/15'
                          }
                        >
                          {item.direction === 'receivable' ? (
                            <ArrowDownToLine size={14} />
                          ) : (
                            <ArrowUpFromLine size={14} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink-800 dark:text-ink-100">
                            {item.party_name}
                          </span>
                          <span className="num block text-xs text-ink-400">
                            {item.serial_number} · {item.due_date_jalali}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Money value={item.amount} className="text-sm font-semibold" />
                          <span className="flex gap-1">
                            <Badge tone={CHEQUE_STATUS_TONES[item.status] ?? 'neutral'}>
                              {item.status_display}
                            </Badge>
                            <Badge tone={DUE_STATE_TONES[item.due_state] ?? 'neutral'}>
                              {item.due_state === 'overdue' ? 'گذشته' : 'در پیش'}
                            </Badge>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          {!loading && (data?.months ?? []).length === 0 && (
            <Card>
              <p className="py-12 text-center text-sm text-ink-400">
                در این بازه چک در جریانی وجود ندارد.
              </p>
            </Card>
          )}
        </>
      )}

      <ChequeDetailModal
        open={detailId !== null}
        chequeId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={reload}
      />
    </>
  )
}
