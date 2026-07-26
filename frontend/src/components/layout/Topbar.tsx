import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Sun,
  UserCircle2,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { chequesApi } from '@/services/endpoints'
import { getFullMediaUrl } from '@/services/api'
import { formatCompactMoney, toPersianDigits } from '@/utils/format'
import { todayJalali } from '@/utils/jalali'
import type { Cheque } from '@/types'

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout, can } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [alerts, setAlerts] = useState<{ overdue: Cheque[]; due_soon: Cheque[] }>({
    overdue: [],
    due_soon: [],
  })
  const menuRef = useRef<HTMLDivElement>(null)
  const alertsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!can('cheques.view')) return
    let active = true
    const load = () => {
      chequesApi
        .alerts()
        .then((data) => {
          if (active) setAlerts({ overdue: data.overdue, due_soon: data.due_soon })
        })
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 180_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [can])

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
      if (!alertsRef.current?.contains(event.target as Node)) setAlertsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const alertCount = alerts.overdue.length + alerts.due_soon.length

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/80 backdrop-blur-xl dark:border-ink-800 dark:bg-ink-950/70">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-xl p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden dark:text-ink-300 dark:hover:bg-ink-800"
            aria-label="منو"
          >
            <Menu size={20} />
          </button>
          <span className="hidden items-center gap-2 rounded-xl bg-ink-50 px-3 py-1.5 text-xs text-ink-500 sm:flex dark:bg-ink-900 dark:text-ink-400">
            <CalendarDays size={14} />
            امروز: <span className="num font-medium">{todayJalali()}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-xl p-2 text-ink-500 transition hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
            aria-label="تغییر پوسته"
            title={theme === 'dark' ? 'حالت روشن' : 'حالت تاریک'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {can('cheques.view') && (
            <div className="relative" ref={alertsRef}>
              <button
                type="button"
                onClick={() => setAlertsOpen((current) => !current)}
                className="relative rounded-xl p-2 text-ink-500 transition hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
                aria-label="هشدارها"
              >
                <Bell size={18} />
                {alertCount > 0 && (
                  <span className="num absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {toPersianDigits(alertCount)}
                  </span>
                )}
              </button>

              {alertsOpen && (
                <div className="absolute left-0 mt-2 w-80 animate-scale-in overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card-lg dark:border-ink-700 dark:bg-ink-900">
                  <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800">
                    <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                      هشدارهای چک
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {alertCount === 0 && (
                      <p className="px-4 py-8 text-center text-xs text-ink-400">
                        هشدار فعالی وجود ندارد.
                      </p>
                    )}
                    {[
                      ...alerts.overdue.map((item) => ({ item, kind: 'overdue' as const })),
                      ...alerts.due_soon.map((item) => ({ item, kind: 'soon' as const })),
                    ].map(({ item, kind }) => (
                      <button
                        key={`${kind}-${item.id}`}
                        type="button"
                        onClick={() => {
                          setAlertsOpen(false)
                          navigate(
                            item.direction === 'payable'
                              ? '/cheques/payable'
                              : '/cheques/receivable',
                          )
                        }}
                        className="flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-right transition last:border-0 hover:bg-ink-50 dark:border-ink-800/60 dark:hover:bg-ink-800/50"
                      >
                        <span
                          className={clsx(
                            'mt-1 size-2 shrink-0 rounded-full',
                            kind === 'overdue' ? 'bg-rose-500' : 'bg-amber-500',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink-800 dark:text-ink-100">
                            {item.direction_display} · {item.party_detail?.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-ink-500 dark:text-ink-400">
                            {formatCompactMoney(item.amount)} · سرسید {item.due_date_jalali}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="flex items-center gap-2 rounded-xl p-1.5 pl-2.5 transition hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              {user?.avatar ? (
                <img
                  src={getFullMediaUrl(user.avatar)}
                  alt={user.display_name}
                  className="size-8 rounded-xl object-cover"
                />
              ) : (
                <span className="grid size-8 place-items-center rounded-xl bg-brand-gradient text-xs font-bold text-white">
                  {(user?.display_name ?? '؟').slice(0, 1)}
                </span>
              )}
              <span className="hidden text-right sm:block">
                <span className="block text-xs font-semibold text-ink-800 dark:text-ink-100">
                  {user?.display_name}
                </span>
                <span className="block text-[11px] text-ink-500 dark:text-ink-400">
                  {user?.role_display}
                </span>
              </span>
              <ChevronDown size={15} className="text-ink-400" />
            </button>

            {menuOpen && (
              <div className="absolute left-0 mt-2 w-52 animate-scale-in overflow-hidden rounded-2xl border border-ink-200 bg-white py-1 shadow-card-lg dark:border-ink-700 dark:bg-ink-900">
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 transition hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <UserCircle2 size={16} />
                  پروفایل و رمز عبور
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-500/10"
                >
                  <LogOut size={16} />
                  خروج از حساب
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
