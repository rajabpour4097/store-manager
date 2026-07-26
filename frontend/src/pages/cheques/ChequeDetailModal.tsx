import { useEffect, useState } from 'react'
import { CalendarClock, History, Repeat } from 'lucide-react'

import { Badge, CHEQUE_STATUS_TONES, DUE_STATE_TONES } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectInput, TextArea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Money, Spinner } from '@/components/ui/Misc'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { chequesApi } from '@/services/endpoints'
import { formatDayDistance } from '@/utils/format'
import { addDaysIso, todayIso } from '@/utils/jalali'
import type { Cheque } from '@/types'

interface ChequeDetailModalProps {
  open: boolean
  chequeId: number | null
  onClose: () => void
  onChanged: () => void
}

export function ChequeDetailModal({ open, chequeId, onClose, onChanged }: ChequeDetailModalProps) {
  const toast = useToast()
  const { can } = useAuth()
  const [cheque, setCheque] = useState<Cheque | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'view' | 'status' | 'extend'>('view')
  const [status, setStatus] = useState('')
  const [eventDate, setEventDate] = useState(todayIso())
  const [newDueDate, setNewDueDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!chequeId) return
    setLoading(true)
    chequesApi
      .get(chequeId)
      .then((data) => {
        setCheque(data)
        setNewDueDate(addDaysIso(30, data.due_date))
      })
      .catch((error) => toast.error(error instanceof ApiError ? error.message : 'خطا در دریافت چک'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open && chequeId) {
      setMode('view')
      setStatus('')
      setNote('')
      setEventDate(todayIso())
      load()
    } else if (!open) {
      setCheque(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chequeId])

  const submitStatus = async () => {
    if (!cheque || !status) return
    setSaving(true)
    try {
      await chequesApi.changeStatus(cheque.id, { status, event_date: eventDate, note })
      toast.success('وضعیت چک به‌روزرسانی شد.')
      setMode('view')
      setNote('')
      load()
      onChanged()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'تغییر وضعیت انجام نشد.')
    } finally {
      setSaving(false)
    }
  }

  const submitExtend = async () => {
    if (!cheque || !newDueDate) return
    setSaving(true)
    try {
      await chequesApi.extend(cheque.id, { due_date: newDueDate, note })
      toast.success('سرسید چک تمدید شد.')
      setMode('view')
      setNote('')
      load()
      onChanged()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'تمدید سرسید انجام نشد.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={cheque ? `چک شماره ${cheque.serial_number}` : 'جزئیات چک'}
      subtitle={cheque ? `${cheque.direction_display} · ${cheque.bank_display}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            بستن
          </Button>
          {cheque?.is_open && can('cheques.change') && mode === 'view' && (
            <>
              <Button variant="secondary" icon={<CalendarClock size={15} />} onClick={() => setMode('extend')}>
                تمدید سرسید
              </Button>
              {cheque.allowed_transitions.length > 0 && (
                <Button icon={<Repeat size={15} />} onClick={() => setMode('status')}>
                  تغییر وضعیت
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      {loading && <Spinner />}

      {!loading && cheque && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InfoTile label="مبلغ" value={<Money value={cheque.amount} className="font-bold" />} />
            <InfoTile
              label="وضعیت"
              value={
                <Badge tone={CHEQUE_STATUS_TONES[cheque.status] ?? 'neutral'}>
                  {cheque.status_display}
                </Badge>
              }
            />
            <InfoTile
              label="سرسید"
              value={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="num">{cheque.due_date_jalali}</span>
                  <Badge tone={DUE_STATE_TONES[cheque.due_state] ?? 'neutral'}>
                    {cheque.is_open ? formatDayDistance(cheque.days_to_due) : cheque.due_state_display}
                  </Badge>
                </span>
              }
            />
            <InfoTile label="طرف حساب" value={cheque.party_detail?.name ?? '—'} />
            <InfoTile label="تاریخ صدور" value={<span className="num">{cheque.issue_date_jalali}</span>} />
            <InfoTile
              label="تاریخ تسویه"
              value={<span className="num">{cheque.settled_date_jalali ?? '—'}</span>}
            />
            <InfoTile label="شعبه" value={cheque.branch || '—'} />
            <InfoTile
              label="شماره حساب"
              value={<span className="num">{cheque.account_number || '—'}</span>}
            />
            <InfoTile label="شناسه صیادی" value={<span className="num">{cheque.sayad_id || '—'}</span>} />
            <InfoTile label="صاحب چک" value={cheque.holder_name || '—'} />
            <InfoTile label="فاکتور مرتبط" value={cheque.order_number || '—'} />
            <InfoTile label="ثبت‌کننده" value={cheque.created_by_name || '—'} />
          </div>

          {cheque.description && (
            <p className="rounded-xl bg-ink-50 px-4 py-3 text-xs leading-6 text-ink-600 dark:bg-ink-900 dark:text-ink-300">
              {cheque.description}
            </p>
          )}

          {mode === 'status' && (
            <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
              <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">
                تغییر وضعیت چک
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectInput
                  label="وضعیت جدید"
                  value={status}
                  onChange={setStatus}
                  options={cheque.allowed_transitions.map((choice) => ({
                    value: choice.value,
                    label: choice.label,
                  }))}
                  placeholder="انتخاب وضعیت…"
                />
                <DatePicker
                  label="تاریخ رویداد"
                  value={eventDate}
                  onChange={setEventDate}
                  clearable={false}
                />
              </div>
              <TextArea label="یادداشت" value={note} onChange={setNote} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={saving}>
                  انصراف
                </Button>
                <Button size="sm" onClick={submitStatus} loading={saving} disabled={!status}>
                  اعمال وضعیت
                </Button>
              </div>
            </div>
          )}

          {mode === 'extend' && (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                تمدید سرسید چک
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <DatePicker
                  label="سرسید جدید"
                  value={newDueDate}
                  onChange={setNewDueDate}
                  clearable={false}
                />
              </div>
              <TextArea label="یادداشت" value={note} onChange={setNote} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={saving}>
                  انصراف
                </Button>
                <Button size="sm" onClick={submitExtend} loading={saving}>
                  ثبت تمدید
                </Button>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
              <History size={15} />
              تاریخچه وضعیت
            </p>
            {(cheque.status_history ?? []).length === 0 ? (
              <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-xs text-ink-400 dark:bg-ink-900">
                تغییری ثبت نشده است.
              </p>
            ) : (
              <ol className="space-y-2">
                {(cheque.status_history ?? []).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 px-3.5 py-2.5 text-xs dark:border-ink-800"
                  >
                    <span className="num text-ink-400">{item.changed_at_date_jalali}</span>
                    {item.from_status && (
                      <>
                        <Badge tone={CHEQUE_STATUS_TONES[item.from_status] ?? 'neutral'}>
                          {item.from_status_display}
                        </Badge>
                        <span className="text-ink-400">←</span>
                      </>
                    )}
                    <Badge tone={CHEQUE_STATUS_TONES[item.to_status] ?? 'neutral'}>
                      {item.to_status_display}
                    </Badge>
                    {item.note && <span className="text-ink-500">{item.note}</span>}
                    {item.changed_by_name && (
                      <span className="mr-auto text-ink-400">{item.changed_by_name}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 px-3.5 py-2.5 dark:border-ink-800">
      <p className="text-[11px] text-ink-400">{label}</p>
      <div className="mt-1 text-sm text-ink-800 dark:text-ink-100">{value}</div>
    </div>
  )
}
