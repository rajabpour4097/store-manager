import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, type Paginated } from '@/services/api'

export type QueryValue = string | number | boolean | null | undefined
export type Filters = Record<string, QueryValue>

interface Options {
  pageSize?: number
  initialFilters?: Filters
  skip?: boolean
}

/** مدیریت لیست صفحه‌بندی‌شده همراه با فیلترها */
export function usePaginatedList<T>(
  fetcher: (params: Filters) => Promise<Paginated<T>>,
  options: Options = {},
) {
  const { pageSize = 20, initialFilters = {}, skip = false } = options

  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [items, setItems] = useState<T[]>([])
  const [count, setCount] = useState(0)
  const [numPages, setNumPages] = useState(1)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState<string | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const filterKey = useMemo(() => JSON.stringify(filters), [filters])

  const load = useCallback(async () => {
    if (skip) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetcherRef.current({
        ...(JSON.parse(filterKey) as Filters),
        page,
        page_size: pageSize,
      })
      if (!mounted.current) return
      setItems(response.results ?? [])
      setCount(response.count ?? 0)
      setNumPages(response.num_pages ?? 1)
    } catch (err) {
      if (!mounted.current) return
      setError(err instanceof ApiError ? err.message : 'در دریافت لیست مشکلی پیش آمد.')
      setItems([])
      setCount(0)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [filterKey, page, pageSize, skip])

  useEffect(() => {
    void load()
  }, [load])

  const updateFilters = useCallback((next: Filters) => {
    setFilters((current) => ({ ...current, ...next }))
    setPage(1)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(initialFilters)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialFilters)])

  return {
    items,
    count,
    numPages,
    page,
    setPage,
    pageSize,
    filters,
    updateFilters,
    resetFilters,
    loading,
    error,
    reload: load,
  }
}
