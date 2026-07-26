import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, FileText, Mail, MapPin, Phone, Wallet } from 'lucide-react'

import { BALANCE_STATE_TONES, Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { ErrorState, Money, PageHeader, StatCard } from '@/components/ui/Misc'
import { useAsync } from '@/hooks/useAsync'
import { partiesApi } from '@/services/endpoints'
import { formatCompactMoney, toNumber, toPersianDigits } from '@/utils/format'
import { startOfJalaliYearIso, todayIso } from '@/utils/jalali'
import type { StatementRow } from '@/types'

export function PartyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const partyId = Number(id)

  const [range, setRange] = useState<DateRange>({
    from: startOfJalaliYearIso(),
    to: todayIso(),
  })

  const { data, loading, error, reload } = useAsync(
    () => partiesApi.statement(partyId, { date_from: range.from, date_to: range.to }),
    [partyId, range.from, range.to],
    { skip: !Number.isFinite(partyId) },
  )

  const party = data?.party
  const totals = data?.totals

  const columns: Array<Column<StatementRow>> = [
    {
      key: 'date',
      header: 'تاریخ',
      render: (row) => <span className="num">{row.date_jalali}</span>,
    },
    {
      key: 'category',
      header: 'شرح',
      render: (row) => (
        <div>
          <span className="block text-sm">{row.description || row.category_display}</span>
          <span className="block text-xs text-ink-400">
            {row.category_display}
            {row.document_number ? ` · سند ${toPersianDigits(row.document_number)}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'debit',
      header: 'بدهکار',
      render: (row) =>
        toNumber(row.debit) > 0 ? (
          <Money value={row.debit} className="text-rose-600 dark:text-rose-400" />
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'credit',
      header: 'بستانکار',
      render: (row) =>
        toNumber(row.credit) > 0 ? (
          <Money value={row.credit} className="text-teal-600 dark:text-teal-400" />
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'running',
      header: 'مانده',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <Money value={Math.abs(toNumber(row.running_balance))} className="font-semibold" />
          <span className="text-[11px] text-ink-400">
            {toNumber(row.running_balance) > 0
              ? 'بدهکار'
              : toNumber(row.running_balance) < 0
                ? 'بستانکار'
                : ''}
          </span>
        </span>
      ),
    },
  ]

  if (error) {
    return (
      <>
        <PageHeader title="صورتحساب طرف حساب" icon={<FileText size={20} />} />
        <ErrorState message={error} onRetry={reload} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={party?.name ?? 'صورتحساب طرف حساب'}
        description={
          party ? (
            <span className="flex flex-wrap items-center gap-3">
              <span className="num">کد {party.code}</span>
              <Badge tone="brand">{party.party_type_display}</Badge>
              {party.mobile && (
                <span className="num flex items-center gap-1">
                  <Phone size={13} /> {toPersianDigits(party.mobile)}
                </span>
              )}
              {party.city && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} /> {party.city}
                </span>
              )}
              {party.email && (
                <span className="flex items-center gap-1" dir="ltr">
                  <Mail size={13} /> {party.email}
                </span>
              )}
            </span>
          ) : undefined
        }
        icon={<Wallet size={20} />}
        actions={
          <Link to="/parties" className="btn-secondary btn-sm">
            <ArrowRight size={15} />
            بازگشت به فهرست
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مانده اول دوره"
          value={formatCompactMoney(totals?.opening_balance)}
          tone="neutral"
          loading={loading}
        />
        <StatCard
          label="جمع بدهکار دوره"
          value={formatCompactMoney(totals?.total_debit)}
          tone="danger"
          loading={loading}
        />
        <StatCard
          label="جمع بستانکار دوره"
          value={formatCompactMoney(totals?.total_credit)}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="مانده پایان دوره"
          value={formatCompactMoney(Math.abs(toNumber(totals?.closing_balance)))}
          hint={
            toNumber(totals?.closing_balance) > 0
              ? 'بدهکار به فروشگاه'
              : toNumber(totals?.closing_balance) < 0
                ? 'بستانکار از فروشگاه'
                : 'تسویه‌شده'
          }
          tone={toNumber(totals?.closing_balance) > 0 ? 'danger' : 'success'}
          loading={loading}
        />
      </div>

      <Card className="mb-4" bodyClassName="!py-4">
        <DateRangePicker value={range} onChange={setRange} />
      </Card>

      {party && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <InfoBox label="مانده فعلی">
            <span className="flex items-center gap-2">
              <Money value={Math.abs(toNumber(party.balance))} className="font-bold" />
              <Badge tone={BALANCE_STATE_TONES[party.balance_state] ?? 'neutral'}>
                {party.balance_state_display}
              </Badge>
            </span>
          </InfoBox>
          <InfoBox label="سقف اعتبار">
            {toNumber(party.credit_limit) > 0 ? (
              <Money value={party.credit_limit} />
            ) : (
              <span className="text-sm text-ink-400">بدون محدودیت</span>
            )}
          </InfoBox>
          <InfoBox label="نشانی">
            <span className="text-sm">{party.address || '—'}</span>
          </InfoBox>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.rows ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        emptyMessage="در این بازه سندی برای این طرف حساب ثبت نشده است."
      />
    </>
  )
}

function InfoBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] text-ink-400">{label}</p>
      <div className="mt-1 text-ink-800 dark:text-ink-100">{children}</div>
    </div>
  )
}
