/** لایه‌ی ارتباط با API جنگو. */

const ACCESS_KEY = 'sm_access_token'
const REFRESH_KEY = 'sm_refresh_token'

function resolveBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (typeof window === 'undefined') return 'http://127.0.0.1:8002/api'

  const { protocol, hostname, port } = window.location
  // در حالت توسعه، Vite روی ۵۱۷۷ اجرا می‌شود و درخواست /api را پروکسی می‌کند
  if (port === '5177') return '/api'
  if (port === '') return `${protocol}//${hostname}/api`
  return `${protocol}//${hostname}:8002/api`
}

export const API_BASE_URL = resolveBaseUrl()

export const MEDIA_BASE_URL = API_BASE_URL.replace(/\/api$/, '')

export function getFullMediaUrl(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${MEDIA_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export class ApiError extends Error {
  status: number
  data: unknown
  fieldErrors: Record<string, string[]>

  constructor(status: number, data: unknown, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    this.fieldErrors = extractFieldErrors(data)
  }
}

function extractFieldErrors(data: unknown): Record<string, string[]> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === 'detail') continue
    if (Array.isArray(value)) {
      result[key] = value.map((item) => String(item))
    } else if (typeof value === 'string') {
      result[key] = [value]
    }
  }
  return result
}

function humanizeError(status: number, data: unknown): string {
  if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) return data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.detail === 'string') return record.detail
    const firstKey = Object.keys(record)[0]
    if (firstKey) {
      const value = record[firstKey]
      const text = Array.isArray(value) ? String(value[0]) : String(value)
      if (text && text !== 'undefined') {
        return firstKey === 'non_field_errors' ? text : `${text}`
      }
    }
  }
  const messages: Record<number, string> = {
    400: 'اطلاعات ارسال‌شده معتبر نیست.',
    401: 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید.',
    403: 'شما دسترسی لازم برای این عملیات را ندارید.',
    404: 'موردی پیدا نشد.',
    405: 'این عملیات مجاز نیست.',
    500: 'خطای داخلی سرور رخ داد.',
    502: 'ارتباط با سرور برقرار نشد.',
    503: 'سرویس در دسترس نیست.',
  }
  return messages[status] ?? `خطای غیرمنتظره (کد ${status})`
}

type QueryValue = string | number | boolean | null | undefined

export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.append(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokenStore.refresh
  if (!refresh) return false
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/accounts/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      })
      if (!response.ok) return false
      const payload = await response.json()
      tokenStore.set(payload.access, payload.refresh)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

const unauthorizedHandlers = new Set<() => void>()

export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler)
  return () => unauthorizedHandlers.delete(handler)
}

interface RequestOptions {
  method?: string
  body?: unknown
  isForm?: boolean
  skipAuthRetry?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isForm = false, skipAuthRetry = false, signal } = options

  const headers: Record<string, string> = {}
  const access = tokenStore.access
  if (access) headers.Authorization = `Bearer ${access}`
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  })

  if (response.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return request<T>(path, { ...options, skipAuthRetry: true })
    }
    tokenStore.clear()
    unauthorizedHandlers.forEach((handler) => handler())
    throw new ApiError(401, null, 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید.')
  }

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '')

  if (!response.ok) {
    throw new ApiError(response.status, payload, humanizeError(response.status, payload))
  }

  return payload as T
}

export const api = {
  get: <T>(path: string, params?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T>(`${path}${buildQuery(params)}`, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form, isForm: true }),
}

/** دانلود فایل با هدر احراز هویت */
export async function downloadFile(
  path: string,
  params?: Record<string, QueryValue>,
  fileName = 'export.csv',
): Promise<void> {
  const access = tokenStore.access
  const response = await fetch(`${API_BASE_URL}${path}${buildQuery(params)}`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  })
  if (!response.ok) {
    throw new ApiError(response.status, null, humanizeError(response.status, null))
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export interface Paginated<T> {
  count: number
  num_pages: number
  page: number
  page_size: number
  next: string | null
  previous: string | null
  results: T[]
}
