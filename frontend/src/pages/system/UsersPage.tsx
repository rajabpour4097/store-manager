import { useEffect, useState } from 'react'
import { Plus, UserCog } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { SelectInput, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/Misc'
import { useAsync } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { usersApi } from '@/services/endpoints'
import { toPersianDigits } from '@/utils/format'
import type { User } from '@/types'

export function UsersPage() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: roles } = useAsync(() => usersApi.roles(), [])
  const list = usePaginatedList<User>((params) => usersApi.list(params), { pageSize: 15 })

  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    role: 'accountant',
    password: '',
  })

  useEffect(() => {
    list.updateFilters({ search: debouncedSearch || null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  useEffect(() => {
    if (!formOpen) return
    setForm({
      username: editing?.username ?? '',
      first_name: editing?.first_name ?? '',
      last_name: editing?.last_name ?? '',
      phone_number: editing?.phone_number ?? '',
      email: editing?.email ?? '',
      role: editing?.role ?? 'accountant',
      password: '',
    })
  }, [formOpen, editing])

  const saveUser = async () => {
    setBusy(true)
    try {
      if (editing) {
        await usersApi.update(editing.id, {
          first_name: form.first_name,
          last_name: form.last_name,
          phone_number: form.phone_number,
          email: form.email,
          role: form.role,
        })
        toast.success('کاربر به‌روزرسانی شد.')
      } else {
        await usersApi.create({
          username: form.username,
          first_name: form.first_name,
          last_name: form.last_name,
          phone_number: form.phone_number,
          email: form.email,
          role: form.role,
          password: form.password,
        })
        toast.success('کاربر ساخته شد.')
      }
      setFormOpen(false)
      list.reload()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ذخیره کاربر انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  const columns: Array<Column<User>> = [
    {
      key: 'user',
      header: 'کاربر',
      render: (row) => (
        <div>
          <span className="font-medium">{row.display_name || row.username}</span>
          <span className="mt-0.5 block text-xs text-ink-400">{row.username}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'نقش',
      render: (row) => (
        <Badge tone={row.role === 'manager' ? 'brand' : 'purple'}>{row.role_display}</Badge>
      ),
    },
    {
      key: 'contact',
      header: 'تماس',
      render: (row) => (
        <div className="text-xs">
          <span className="num block">{row.phone_number || '—'}</span>
          <span className="block text-ink-400">{row.email || '—'}</span>
        </div>
      ),
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
      key: 'login',
      header: 'آخرین ورود',
      render: (row) => (
        <span className="num text-xs">{row.last_login_jalali || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'عملیات',
      align: 'center',
      render: (row) => (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(row)
              setFormOpen(true)
            }}
          >
            ویرایش
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPasswordUser(row)}>
            رمز
          </Button>
          <Button
            size="sm"
            variant={row.is_active ? 'danger' : 'success'}
            onClick={() =>
              void usersApi
                .toggleActive(row.id)
                .then(() => {
                  toast.success(row.is_active ? 'کاربر غیرفعال شد.' : 'کاربر فعال شد.')
                  list.reload()
                })
                .catch((error) =>
                  toast.error(error instanceof ApiError ? error.message : 'تغییر وضعیت انجام نشد.'),
                )
            }
          >
            {row.is_active ? 'غیرفعال' : 'فعال'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="کاربران"
        description="مدیریت مدیران و حسابداران سامانه"
        icon={<UserCog size={20} />}
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            کاربر جدید
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          label="جست‌وجو"
          value={search}
          onChange={setSearch}
          placeholder="نام کاربری یا نام…"
        />
      </div>

      <DataTable
        columns={columns}
        rows={list.items}
        loading={list.loading}
        rowKey={(r) => r.id}
        footer={
          <Pagination
            page={list.page}
            numPages={list.numPages}
            count={list.count}
            pageSize={list.pageSize}
            onChange={list.setPage}
          />
        }
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'ویرایش کاربر' : 'کاربر جدید'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              انصراف
            </Button>
            <Button loading={busy} onClick={() => void saveUser()}>
              ذخیره
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {!editing && (
            <TextInput
              label="نام کاربری"
              required
              value={form.username}
              onChange={(value) => setForm((c) => ({ ...c, username: value }))}
            />
          )}
          <SelectInput
            label="نقش"
            value={form.role}
            onChange={(value) => setForm((c) => ({ ...c, role: value }))}
            options={roles ?? [
              { value: 'manager', label: 'مدیر' },
              { value: 'accountant', label: 'حسابدار' },
            ]}
          />
          <TextInput
            label="نام"
            value={form.first_name}
            onChange={(value) => setForm((c) => ({ ...c, first_name: value }))}
          />
          <TextInput
            label="نام خانوادگی"
            value={form.last_name}
            onChange={(value) => setForm((c) => ({ ...c, last_name: value }))}
          />
          <TextInput
            label="موبایل"
            value={form.phone_number}
            onChange={(value) => setForm((c) => ({ ...c, phone_number: value }))}
          />
          <TextInput
            label="ایمیل"
            value={form.email}
            onChange={(value) => setForm((c) => ({ ...c, email: value }))}
          />
          {!editing && (
            <TextInput
              label="رمز عبور"
              required
              type="password"
              value={form.password}
              onChange={(value) => setForm((c) => ({ ...c, password: value }))}
            />
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(passwordUser)}
        onClose={() => setPasswordUser(null)}
        title={`بازنشانی رمز · ${passwordUser?.username ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordUser(null)}>
              انصراف
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                if (!passwordUser) return
                setBusy(true)
                void usersApi
                  .resetPassword(passwordUser.id, newPassword)
                  .then(() => {
                    toast.success('رمز عبور تغییر کرد.')
                    setPasswordUser(null)
                    setNewPassword('')
                  })
                  .catch((error) =>
                    toast.error(error instanceof ApiError ? error.message : 'تغییر رمز انجام نشد.'),
                  )
                  .finally(() => setBusy(false))
              }}
            >
              ذخیره رمز
            </Button>
          </>
        }
      >
        <TextInput
          label="رمز جدید"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          hint={`حداقل ۸ کاراکتر · کاربر: ${toPersianDigits(passwordUser?.username ?? '')}`}
        />
      </Modal>
    </>
  )
}
