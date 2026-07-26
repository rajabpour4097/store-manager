import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TextInput } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/Misc'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { authApi } from '@/services/endpoints'

export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const [profile, setProfile] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
  })
  const [passwords, setPasswords] = useState({
    current_password: '',
    new_password: '',
    confirm: '',
  })
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (!user) return
    setProfile({
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      phone_number: user.phone_number ?? '',
      email: user.email ?? '',
    })
  }, [user])

  const saveProfile = async () => {
    setSaving(true)
    try {
      await authApi.updateProfile(profile)
      await refreshUser()
      toast.success('پروفایل ذخیره شد.')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ذخیره پروفایل انجام نشد.')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    if (passwords.new_password !== passwords.confirm) {
      toast.error('تکرار رمز عبور یکسان نیست.')
      return
    }
    setChangingPassword(true)
    try {
      await authApi.changePassword(passwords.current_password, passwords.new_password)
      toast.success('رمز عبور تغییر کرد.')
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'تغییر رمز انجام نشد.')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <>
      <PageHeader
        title="پروفایل من"
        description={`${user?.display_name ?? ''} · ${user?.role_display ?? ''}`}
        icon={<Settings size={20} />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="اطلاعات شخصی">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="نام"
              value={profile.first_name}
              onChange={(value) => setProfile((c) => ({ ...c, first_name: value }))}
            />
            <TextInput
              label="نام خانوادگی"
              value={profile.last_name}
              onChange={(value) => setProfile((c) => ({ ...c, last_name: value }))}
            />
            <TextInput
              label="موبایل"
              value={profile.phone_number}
              onChange={(value) => setProfile((c) => ({ ...c, phone_number: value }))}
            />
            <TextInput
              label="ایمیل"
              value={profile.email}
              onChange={(value) => setProfile((c) => ({ ...c, email: value }))}
            />
          </div>
          <div className="mt-4">
            <Button loading={saving} onClick={() => void saveProfile()}>
              ذخیره تغییرات
            </Button>
          </div>
        </Card>

        <Card title="تغییر رمز عبور">
          <div className="space-y-3">
            <TextInput
              label="رمز فعلی"
              type="password"
              value={passwords.current_password}
              onChange={(value) => setPasswords((c) => ({ ...c, current_password: value }))}
            />
            <TextInput
              label="رمز جدید"
              type="password"
              value={passwords.new_password}
              onChange={(value) => setPasswords((c) => ({ ...c, new_password: value }))}
            />
            <TextInput
              label="تکرار رمز جدید"
              type="password"
              value={passwords.confirm}
              onChange={(value) => setPasswords((c) => ({ ...c, confirm: value }))}
            />
          </div>
          <div className="mt-4">
            <Button
              variant="secondary"
              loading={changingPassword}
              onClick={() => void changePassword()}
            >
              تغییر رمز
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}
