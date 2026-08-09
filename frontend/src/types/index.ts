export type Role = 'manager' | 'accountant'

export type Capability =
  | 'cheques.view' | 'cheques.add' | 'cheques.change' | 'cheques.delete'
  | 'parties.view' | 'parties.add' | 'parties.change' | 'parties.delete'
  | 'ledger.view' | 'ledger.add' | 'ledger.change' | 'ledger.delete'
  | 'catalog.view' | 'catalog.add' | 'catalog.change' | 'catalog.delete'
  | 'orders.view' | 'orders.add' | 'orders.change' | 'orders.delete'
  | 'orders.confirm' | 'orders.import_sales' | 'orders.upload_invoice'
  | 'reports.view' | 'reports.profit_loss'
  | 'users.manage' | 'settings.manage' | 'activity.view'

export type Capabilities = Record<Capability, boolean>

export interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  phone_number: string
  national_id: string
  role: Role
  role_display: string
  display_name: string
  is_active: boolean
  avatar?: string | null
  date_joined: string
  date_joined_jalali: string
  last_login: string | null
  last_login_jalali: string | null
  capabilities: Capabilities
}

export interface Choice {
  value: string
  label: string
}

export interface NumericChoice {
  value: number
  label: string
}

export interface ActivityLog {
  id: number
  user: number | null
  user_name: string
  action: string
  action_display: string
  entity: string
  entity_id: string
  description: string
  ip_address: string | null
  created_at: string
  created_at_jalali: string
}

// ---------------------------------------------------------------- طرف حساب
export type PartyType = 'customer' | 'supplier' | 'both' | 'other'

export interface Party {
  id: number
  code: string
  name: string
  party_type: PartyType
  party_type_display: string
  is_legal_entity: boolean
  national_id: string
  economic_code: string
  mobile: string
  phone: string
  email: string
  city: string
  address: string
  postal_code: string
  opening_balance: string
  credit_limit: string
  is_active: boolean
  notes: string
  balance: string
  balance_state: 'debtor' | 'creditor' | 'settled'
  balance_state_display: string
  created_at: string
  created_at_jalali: string
}

export interface PartyMini {
  id: number
  code: string
  name: string
  party_type: PartyType
  party_type_display: string
  mobile: string
}

export interface PartySummary {
  total_parties: number
  active_parties: number
  customers: number
  suppliers: number
  debtor_count: number
  creditor_count: number
  total_debtor_amount: string
  total_creditor_amount: string
  net_balance: string
  top_debtors: Party[]
  top_creditors: Party[]
}

export interface StatementRow {
  id: number
  date: string
  date_jalali: string
  category: string
  category_display: string
  document_number: string
  description: string
  debit: string
  credit: string
  running_balance: string
  source_type: string
  source_id: number | null
}

export interface PartyStatement {
  party: Party
  date_from: string | null
  date_to: string | null
  date_from_jalali: string | null
  date_to_jalali: string | null
  totals: {
    opening_balance: string
    total_debit: string
    total_credit: string
    closing_balance: string
  }
  rows: StatementRow[]
}

export interface AgingBucket {
  key: string
  label: string
  amount: string
  count: number
}

// ---------------------------------------------------------------- دفتر معین
export interface LedgerEntry {
  id: number
  party: number
  party_detail: PartyMini
  date: string
  date_jalali: string
  debit: string
  credit: string
  amount: string
  entry_type: 'debit' | 'credit'
  category: string
  category_display: string
  document_number: string
  description: string
  source_type: string
  source_type_display: string
  source_id: number | null
  is_system_generated: boolean
  bank_account: number | null
  bank_account_title: string
  created_by: number | null
  created_by_name: string
  created_at: string
}

export interface LedgerSummary {
  count: number
  total_debit: string
  total_credit: string
  net: string
  by_category: Array<{
    category: string
    category_display: string
    debit: string
    credit: string
    count: number
  }>
}

export interface BankAccount {
  id: number
  title: string
  bank_name: string
  account_number: string
  iban: string
  card_number: string
  branch: string
  initial_balance: string
  is_active: boolean
  created_at: string
}

export interface FinanceCategory {
  id: number
  name: string
  kind: 'expense' | 'income'
  kind_display: string
  description: string
  is_active: boolean
  records_count?: number
}

export interface FinanceRecord {
  id: number
  kind: 'expense' | 'income'
  kind_display: string
  category: number
  category_name: string
  title: string
  amount: string
  date: string
  date_jalali: string
  payment_method: string
  payment_method_display: string
  party: number | null
  party_name: string
  bank_account: number | null
  description: string
  attachment: string | null
  created_by: number | null
  created_by_name: string
  created_at: string
}

export interface FinanceSummary {
  total_expense: string
  total_income: string
  net: string
  expense_count: number
  income_count: number
  by_category: Array<{ name: string; kind: string; total: string; count: number }>
}

// ---------------------------------------------------------------- چک
export type ChequeDirection = 'payable' | 'receivable'

export type ChequeStatus =
  | 'in_portfolio' | 'submitted' | 'cleared' | 'bounced'
  | 'returned' | 'transferred' | 'extended' | 'cancelled'

export interface ChequeStatusHistoryItem {
  id: number
  from_status: string
  from_status_display: string
  to_status: string
  to_status_display: string
  changed_at_date: string
  changed_at_date_jalali: string
  note: string
  changed_by: number | null
  changed_by_name: string
  created_at: string
}

export interface Cheque {
  id: number
  direction: ChequeDirection
  direction_display: string
  serial_number: string
  sayad_id: string
  bank_name: string
  bank_display: string
  branch: string
  account_number: string
  amount: string
  issue_date: string
  issue_date_jalali: string
  due_date: string
  due_date_jalali: string
  due_date_verbose: string
  party: number
  party_detail: PartyMini
  holder_name: string
  status: ChequeStatus
  status_display: string
  settled_date: string | null
  settled_date_jalali: string | null
  bank_account: number | null
  order: number | null
  order_number: string
  description: string
  attachment: string | null
  create_ledger_entry: boolean
  created_by: number | null
  created_by_name: string
  created_at: string
  due_state: 'settled' | 'overdue' | 'critical' | 'warning' | 'upcoming' | 'far'
  due_state_display: string
  days_to_due: number
  is_open: boolean
  is_overdue: boolean
  allowed_transitions: Choice[]
  status_history?: ChequeStatusHistoryItem[]
}

export interface ChequeSideSummary {
  count: number
  total_amount: string
  open_count: number
  open_amount: string
  overdue_count: number
  overdue_amount: string
  due_7_days: string
  due_30_days: string
  cleared_amount: string
  bounced_count: number
  bounced_amount: string
}

export interface ChequeSummary {
  payable: ChequeSideSummary
  receivable: ChequeSideSummary
  net_open_position: string
  by_status: Array<{
    direction: ChequeDirection
    status: string
    status_display: string
    count: number
    total: string
  }>
}

export interface ChequeCalendarMonth {
  month: string
  payable_amount: string
  receivable_amount: string
  payable_count: number
  receivable_count: number
  net: string
  items: Array<{
    id: number
    direction: ChequeDirection
    serial_number: string
    amount: string
    due_date: string
    due_date_jalali: string
    party_name: string
    status: string
    status_display: string
    due_state: string
  }>
}

export interface ChequeOptions {
  directions: Choice[]
  statuses: Choice[]
  banks: Choice[]
}

// ---------------------------------------------------------------- کالا
export interface ProductCategory {
  id: number
  name: string
  full_name: string
  parent: number | null
  parent_name: string
  description: string
  is_active: boolean
  products_count?: number
}

export interface Product {
  id: number
  sku: string
  barcode: string
  name: string
  category: number | null
  category_name: string
  unit: string
  unit_display: string
  purchase_price: string
  sale_price: string
  stock_quantity: string
  reorder_point: string
  lead_time_days: number
  default_supplier: number | null
  supplier_name: string
  image: string | null
  description: string
  is_active: boolean
  profit_margin: string
  stock_value: string
  stock_state: 'ok' | 'low' | 'out_of_stock'
  stock_state_display: string
  has_open_defect?: boolean
  created_at: string
}

export type ProductDefectStatus = 'open' | 'repaired'

export interface ProductDefect {
  id: number
  product: number
  product_name: string
  product_sku: string
  supplier: number | null
  supplier_name: string
  reason: string
  description: string
  registered_at: string
  registered_at_jalali: string | null
  last_follow_up_at: string | null
  last_follow_up_at_jalali: string | null
  status: ProductDefectStatus
  status_display: string
  repaired_at: string | null
  repaired_at_jalali: string | null
  created_by: number | null
  created_by_name: string
  created_at: string
}

export interface ProductMini {
  id: number
  sku: string
  name: string
  unit: string
  unit_display: string
  sale_price: string
  purchase_price: string
  stock_quantity: string
}

export interface CatalogSummary {
  total_products: number
  active_products: number
  out_of_stock: number
  low_stock: number
  stock_value: string
  retail_value: string
  categories: number
}

export interface StockMovement {
  id: number
  product: number
  product_name: string
  date: string
  date_jalali: string
  quantity: string
  unit_cost: string
  reason: string
  reason_display: string
  balance_after: string
  source_type: string
  source_id: number | null
  description: string
  created_by: number | null
  created_by_name: string
  created_at: string
}

// ---------------------------------------------------------------- سفارش
export type OrderType = 'sale' | 'purchase'
export type OrderStatus = 'draft' | 'confirmed' | 'partial' | 'completed' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type EntryMode = 'manual' | 'automatic'
export type OcrStatus = 'pending' | 'processing' | 'done' | 'review' | 'failed'

export interface OrderItem {
  id?: number
  product: number
  product_detail?: ProductMini
  product_name?: string
  unit_display?: string
  quantity: string
  unit_price: string
  unit_cost?: string
  discount_amount?: string
  description?: string
  total_price?: string
  total_cost?: string
}

export interface Order {
  id: number
  number: string
  order_type: OrderType
  order_type_display: string
  party: number
  party_detail: PartyMini
  order_date: string
  order_date_jalali: string
  due_date: string | null
  due_date_jalali: string | null
  status: OrderStatus
  status_display: string
  payment_status: PaymentStatus
  payment_status_display: string
  discount_amount: string
  tax_percent: string
  shipping_amount: string
  subtotal: string
  tax_amount: string
  total_amount: string
  paid_amount: string
  cost_amount: string
  remaining_amount: string
  gross_profit: string
  affects_stock: boolean
  description: string
  items: OrderItem[]
  items_count: number
  is_editable: boolean
  created_by: number | null
  created_by_name: string
  confirmed_by: number | null
  confirmed_by_name: string
  confirmed_at: string | null
  source_suggestion: number | null
  created_at: string
  entry_mode: EntryMode
  entry_mode_display: string
  invoice_image: string | null
  invoice_image_url: string | null
  ocr_status: OcrStatus
  ocr_status_display: string
  ocr_payload: Record<string, unknown>
  ocr_confidence: number
}

export interface OrderListItem {
  id: number
  number: string
  order_type: OrderType
  order_type_display: string
  party: number
  party_name: string
  order_date: string
  order_date_jalali: string
  due_date: string | null
  due_date_jalali: string | null
  status: OrderStatus
  status_display: string
  payment_status: PaymentStatus
  payment_status_display: string
  total_amount: string
  paid_amount: string
  remaining_amount: string
  items_count: number
  created_at: string
  entry_mode: EntryMode
  entry_mode_display: string
}

export interface OrderSummarySide {
  count: number
  draft_count: number
  automatic_count?: number
  manual_count?: number
  total_amount: string
  paid_amount: string
  remaining_amount: string
  cost_amount: string
}

export interface OrderSummary {
  sale: OrderSummarySide
  purchase: OrderSummarySide
  cancelled_count: number
  overdue_count: number
  pending_suggestions: number
  automatic_total?: number
  manual_total?: number
}

export interface PipelineStage {
  name: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'review'
  detail: string
}

export interface OcrCapabilities {
  pipeline?: string
  paddleocr?: boolean
  vision_llm?: boolean
  engines: string[]
  recommended: string | null
  configured: boolean
  openai?: boolean
  tesseract?: boolean
}

export interface OrderOptions {
  order_types: Choice[]
  statuses: Choice[]
  payment_statuses: Choice[]
  entry_modes: Choice[]
  ocr_statuses: Choice[]
  suggestion_statuses: Choice[]
  priorities: Choice[]
  weekdays: NumericChoice[]
  ocr_capabilities?: OcrCapabilities
}

export interface ParsedInvoiceItem {
  product_name: string
  product_id: number | null
  product_code?: string
  quantity: string
  unit_price: string
  match_score: number
  matched?: boolean
}

export interface ParsedInvoice {
  party_name: string
  party_id: number | null
  invoice_number?: string
  order_date: string
  order_date_jalali: string
  total_amount: string | null
  confidence: number
  warnings: string[]
  items: ParsedInvoiceItem[]
  raw_text: string
  ocr_engine?: string
  ocr_error?: string
  pipeline?: PipelineStage[]
}

export interface InvoiceUploadPreview {
  parsed: ParsedInvoice
  requires_party: boolean
  ocr_capabilities?: OcrCapabilities
}

// ---------------------------------------------------------------- سوابق و پیشنهاد
export interface SalesHistoryItem {
  id: number
  batch: number | null
  product: number | null
  product_name: string
  product_name_raw: string
  sale_date: string
  sale_date_jalali: string
  quantity: string
  unit_price: string
  total_amount: string
  unit_cost: string
  customer_name: string
  party: number | null
  source_order: number | null
}

export interface SalesHistorySummary {
  count: number
  total_quantity: string
  total_amount: string
  first_date: string | null
  first_date_jalali: string | null
  last_date: string | null
  last_date_jalali: string | null
  distinct_products: number
  top_products: Array<{
    product: number | null
    product_name_raw: string
    quantity: string
    amount: string
    count: number
  }>
}

export interface SalesImportBatch {
  id: number
  file_name: string
  status: 'pending' | 'done' | 'failed'
  status_display: string
  total_rows: number
  imported_rows: number
  skipped_rows: number
  created_products: number
  errors: Array<{ line: number; error: string; row: Record<string, string> }>
  date_from: string | null
  date_from_jalali: string | null
  date_to: string | null
  date_to_jalali: string | null
  created_by: number | null
  created_by_name: string
  created_at: string
  created_at_jalali: string
}

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'ordered' | 'expired'
export type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low'

export interface WeekdayBreakdown {
  weekday: number
  weekday_name: string
  quantity: number
  transactions: number
}

export interface SuggestionAnalysis {
  avg_daily: number
  recent_daily: number
  effective_daily: number
  std_daily: number
  safety_stock: number
  target_stock: number
  raw_quantity: number
  active_days: number
  span_days: number
  first_sale: string
  first_sale_jalali: string
  last_sale: string
  last_sale_jalali: string
  weekday_breakdown: WeekdayBreakdown[]
  avg_price: number
  avg_cost: number
}

export interface PurchaseSuggestion {
  id: number
  product: number
  product_detail: ProductMini
  product_name: string
  unit_display: string
  suggested_date: string
  suggested_date_jalali: string
  suggested_date_verbose: string
  suggested_quantity: string
  suggested_supplier: number | null
  supplier_name: string
  estimated_cost: string
  avg_daily_sales: string
  current_stock: string
  days_of_stock_left: string
  stockout_date: string | null
  stockout_date_jalali: string | null
  coverage_days: number
  lead_time_days: number
  best_weekday: number | null
  best_weekday_name: string
  seasonality_factor: string
  trend_percent: string
  confidence: number
  data_points: number
  priority: SuggestionPriority
  priority_display: string
  status: SuggestionStatus
  status_display: string
  reason: string
  analysis: SuggestionAnalysis
  generated_at: string
  generated_at_jalali: string
  reviewed_by: number | null
  review_note: string
}

export interface SuggestionSummary {
  total: number
  pending: number
  accepted: number
  ordered: number
  rejected: number
  estimated_cost: string
  critical_count: number
  due_this_week: number
  by_priority: Array<{
    priority: string
    priority_display: string
    count: number
    estimated_cost: string
  }>
}

export interface GenerateResult {
  created: number
  removed_pending: number
  analyzed_products: number
  total_products: number
  skipped_no_data: number
  skipped_low_confidence: number
  skipped_not_needed: number
  parameters: Record<string, unknown>
}

export interface ProductAnalysis {
  product_id: number
  product_name: string
  unit_display?: string
  has_data: boolean
  detail?: string
  current_stock?: number
  lead_time_days?: number
  avg_daily?: number
  recent_daily?: number
  effective_daily?: number
  std_daily?: number
  trend_percent?: number
  seasonality?: number
  confidence?: number
  data_points?: number
  active_days?: number
  span_days?: number
  best_weekday?: number | null
  weekday_breakdown?: WeekdayBreakdown[]
  daily_series?: Array<{ date: string; date_jalali: string; quantity: number }>
  first_sale_jalali?: string
  last_sale_jalali?: string
  total_quantity?: number
}

// ---------------------------------------------------------------- گزارش
export interface ProfitLossReport {
  date_from: string
  date_to: string
  date_from_jalali: string
  date_to_jalali: string
  days: number
  revenue: {
    gross_sales: string
    discounts: string
    net_sales: string
    tax_collected: string
    shipping: string
    invoices_total: string
    sale_orders_count: number
  }
  cost_of_goods_sold: string
  gross_profit: string
  gross_margin_percent: string
  operating_expenses: string
  operating_profit: string
  other_income: string
  net_profit: string
  net_margin_percent: string
  purchases: { total: string; count: number }
  bounced_cheques: { amount: string; count: number }
  expense_breakdown: Array<{
    category: string
    amount: string
    count: number
    share_percent: number
  }>
  income_breakdown: Array<{ category: string; amount: string; count: number }>
  monthly: Array<{
    month: string
    net_sales: string
    cogs: string
    expenses: string
    other_income: string
    gross_profit: string
    net_profit: string
  }>
  previous_period?: {
    date_from_jalali: string
    date_to_jalali: string
    net_sales: string
    gross_profit: string
    net_profit: string
    operating_expenses: string
  }
}

export interface SalesReport {
  date_from_jalali: string
  date_to_jalali: string
  totals: {
    total_amount: string
    cost_amount: string
    paid_amount: string
    remaining_amount: string
    profit: string
    orders_count: number
    average_order: string
  }
  by_product: Array<{
    product_id: number
    product_name: string
    unit_display: string
    quantity: string
    revenue: string
    cost: string
    profit: string
  }>
  by_party: Array<{ party: number; party__name: string; total: string; count: number }>
  timeline: Array<{ label: string; total: string; cost: string; count: number; profit: string }>
}

export interface PurchaseReport {
  date_from_jalali: string
  date_to_jalali: string
  totals: {
    total_amount: string
    paid_amount: string
    remaining_amount: string
    orders_count: number
  }
  by_supplier: Array<{ party: number; party__name: string; total: string; count: number }>
  by_product: Array<{ product_id: number; product_name: string; quantity: string; amount: string }>
}

export interface ReceivablesReport {
  as_of: string
  as_of_jalali: string
  total_receivable: string
  total_payable: string
  net_position: string
  debtor_count: number
  creditor_count: number
  debtors: Array<{
    id: number
    name: string
    code: string
    party_type_display: string
    mobile: string
    balance: string
    credit_limit?: string
    over_limit?: boolean
  }>
  creditors: Array<{
    id: number
    name: string
    code: string
    party_type_display: string
    mobile: string
    balance: string
  }>
}

export interface ChequeReport {
  date_from_jalali: string
  date_to_jalali: string
  payable: ChequeReportSide
  receivable: ChequeReportSide
  timeline: Array<{ label: string; payable: string; receivable: string; net: string }>
}

export interface ChequeReportSide {
  count: number
  total: string
  open_total: string
  cleared_total: string
  bounced_total: string
  by_status: Array<{ status: string; status_display: string; count: number; total: string }>
}

export interface InventoryReportRow {
  id: number
  sku: string
  name: string
  category: string
  unit_display: string
  stock_quantity: string
  reorder_point: string
  purchase_price: string
  sale_price: string
  stock_value: string
  retail_value: string
  stock_state: string
  stock_state_display: string
}

export interface InventoryReport {
  total_products: number
  total_stock_value: string
  total_retail_value: string
  potential_profit: string
  out_of_stock: InventoryReportRow[]
  low_stock: InventoryReportRow[]
  by_category: Array<{ category: string; value: string; count: number }>
  items: InventoryReportRow[]
}

export interface WarehouseStatsSummary {
  total_products: number
  total_stock_value: string
  total_retail_value: string
  out_of_stock_count: number
  low_stock_count: number
  movement_count: number
  quantity_in: string
  quantity_out: string
  net_quantity: string
  value_in: string
  value_out: string
  net_value: string
}

export interface WarehouseStatsReport {
  date_from: string
  date_to: string
  date_from_jalali: string
  date_to_jalali: string
  summary: WarehouseStatsSummary
  by_reason: Array<{
    reason: string
    reason_display: string
    quantity_in: string
    quantity_out: string
    value_in: string
    value_out: string
    count: number
  }>
  top_movers: Array<{
    product_id: number
    product_name: string
    sku: string
    unit_display: string
    category: string
    quantity_in: string
    quantity_out: string
    current_stock: string
  }>
  daily: Array<{
    date: string
    label: string
    quantity_in: string
    quantity_out: string
  }>
  inventory: InventoryReport
}

export interface DashboardData {
  date_from: string
  date_to: string
  date_from_jalali: string
  date_to_jalali: string
  kpis: {
    net_sales: string
    gross_profit: string
    net_profit: string
    net_margin_percent: string
    operating_expenses: string
    sale_orders_count: number
    purchases_total: string
    total_receivable: string
    total_payable: string
    net_position: string
  }
  cheques: {
    payable_open_count: number
    payable_open_amount: string
    receivable_open_count: number
    receivable_open_amount: string
    overdue_count: number
    due_7_days_count: number
    bounced_count: number
  }
  inventory: { low_stock_count: number; total_products: number }
  suggestions: { pending_count: number; critical_count: number }
  daily_series: Array<{ date: string; label: string; sales: string; profit: string; count: number }>
  top_products: SalesReport['by_product']
  top_debtors: ReceivablesReport['debtors']
  top_creditors: ReceivablesReport['creditors']
  monthly_trend: ProfitLossReport['monthly']
}

export interface ReportCatalogItem {
  key: string
  title: string
  capability: string
  description: string
  allowed: boolean
}
