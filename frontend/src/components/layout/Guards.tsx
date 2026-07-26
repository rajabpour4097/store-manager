import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import type { Capability } from '@/types'

function FullScreenLoader() {
  return (
    <div className="app-shell grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-500">
        <Loader2 size={30} className="animate-spin text-brand-600" />
        <p className="text-sm">در حال بررسی نشست…</p>
      </div>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability
  children: ReactNode
}) {
  const { can, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!can(capability)) {
    return (
      <div className="card flex flex-col items-center gap-3 p-12 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10">
          <ShieldAlert size={26} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">
            دسترسی به این بخش برای شما مجاز نیست
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            در صورت نیاز با مدیر سیستم تماس بگیرید.
          </p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
