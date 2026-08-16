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

export const searchProducts = async (
  term: string,
  options?: { excludeDefective?: boolean },
): Promise<AsyncOption[]> => {
  const response = await catalogApi.products({
    search: term,
    page_size: 20,
    is_active: true,
    exclude_defective: options?.excludeDefective ? true : undefined,
  })
  return response.results.map((product) => ({
    value: product.id,
    label: product.name,
    description: `${product.sku} · موجودی ${formatQuantity(
      product.stock_quantity,
      product.unit_display,
    )}`,
  }))
}

/** کالاهای فعال بدون خرابی باز — برای ثبت خرابی جدید */
export const searchAvailableProducts = (term: string) =>
  searchProducts(term, { excludeDefective: true })

/** جست‌وجوی سریال دستگاه‌های موجود در انبار؛ انتخاب سریال کالا را هم مشخص می‌کند */
export const searchSerials = async (
  term: string,
  options?: { productId?: number | null },
): Promise<AsyncOption[]> => {
  const response = await catalogApi.serials({
    search: term,
    page_size: 20,
    status: 'in_stock',
    product: options?.productId ?? undefined,
  })
  return response.results.map((serial) => ({
    value: serial.id,
    label: serial.serial_number,
    description: `${serial.product_name}${
      serial.product_detail?.sku ? ` · ${serial.product_detail.sku}` : ''
    }`,
    meta: {
      serialNumber: serial.serial_number,
      productId: serial.product,
      productName: serial.product_name,
      salePrice: serial.product_detail?.sale_price,
      purchasePrice: serial.product_detail?.purchase_price,
    },
  }))
}
