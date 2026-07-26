import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { onUnauthorized, tokenStore } from '@/services/api'
import { authApi } from '@/services/endpoints'
import type { Capability, User } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  isManager: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  can: (capability: Capability) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!tokenStore.access) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const profile = await authApi.me()
      setUser(profile)
    } catch {
      tokenStore.clear()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null)
      }),
    [],
  )

  const login = useCallback(async (username: string, password: string) => {
    const response = await authApi.login(username, password)
    tokenStore.set(response.access, response.refresh)
    setUser(response.user)
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const can = useCallback(
    (capability: Capability) => Boolean(user?.capabilities?.[capability]),
    [user],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isManager: user?.role === 'manager',
      login,
      logout,
      refreshUser,
      can,
    }),
    [user, loading, login, logout, refreshUser, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth باید داخل AuthProvider استفاده شود.')
  return context
}
