import { Link } from 'react-router-dom'
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Download,
  ShoppingBag,
  Store,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/Misc'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { reportsApi } from '@/services/endpoints'

const LINKS = [
  {
    to: '/reports/profit-loss',
    title: 'سود و زیان',
    description: 'درآمد، بهای تمام‌شده، هزینه‌ها و سود خالص با بازه تاریخ شمسی',
    icon: BadgeDollarSign,
    capability: 'reports.profit_loss' as const,
    tone: 'from-brand-500 to-violet-500',
  },
  {
    to: '/reports/sales',
    title: 'گزارش فروش',
    description: 'فروش به تفکیک کالا، مشتری و روند زمانی',
    icon: Store,
    capability: 'reports.view' as const,
    tone: 'from-teal-500 to-emerald-500',
  },
  {
    to: '/reports/purchases',
    title: 'گزارش خرید',
    description: 'خرید از تأمین‌کنندگان و اقلام ورودی',
    icon: ShoppingBag,
    capability: 'reports.view' as const,
    tone: 'from-sky-500 to-blue-600',
  },
  {
    to: '/reports/receivables',
    title: 'بدهکار و بستانکار',
    description: 'وضعیت مطالبات و بدهی‌های جاری فروشگاه',
    icon: Users,
    capability: 'reports.view' as const,
    tone: 'from-amber-500 to-orange-500',
  },
  {
    to: '/reports/inventory',
    title: 'گزارش موجودی',
    description: 'ارزش انبار، کمبود موجودی و تفکیک دسته‌ها',
    icon: Boxes,
    capability: 'reports.view' as const,
    tone: 'from-rose-500 to-pink-500',
  },
]

export function ReportsHubPage() {
  const { can } = useAuth()
  const toast = useToast()
  const { data: catalog } = useAsync(() => reportsApi.catalog(), [])

  const exportReport = async (key: string, title: string) => {
    try {
      await reportsApi.export(key, undefined, `${title}.csv`)
      toast.success('فایل خروجی آماده شد.')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'خروجی گرفته نشد.')
    }
  }

  return (
    <>
      <PageHeader
        title="مرکز گزارش‌ها"
        description="همه گزارش‌های مدیریتی و مالی فروشگاه در یک نگاه"
        icon={<BarChart3 size={20} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LINKS.filter((item) => can(item.capability)).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="card card-hover group relative overflow-hidden p-5"
          >
            <div
              className={`absolute -left-8 -top-8 size-28 rounded-full bg-gradient-to-br ${item.tone} opacity-20 blur-2xl transition group-hover:opacity-35`}
            />
            <div className="relative">
              <span
                className={`mb-4 grid size-11 place-items-center rounded-2xl bg-gradient-to-br ${item.tone} text-white shadow-card`}
              >
                <item.icon size={20} />
              </span>
              <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
                {item.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {catalog && catalog.length > 0 && (
        <Card className="mt-6" title="خروجی فایل CSV">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalog
              .filter(
                (item) =>
                  item.allowed && ['sales', 'inventory', 'receivables'].includes(item.key),
              )
              .map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-4 py-3 dark:border-ink-800"
                >
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-ink-400">{item.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download size={14} />}
                    onClick={() => void exportReport(item.key, item.title)}
                  >
                    CSV
                  </Button>
                </div>
              ))}
          </div>
        </Card>
      )}
    </>
  )
}
