import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Lightbulb,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  TriangleAlert,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Capability } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  capability?: Capability
  end?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'نمای کلی',
    items: [{ to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'چک‌ها',
    items: [
      {
        to: '/cheques/receivable',
        label: 'چک‌های دریافتی',
        icon: ArrowDownToLine,
        capability: 'cheques.view',
      },
      {
        to: '/cheques/payable',
        label: 'چک‌های پرداختی',
        icon: ArrowUpFromLine,
        capability: 'cheques.view',
      },
      {
        to: '/cheques/calendar',
        label: 'تقویم سرسید',
        icon: ClipboardList,
        capability: 'cheques.view',
      },
    ],
  },
  {
    title: 'حساب‌ها',
    items: [
      { to: '/parties', label: 'طرف‌حساب‌ها', icon: Users, capability: 'parties.view' },
      { to: '/ledger', label: 'دفتر بدهکار و بستانکار', icon: ScrollText, capability: 'ledger.view' },
      { to: '/finance', label: 'هزینه و درآمد', icon: Receipt, capability: 'ledger.view' },
      { to: '/banks', label: 'حساب‌های بانکی', icon: Banknote, capability: 'ledger.view' },
    ],
  },
  {
    title: 'خرید و فروش',
    items: [
      {
        to: '/trade',
        label: 'خرید و فروش',
        icon: ArrowLeftRight,
        capability: 'orders.view',
      },
      {
        to: '/warehouse',
        label: 'آمار انبار',
        icon: Warehouse,
        capability: 'reports.view',
      },
      {
        to: '/defects',
        label: 'آمار خرابی‌ها',
        icon: TriangleAlert,
        capability: 'catalog.view',
      },
    ],
  },
  {
    title: 'کالا و سفارش',
    items: [
      { to: '/products', label: 'کالاها', icon: Boxes, capability: 'catalog.view' },
      { to: '/orders', label: 'سفارشات', icon: ShoppingCart, capability: 'orders.view' },
      { to: '/suggestions', label: 'پیشنهادات هوشمند', icon: Lightbulb, capability: 'orders.view' },
      {
        to: '/sales-history',
        label: 'سوابق فروش و ورود CSV',
        icon: FileSpreadsheet,
        capability: 'orders.view',
      },
    ],
  },
  {
    title: 'گزارش‌ها',
    items: [
      { to: '/reports', label: 'مرکز گزارش‌ها', icon: BarChart3, capability: 'reports.view', end: true },
      {
        to: '/reports/profit-loss',
        label: 'سود و زیان',
        icon: BadgeDollarSign,
        capability: 'reports.profit_loss',
      },
    ],
  },
  {
    title: 'مدیریت سیستم',
    items: [
      { to: '/users', label: 'کاربران', icon: UserCog, capability: 'users.manage' },
      { to: '/activity', label: 'گزارش فعالیت‌ها', icon: History, capability: 'activity.view' },
      { to: '/profile', label: 'پروفایل من', icon: Settings },
    ],
  },
]
