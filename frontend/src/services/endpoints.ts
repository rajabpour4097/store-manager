import { api, downloadFile, type Paginated } from './api'
import type {
  ActivityLog,
  AgingBucket,
  BankAccount,
  CatalogSummary,
  Cheque,
  ChequeCalendarMonth,
  ChequeOptions,
  ChequeSummary,
  Choice,
  DashboardData,
  FinanceCategory,
  FinanceRecord,
  FinanceSummary,
  GenerateResult,
  InventoryReport,
  InvoiceUploadPreview,
  LedgerEntry,
  LedgerSummary,
  Order,
  OrderListItem,
  OrderOptions,
  OrderSummary,
  Party,
  PartyStatement,
  PartySummary,
  Product,
  ProductAnalysis,
  ProductCategory,
  ProfitLossReport,
  PurchaseReport,
  PurchaseSuggestion,
  ReceivablesReport,
  ReportCatalogItem,
  SalesHistoryItem,
  SalesHistorySummary,
  SalesImportBatch,
  SalesReport,
  StockMovement,
  SuggestionSummary,
  User,
  WarehouseStatsReport,
} from '@/types'

type Params = Record<string, string | number | boolean | null | undefined>

// ------------------------------------------------------------------ حساب‌ها
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ access: string; refresh: string; user: User }>('/accounts/login/', {
      username,
      password,
    }),
  me: () => api.get<User>('/accounts/me/'),
  updateProfile: (payload: Partial<User>) => api.patch<User>('/accounts/me/', payload),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ detail: string }>('/accounts/me/change-password/', {
      current_password,
      new_password,
    }),
}

export const usersApi = {
  list: (params?: Params) => api.get<Paginated<User>>('/accounts/users/', params),
  create: (payload: Record<string, unknown>) => api.post<User>('/accounts/users/', payload),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<User>(`/accounts/users/${id}/`, payload),
  remove: (id: number) => api.delete<void>(`/accounts/users/${id}/`),
  toggleActive: (id: number) => api.post<User>(`/accounts/users/${id}/toggle-active/`),
  resetPassword: (id: number, new_password: string) =>
    api.post<{ detail: string }>(`/accounts/users/${id}/reset-password/`, { new_password }),
  roles: () => api.get<Choice[]>('/accounts/users/roles/'),
  activityLogs: (params?: Params) =>
    api.get<Paginated<ActivityLog>>('/accounts/activity-logs/', params),
}

// ------------------------------------------------------------------ طرف حساب
export const partiesApi = {
  list: (params?: Params) => api.get<Paginated<Party>>('/parties/', params),
  get: (id: number) => api.get<Party>(`/parties/${id}/`),
  create: (payload: Record<string, unknown>) => api.post<Party>('/parties/', payload),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<Party>(`/parties/${id}/`, payload),
  remove: (id: number) => api.delete<void>(`/parties/${id}/`),
  types: () => api.get<Choice[]>('/parties/types/'),
  summary: () => api.get<PartySummary>('/parties/summary/'),
  statement: (id: number, params?: Params) =>
    api.get<PartyStatement>(`/parties/${id}/statement/`, params),
  aging: () => api.get<{ buckets: AgingBucket[] }>('/parties/aging/'),
}

// ------------------------------------------------------------------ دفتر معین
export const ledgerApi = {
  list: (params?: Params) => api.get<Paginated<LedgerEntry>>('/ledger/entries/', params),
  create: (payload: Record<string, unknown>) =>
    api.post<LedgerEntry>('/ledger/entries/', payload),
  quickEntry: (payload: Record<string, unknown>) =>
    api.post<LedgerEntry>('/ledger/entries/quick-entry/', payload),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<LedgerEntry>(`/ledger/entries/${id}/`, payload),
  remove: (id: number) => api.delete<void>(`/ledger/entries/${id}/`),
  categories: () => api.get<Choice[]>('/ledger/entries/categories/'),
  summary: (params?: Params) => api.get<LedgerSummary>('/ledger/entries/summary/', params),

  banks: (params?: Params) => api.get<Paginated<BankAccount>>('/ledger/bank-accounts/', params),
  createBank: (payload: Record<string, unknown>) =>
    api.post<BankAccount>('/ledger/bank-accounts/', payload),
  updateBank: (id: number, payload: Record<string, unknown>) =>
    api.patch<BankAccount>(`/ledger/bank-accounts/${id}/`, payload),
  removeBank: (id: number) => api.delete<void>(`/ledger/bank-accounts/${id}/`),

  financeCategories: (params?: Params) =>
    api.get<Paginated<FinanceCategory>>('/ledger/finance-categories/', params),
  createFinanceCategory: (payload: Record<string, unknown>) =>
    api.post<FinanceCategory>('/ledger/finance-categories/', payload),
  updateFinanceCategory: (id: number, payload: Record<string, unknown>) =>
    api.patch<FinanceCategory>(`/ledger/finance-categories/${id}/`, payload),
  removeFinanceCategory: (id: number) => api.delete<void>(`/ledger/finance-categories/${id}/`),

  financeRecords: (params?: Params) =>
    api.get<Paginated<FinanceRecord>>('/ledger/finance-records/', params),
  createFinanceRecord: (payload: Record<string, unknown>) =>
    api.post<FinanceRecord>('/ledger/finance-records/', payload),
  updateFinanceRecord: (id: number, payload: Record<string, unknown>) =>
    api.patch<FinanceRecord>(`/ledger/finance-records/${id}/`, payload),
  removeFinanceRecord: (id: number) => api.delete<void>(`/ledger/finance-records/${id}/`),
  financeSummary: (params?: Params) =>
    api.get<FinanceSummary>('/ledger/finance-records/summary/', params),
}

// ------------------------------------------------------------------ چک
export const chequesApi = {
  list: (params?: Params) => api.get<Paginated<Cheque>>('/cheques/', params),
  get: (id: number) => api.get<Cheque>(`/cheques/${id}/`),
  create: (payload: Record<string, unknown>) => api.post<Cheque>('/cheques/', payload),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<Cheque>(`/cheques/${id}/`, payload),
  remove: (id: number) => api.delete<void>(`/cheques/${id}/`),
  options: () => api.get<ChequeOptions>('/cheques/options/'),
  summary: (params?: Params) => api.get<ChequeSummary>('/cheques/summary/', params),
  calendar: (months = 6) =>
    api.get<{ months: ChequeCalendarMonth[] }>('/cheques/calendar/', { months }),
  alerts: () =>
    api.get<{
      overdue: Cheque[]
      due_soon: Cheque[]
      overdue_count: number
      due_soon_count: number
    }>('/cheques/alerts/'),
  changeStatus: (id: number, payload: { status: string; event_date?: string; note?: string }) =>
    api.post<Cheque>(`/cheques/${id}/change-status/`, payload),
  extend: (id: number, payload: { due_date: string; note?: string }) =>
    api.post<Cheque>(`/cheques/${id}/extend/`, payload),
}

// ------------------------------------------------------------------ کالا
export const catalogApi = {
  products: (params?: Params) => api.get<Paginated<Product>>('/catalog/products/', params),
  product: (id: number) => api.get<Product>(`/catalog/products/${id}/`),
  createProduct: (payload: Record<string, unknown>) =>
    api.post<Product>('/catalog/products/', payload),
  updateProduct: (id: number, payload: Record<string, unknown>) =>
    api.patch<Product>(`/catalog/products/${id}/`, payload),
  removeProduct: (id: number) => api.delete<void>(`/catalog/products/${id}/`),
  options: () =>
    api.get<{ units: Choice[]; movement_reasons: Choice[] }>('/catalog/products/options/'),
  summary: () => api.get<CatalogSummary>('/catalog/products/summary/'),
  lowStock: () => api.get<Product[]>('/catalog/products/low-stock/'),
  productMovements: (id: number) => api.get<StockMovement[]>(`/catalog/products/${id}/movements/`),

  categories: (params?: Params) =>
    api.get<Paginated<ProductCategory>>('/catalog/categories/', params),
  createCategory: (payload: Record<string, unknown>) =>
    api.post<ProductCategory>('/catalog/categories/', payload),
  updateCategory: (id: number, payload: Record<string, unknown>) =>
    api.patch<ProductCategory>(`/catalog/categories/${id}/`, payload),
  removeCategory: (id: number) => api.delete<void>(`/catalog/categories/${id}/`),

  movements: (params?: Params) =>
    api.get<Paginated<StockMovement>>('/catalog/stock-movements/', params),
  adjustStock: (payload: Record<string, unknown>) =>
    api.post<StockMovement>('/catalog/stock-movements/adjust/', payload),
}

// ------------------------------------------------------------------ سفارش
export const ordersApi = {
  list: (params?: Params) => api.get<Paginated<OrderListItem>>('/orders/', params),
  get: (id: number) => api.get<Order>(`/orders/${id}/`),
  create: (payload: Record<string, unknown>) => api.post<Order>('/orders/', payload),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<Order>(`/orders/${id}/`, payload),
  remove: (id: number) => api.delete<void>(`/orders/${id}/`),
  options: () => api.get<OrderOptions>('/orders/options/'),
  summary: (params?: Params) => api.get<OrderSummary>('/orders/summary/', params),
  confirm: (id: number) => api.post<Order>(`/orders/${id}/confirm/`),
  complete: (id: number) => api.post<Order>(`/orders/${id}/complete/`),
  cancel: (id: number, reason?: string) => api.post<Order>(`/orders/${id}/cancel/`, { reason }),
  registerPayment: (id: number, amount: number | string) =>
    api.post<Order>(`/orders/${id}/register-payment/`, { amount }),
  uploadInvoice: (form: FormData) =>
    api.upload<InvoiceUploadPreview | Order>('/orders/upload-invoice/', form),
}

export const suggestionsApi = {
  list: (params?: Params) => api.get<Paginated<PurchaseSuggestion>>('/suggestions/', params),
  get: (id: number) => api.get<PurchaseSuggestion>(`/suggestions/${id}/`),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<PurchaseSuggestion>(`/suggestions/${id}/`, payload),
  remove: (id: number) => api.delete<void>(`/suggestions/${id}/`),
  summary: () => api.get<SuggestionSummary>('/suggestions/summary/'),
  generate: (payload: Record<string, unknown>) =>
    api.post<GenerateResult>('/suggestions/generate/', payload),
  accept: (id: number, note?: string) =>
    api.post<PurchaseSuggestion>(`/suggestions/${id}/accept/`, { note }),
  reject: (id: number, note?: string) =>
    api.post<PurchaseSuggestion>(`/suggestions/${id}/reject/`, { note }),
  createOrder: (id: number, payload: { party?: number | null; order_date?: string | null }) =>
    api.post<Order>(`/suggestions/${id}/create-order/`, payload),
  analyze: (productId: number, lookbackDays = 180) =>
    api.get<ProductAnalysis>(`/suggestions/analyze/${productId}/`, {
      lookback_days: lookbackDays,
    }),
}

export const salesHistoryApi = {
  list: (params?: Params) => api.get<Paginated<SalesHistoryItem>>('/sales-history/', params),
  summary: (params?: Params) => api.get<SalesHistorySummary>('/sales-history/summary/', params),
  batches: (params?: Params) => api.get<Paginated<SalesImportBatch>>('/sales-imports/', params),
  upload: (form: FormData) => api.upload<SalesImportBatch>('/sales-imports/upload/', form),
  deleteBatchRecords: (id: number) =>
    api.delete<{ deleted: number }>(`/sales-imports/${id}/records/`),
  downloadSample: () => downloadFile('/sales-imports/sample/', undefined, 'نمونه-فروش.csv'),
}

// ------------------------------------------------------------------ گزارش
export const reportsApi = {
  dashboard: (params?: Params) => api.get<DashboardData>('/reports/dashboard/', params),
  catalog: () => api.get<ReportCatalogItem[]>('/reports/catalog/'),
  profitLoss: (params?: Params) => api.get<ProfitLossReport>('/reports/profit-loss/', params),
  sales: (params?: Params) => api.get<SalesReport>('/reports/sales/', params),
  purchases: (params?: Params) => api.get<PurchaseReport>('/reports/purchases/', params),
  receivables: () => api.get<ReceivablesReport>('/reports/receivables/'),
  cheques: (params?: Params) => api.get<import('@/types').ChequeReport>('/reports/cheques/', params),
  inventory: () => api.get<InventoryReport>('/reports/inventory/'),
  warehouseStats: (params?: Params) => api.get<WarehouseStatsReport>('/reports/warehouse-stats/', params),
  export: (key: string, params?: Params, fileName?: string) =>
    downloadFile(`/reports/export/${key}/`, params, fileName ?? `${key}.csv`),
}
