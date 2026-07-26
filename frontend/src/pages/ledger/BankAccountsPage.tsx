import { useEffect, useState } from 'react'
import { Banknote, Pencil, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { NumberInput, Switch, TextInput } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Money, PageHeader } from '@/components/ui/Misc'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ledgerApi } from '@/services/endpoints'
import { toNumber, toPersianDigits } from '@/utils/format'
import type { BankAccount } from '@/types'

export function BankAccountsPage() {
  const { isManager } = useAuth()
  const toast = useToast()
  const [modal, setModal] = useState<{ open: boolean; account: BankAccount | null }>({
    open: false,
    account: null,
  })
  const [deleting, setDeleting] = useState<BankAccount | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const { data, loading, error, reload } = useAsync(() => ledgerApi.banks({ page_size: 100 }), [])

  const confirmDelete = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await ledgerApi.removeBank(deleting.id)
      toast.success('حساب بانکی حذف شد.')
      setDeleting(null)
      reload()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'حذف انجام نشد.')
    } finally {
      setDeletingBusy(false)
    }
  }

  const columns: Array<Column<BankAccount>> = [
    {
      key: 'title',
      header: 'عنوان حساب',
      render: (row) => (
        <div>
          <span className="block font-medium">{row.title}</span>
          <span className="block text-xs text-ink-400">{row.bank_name}</span>
        </div>
      ),
    },
    {
      key: 'account',
      header: 'شماره حساب',
      render: (row) => <span className="num">{toPersianDigits(row.account_number) || '—'}</span>,
    },
    {
      key: 'iban',
      header: 'شبا',
      render: (row) => (
        <span className="num text-xs" dir="ltr">
          {row.iban || '—'}
        </span>
      ),
    },
    {
      key: 'card',
      header: 'شماره کارت',
      render: (row) => <span className="num text-xs">{toPersianDigits(row.card_number) || '—'}</span>,
    },
    {
      key: 'balance',
      header: 'مانده اولیه (ریال)',
      render: (row) => <Money value={row.initial_balance} />,
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <Badge tone={row.is_active ? 'success' : 'neutral'}>
          {row.is_active ? 'فعال' : 'غیرفعال'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'center',
      render: (row) =>
        isManager ? (
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => setModal({ open: true, account: row })}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              title="ویرایش"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => setDeleting(row)}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              title="حذف"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="حساب‌های بانکی"
        description="حساب‌هایی که در ثبت چک، هزینه و درآمد به آن‌ها ارجاع می‌دهید"
        icon={<Banknote size={20} />}
        actions={
          isManager && (
            <Button icon={<Plus size={16} />} onClick={() => setModal({ open: true, account: null })}>
              حساب جدید
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={data?.results ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="حساب بانکی ثبت نشده است."
      />

      <BankAccountModal
        open={modal.open}
        account={modal.account}
        onClose={() => setModal({ open: false, account: null })}
        onSaved={reload}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="حذف حساب بانکی"
        message={deleting ? `حساب «${deleting.title}» حذف شود؟` : ''}
        confirmLabel="حذف کن"
        loading={deletingBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

function BankAccountModal({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean
  account: BankAccount | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: '',
    bank_name: '',
    account_number: '',
    iban: '',
    card_number: '',
    branch: '',
    initial_balance: '0',
    is_active: true,
  })
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      title: account?.title ?? '',
      bank_name: account?.bank_name ?? '',
      account_number: account?.account_number ?? '',
      iban: account?.iban ?? '',
      card_number: account?.card_number ?? '',
      branch: account?.branch ?? '',
      initial_balance: account ? String(toNumber(account.initial_balance)) : '0',
      is_active: account?.is_active ?? true,
    })
    setErrors({})
  }, [open, account])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim() || !form.bank_name.trim()) {
      setErrors({
        title: form.title.trim() ? [] : ['عنوان الزامی است.'],
        bank_name: form.bank_name.trim() ? [] : ['نام بانک الزامی است.'],
      })
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, initial_balance: form.initial_balance || '0' }
      if (account) {
        await ledgerApi.updateBank(account.id, payload)
        toast.success('حساب ویرایش شد.')
      } else {
        await ledgerApi.createBank(payload)
        toast.success('حساب ثبت شد.')
      }
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? 'ویرایش حساب بانکی' : 'حساب بانکی جدید'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            ذخیره
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="عنوان حساب"
          required
          value={form.title}
          onChange={(value) => set('title', value)}
          error={errors.title}
          placeholder="مثال: حساب جاری فروشگاه"
        />
        <TextInput
          label="نام بانک"
          required
          value={form.bank_name}
          onChange={(value) => set('bank_name', value)}
          error={errors.bank_name}
        />
        <TextInput
          label="شماره حساب"
          value={form.account_number}
          onChange={(value) => set('account_number', value)}
          error={errors.account_number}
          className="num text-right"
        />
        <TextInput
          label="شماره شبا"
          value={form.iban}
          onChange={(value) => set('iban', value)}
          error={errors.iban}
          dir="ltr"
          placeholder="IR..."
        />
        <TextInput
          label="شماره کارت"
          value={form.card_number}
          onChange={(value) => set('card_number', value)}
          error={errors.card_number}
          className="num text-right"
        />
        <TextInput
          label="شعبه"
          value={form.branch}
          onChange={(value) => set('branch', value)}
          error={errors.branch}
        />
        <NumberInput
          label="مانده اولیه (ریال)"
          value={form.initial_balance}
          onChange={(value) => set('initial_balance', value)}
          error={errors.initial_balance}
        />
        <Switch
          label="فعال"
          checked={form.is_active}
          onChange={(checked) => set('is_active', checked)}
        />
      </form>
    </Modal>
  )
}
