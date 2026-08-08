import { catalogApi, partiesApi } from '@/services/endpoints'
import { formatQuantity } from '@/utils/format'
import type { OrderType } from '@/types'
import type { AsyncOption } from './AsyncSelect'

/** جست‌وجوی طرف‌حساب‌های فعال (نوع «هردو» هم شامل می‌شود) */
export const searchParties = async (term: string): Promise<AsyncOption[]> => {
  const response = await partiesApi.list({ search: term, page_size: 20, is_active: true })
  return response.results.map((party) => ({
    value: party.id,
    label: party.name,
    description: `${party.code} · ${party.party_type_display}${
      party.mobile ? ` · ${party.mobile}` : ''
    }`,
  }))
}

/** جست‌وجوی طرف‌حساب متناسب با نوع سفارش: فروش → مشتری، خرید → تأمین‌کننده */
export const searchPartiesForOrder = async (
  term: string,
  orderType: OrderType,
): Promise<AsyncOption[]> => {
  const response = await partiesApi.list({
    search: term,
    page_size: 20,
    is_active: true,
    order_context: orderType,
  })
  return response.results.map((party) => ({
    value: party.id,
    label: party.name,
    description: `${party.code} · ${party.party_type_display}${
      party.mobile ? ` · ${party.mobile}` : ''
    }`,
  }))
}

export const searchProducts = async (term: string): Promise<AsyncOption[]> => {
  const response = await catalogApi.products({ search: term, page_size: 20, is_active: true })
  return response.results.map((product) => ({
    value: product.id,
    label: product.name,
    description: `${product.sku} · موجودی ${formatQuantity(
      product.stock_quantity,
      product.unit_display,
    )}`,
  }))
}
