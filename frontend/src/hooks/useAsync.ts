import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '@/services/api'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/** واکشی داده با مدیریت وضعیت بارگذاری و خطا */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { skip?: boolean } = {},
) {
  const { skip = false } = options
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: !skip,
    error: null,
  })
  const mounted = useRef(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    if (skip) {
      setState({ data: null, loading: false, error: null })
      return
    }
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const result = await loaderRef.current()
      if (mounted.current) setState({ data: result, loading: false, error: null })
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'در دریافت اطلاعات مشکلی پیش آمد.'
      if (mounted.current) setState({ data: null, loading: false, error: message })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, ...deps])

  useEffect(() => {
    void run()
  }, [run])

  return { ...state, reload: run, setData: (data: T | null) => setState((s) => ({ ...s, data })) }
}
