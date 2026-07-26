import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Store, X } from 'lucide-react'

import { NAV_GROUPS } from './navigation'
import { useAuth } from '@/contexts/AuthContext'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { can, user } = useAuth()

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.capability || can(item.capability)),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-ink-950/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-ink-200/70 bg-ink-100/60 backdrop-blur-xl transition-transform duration-300 dark:border-ink-800 dark:bg-ink-950/80 lg:static lg:z-0 lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-brand-gradient text-white shadow-card">
              <Store size={20} />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-900 dark:text-ink-50">مدیریت فروشگاه</p>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                {user?.role_display ?? 'سامانه جامع'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-white lg:hidden dark:hover:bg-ink-800"
            aria-label="بستن منو"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        clsx('sidebar-link', isActive && 'sidebar-link-active')
                      }
                    >
                      <item.icon size={17} strokeWidth={1.9} />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-200/70 px-5 py-4 text-[11px] leading-5 text-ink-400 dark:border-ink-800">
          نسخه ۱٫۰ · تمام تاریخ‌ها شمسی
        </div>
      </aside>
    </>
  )
}
