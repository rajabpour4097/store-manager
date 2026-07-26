import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth, RequireCapability } from '@/components/layout/Guards'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ChequesPage } from '@/pages/cheques/ChequesPage'
import { ChequeCalendarPage } from '@/pages/cheques/ChequeCalendarPage'
import { PartiesPage } from '@/pages/parties/PartiesPage'
import { PartyDetailPage } from '@/pages/parties/PartyDetailPage'
import { LedgerPage } from '@/pages/ledger/LedgerPage'
import { FinancePage } from '@/pages/ledger/FinancePage'
import { BankAccountsPage } from '@/pages/ledger/BankAccountsPage'
import { ProductsPage } from '@/pages/catalog/ProductsPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { OrderDetailPage } from '@/pages/orders/OrderDetailPage'
import { SuggestionsPage } from '@/pages/orders/SuggestionsPage'
import { SalesHistoryPage } from '@/pages/orders/SalesHistoryPage'
import { ReportsHubPage } from '@/pages/reports/ReportsHubPage'
import { ProfitLossPage } from '@/pages/reports/ProfitLossPage'
import { SalesReportPage } from '@/pages/reports/SalesReportPage'
import { PurchasesReportPage } from '@/pages/reports/PurchasesReportPage'
import { ReceivablesReportPage } from '@/pages/reports/ReceivablesReportPage'
import { InventoryReportPage } from '@/pages/reports/InventoryReportPage'
import { UsersPage } from '@/pages/system/UsersPage'
import { ActivityPage } from '@/pages/system/ActivityPage'
import { ProfilePage } from '@/pages/system/ProfilePage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />

        <Route
          path="cheques/receivable"
          element={
            <RequireCapability capability="cheques.view">
              <ChequesPage direction="receivable" />
            </RequireCapability>
          }
        />
        <Route
          path="cheques/payable"
          element={
            <RequireCapability capability="cheques.view">
              <ChequesPage direction="payable" />
            </RequireCapability>
          }
        />
        <Route
          path="cheques/calendar"
          element={
            <RequireCapability capability="cheques.view">
              <ChequeCalendarPage />
            </RequireCapability>
          }
        />

        <Route
          path="parties"
          element={
            <RequireCapability capability="parties.view">
              <PartiesPage />
            </RequireCapability>
          }
        />
        <Route
          path="parties/:id"
          element={
            <RequireCapability capability="parties.view">
              <PartyDetailPage />
            </RequireCapability>
          }
        />
        <Route
          path="ledger"
          element={
            <RequireCapability capability="ledger.view">
              <LedgerPage />
            </RequireCapability>
          }
        />
        <Route
          path="finance"
          element={
            <RequireCapability capability="ledger.view">
              <FinancePage />
            </RequireCapability>
          }
        />
        <Route
          path="banks"
          element={
            <RequireCapability capability="ledger.view">
              <BankAccountsPage />
            </RequireCapability>
          }
        />

        <Route
          path="products"
          element={
            <RequireCapability capability="catalog.view">
              <ProductsPage />
            </RequireCapability>
          }
        />
        <Route
          path="orders"
          element={
            <RequireCapability capability="orders.view">
              <OrdersPage />
            </RequireCapability>
          }
        />
        <Route
          path="orders/:id"
          element={
            <RequireCapability capability="orders.view">
              <OrderDetailPage />
            </RequireCapability>
          }
        />
        <Route
          path="suggestions"
          element={
            <RequireCapability capability="orders.view">
              <SuggestionsPage />
            </RequireCapability>
          }
        />
        <Route
          path="sales-history"
          element={
            <RequireCapability capability="orders.view">
              <SalesHistoryPage />
            </RequireCapability>
          }
        />

        <Route
          path="reports"
          element={
            <RequireCapability capability="reports.view">
              <ReportsHubPage />
            </RequireCapability>
          }
        />
        <Route
          path="reports/profit-loss"
          element={
            <RequireCapability capability="reports.profit_loss">
              <ProfitLossPage />
            </RequireCapability>
          }
        />
        <Route
          path="reports/sales"
          element={
            <RequireCapability capability="reports.view">
              <SalesReportPage />
            </RequireCapability>
          }
        />
        <Route
          path="reports/purchases"
          element={
            <RequireCapability capability="reports.view">
              <PurchasesReportPage />
            </RequireCapability>
          }
        />
        <Route
          path="reports/receivables"
          element={
            <RequireCapability capability="reports.view">
              <ReceivablesReportPage />
            </RequireCapability>
          }
        />
        <Route
          path="reports/inventory"
          element={
            <RequireCapability capability="reports.view">
              <InventoryReportPage />
            </RequireCapability>
          }
        />

        <Route
          path="users"
          element={
            <RequireCapability capability="users.manage">
              <UsersPage />
            </RequireCapability>
          }
        />
        <Route
          path="activity"
          element={
            <RequireCapability capability="activity.view">
              <ActivityPage />
            </RequireCapability>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
