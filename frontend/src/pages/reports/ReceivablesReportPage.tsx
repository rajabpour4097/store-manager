import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'

import { Card } from '@/components/ui/Card'
import { Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { reportsApi } from '@/services/endpoints'
import { formatCompactMoney, toPersianDigits } from '@/utils/format'
import type { ReceivablesReport } from '@/types'

export function ReceivablesReportPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReceivablesReport | null>(null)

  useEffect(() => {
    reportsApi
      .receivables()
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
        title="بدهکار و بستانکار"
        description={`وضعیت مانده‌ها تا ${report.as_of_jalali}`}
        icon={<Users size={20} />}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مطالبات (بدهکاران)"
          value={formatCompactMoney(report.total_receivable)}
          hint={`${toPersianDigits(report.debtor_count)} طرف حساب`}
          tone="danger"
        />
        <StatCard
          label="بدهی‌ها (بستانکاران)"
          value={formatCompactMoney(report.total_payable)}
          hint={`${toPersianDigits(report.creditor_count)} طرف حساب`}
          tone="success"
        />
        <StatCard
          label="موقعیت خالص"
          value={formatCompactMoney(report.net_position)}
          tone="brand"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="بدهکاران">
          <PartyList rows={report.debtors} tone="danger" />
        </Card>
        <Card title="بستانکاران">
          <PartyList rows={report.creditors} tone="success" />
        </Card>
      </div>
    </>
  )
}

function PartyList({
  rows,
  tone,
}: {
  rows: ReceivablesReport['debtors'] | ReceivablesReport['creditors']
  tone: 'danger' | 'success'
}) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-400">موردی نیست</p>
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Link
          key={row.id}
          to={`/parties/${row.id}`}
          className="flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
        >
          <div>
            <p className="text-sm font-medium">{row.name}</p>
            <p className="text-xs text-ink-400">
              {row.code} · {row.party_type_display}
            </p>
          </div>
          <Money
            value={row.balance}
            className={`font-semibold ${tone === 'danger' ? 'text-rose-600' : 'text-teal-600'}`}
          />
        </Link>
      ))}
    </div>
  )
}
