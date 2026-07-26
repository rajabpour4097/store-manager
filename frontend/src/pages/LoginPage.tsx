import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Eye,
  EyeOff,
  Lightbulb,
  Lock,
  ReceiptText,
  Store,
  User as UserIcon,
  Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { todayJalali } from '@/utils/jalali'

const DEMO_ACCOUNTS = [
  { username: 'manager1', password: 'Manager@1234', role: 'مدیر ارشد' },
  { username: 'manager2', password: 'Manager@2345', role: 'مدیر' },
  { username: 'accountant', password: 'Hesab@1234', role: 'حسابدار' },
]

const FEATURES = [
  { icon: ReceiptText, title: 'چک‌های دریافتی و پرداختی', text: 'رهگیری کامل چرخه‌ی چک تا تسویه' },
  { icon: Wallet, title: 'بدهکار و بستانکار', text: 'صورتحساب و مانده‌ی لحظه‌ای طرف‌حساب‌ها' },
  { icon: Lightbulb, title: 'پیشنهاد هوشمند خرید', text: 'بر پایه‌ی تحلیل فروش‌های گذشته' },
  { icon: BarChart3, title: 'گزارش سود و زیان', text: 'با بازه‌ی تاریخ شمسی دلخواه' },
]

export function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ورود ناموفق بود؛ دوباره تلاش کنید.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell grid min-h-screen lg:grid-cols-[1.1fr_1fr]" dir="rtl">
      {/* معرفی سامانه */}
      <section className="relative hidden overflow-hidden bg-brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-grid-light opacity-20 [background-size:32px_32px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-80 animate-float rounded-full bg-white/10 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <Store size={24} />
            </span>
            <div>
              <p className="text-lg font-bold">سامانه مدیریت فروشگاه</p>
              <p className="text-xs text-white/70">
                امروز <span className="num">{todayJalali()}</span>
              </p>
            </div>
          </div>

          <h2 className="mt-14 max-w-md text-3xl font-bold leading-relaxed">
            همه‌ی حساب‌ها، چک‌ها و سفارش‌های فروشگاه در یک داشبورد
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-white/80">
            از ثبت چک و مدیریت بدهکار و بستانکار تا پیشنهاد هوشمند خرید و گزارش سود و زیان؛
            کاملاً فارسی و بر پایه‌ی تاریخ شمسی.
          </p>
        </div>

        <ul className="relative mt-12 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"
            >
              <feature.icon size={20} className="mb-2 text-white/90" />
              <p className="text-sm font-semibold">{feature.title}</p>
              <p className="mt-1 text-xs leading-6 text-white/70">{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* فرم ورود */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-right">
            <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-card lg:hidden">
              <Store size={22} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-ink-900 dark:text-ink-50">
              ورود به حساب کاربری
            </h1>
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
              برای ادامه، نام کاربری و رمز عبور خود را وارد کنید.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4 p-6">
            <div>
              <label className="label" htmlFor="username">
                نام کاربری
              </label>
              <div className="relative">
                <UserIcon
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
                />
                <input
                  id="username"
                  className="input pr-10"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="manager1"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">
                رمز عبور
              </label>
              <div className="relative">
                <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input px-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 transition hover:text-brand-600"
                  aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs leading-6 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" block loading={submitting} className="mt-2">
              ورود به سامانه
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
            <p className="mb-2.5 text-xs font-semibold text-ink-600 dark:text-ink-300">
              حساب‌های آماده برای ورود سریع
            </p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => {
                    setUsername(account.username)
                    setPassword(account.password)
                    setError(null)
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-ink-50 px-3 py-2 text-right text-xs transition hover:bg-brand-50 dark:bg-ink-900 dark:hover:bg-brand-500/10"
                >
                  <span className="font-medium text-ink-700 dark:text-ink-200">{account.role}</span>
                  <span className="num text-ink-500 dark:text-ink-400" dir="ltr">
                    {account.username} / {account.password}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
