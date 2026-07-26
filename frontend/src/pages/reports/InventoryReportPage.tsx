import { useEffect, useState } from 'react'
import { Boxes, Download, Loader2 } from 'lucide-react'

import { DonutChart } from '@/components/charts/Charts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { reportsApi } from '@/services/endpoints'
import { formatCompactMoney, formatQuantity, toNumber, toPersianDigits } from '@/utils/format'
import type { InventoryReport } from '@/types'

export function InventoryReportPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<InventoryReport | null>(null)

  useEffect(() => {
    reportsApi
      .inventory()
      .then(setReport)
      .catch((error) => {
        toast.error(error instanceof ApiError ? error.message : 'گزارش بارگذاری نشد.')
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading || !report) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink-400">
        <Loader2 className="animate-spin" size={28} />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="گزارش موجودی"
        description="ارزش انبار و وضعیت کمبود کالا"
        icon={<Boxes size={20} />}
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={() => void reportsApi.export('inventory', undefined, 'موجودی.csv')}
          >
            خروجی CSV
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="تعداد کالا"
          value={toPersianDigits(report.total_products)}
          tone="brand"
        />
        <StatCard
          label="ارزش خرید موجودی"
          value={formatCompactMoney(report.total_stock_value)}
          tone="purple"
        />
        <StatCard
          label="ارزش فروش موجودی"
          value={formatCompactMoney(report.total_retail_value)}
          tone="success"
        />
        <StatCard
          label="سود بالقوه"
          value={formatCompactMoney(report.potential_profit)}
          hint={`${toPersianDigits(report.low_stock.length)} کالای کم‌موجود`}
          tone="warning"
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="ارزش به تفکیک دسته">
          <DonutChart
            data={report.by_category.map((row) => ({
              name: row.category || 'بدون دسته',
              value: toNumber(row.value),
            }))}
          />
        </Card>
        <Card title="کمبود موجودی / اتمام">
          <div className="max-h-80 space-y-2 overflow-auto">
            {[...report.out_of_stock, ...report.low_stock].slice(0, 20).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2.5 dark:bg-ink-800/40"
              >
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-ink-400">
                    {formatQuantity(item.stock_quantity, item.unit_display)} / نقطه سفارش{' '}
                    {formatQuantity(item.reorder_point)}
                  </p>
                </div>
                <Badge tone={item.stock_state === 'out' ? 'danger' : 'warning'}>
                  {item.stock_state_display}
                </Badge>
              </div>
            ))}
            {report.out_of_stock.length + report.low_stock.length === 0 && (
              <p className="py-10 text-center text-sm text-ink-400">کمبودی ثبت نشده است</p>
            )}
          </div>
        </Card>
      </div>

      <Card title="همه کالاها" bodyClassName="!p-0 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-ink-50 text-ink-500 dark:bg-ink-800/60">
            <tr>
              <th className="px-4 py-3 text-right">کالا</th>
              <th className="px-4 py-3 text-right">موجودی</th>
              <th className="px-4 py-3 text-right">ارزش خرید</th>
              <th className="px-4 py-3 text-right">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {report.items.slice(0, 50).map((item) => (
              <tr key={item.id} className="border-t border-ink-100 dark:border-ink-800">
                <td className="px-4 py-3">
                  {item.name}
                  <span className="mt-0.5 block text-xs text-ink-400">{item.sku}</span>
                </td>
                <td className="px-4 py-3 num">
                  {formatQuantity(item.stock_quantity, item.unit_display)}
                </td>
                <td className="px-4 py-3">
                  <Money value={item.stock_value} />
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      item.stock_state === 'out'
                        ? 'danger'
                        : item.stock_state === 'low'
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {item.stock_state_display}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
