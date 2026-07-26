import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  PackageCheck,
} from 'lucide-react'

import { Badge, ORDER_STATUS_TONES, PAYMENT_STATUS_TONES } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { NumberInput } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Money, PageHeader } from '@/components/ui/Misc'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { ordersApi } from '@/services/endpoints'
import { formatMoney, formatQuantity, toPersianDigits } from '@/utils/format'
import type { Order } from '@/types'

export function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const toast = useToast()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      setOrder(await ordersApi.get(Number(id)))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'سفارش یافت نشد.')
      navigate('/orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const runAction = async (action: () => Promise<Order>, message: string) => {
    setBusy(true)
    try {
      setOrder(await action())
      toast.success(message)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'عملیات انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  const submitPayment = async () => {
    if (!order) return
    setBusy(true)
    try {
      setOrder(await ordersApi.registerPayment(order.id, paymentAmount))
      toast.success('پرداخت ثبت شد.')
      setPaymentOpen(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ثبت پرداخت انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !order) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink-400">
        <Loader2 className="animate-spin" size={28} />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={`سفارش ${toPersianDigits(order.number)}`}
        description={
          <span>
            {order.order_type_display} · {order.party_detail.name} ·{' '}
            <span className="num">{order.order_date_jalali}</span>
          </span>
        }
        icon={<ArrowRight size={20} className="rotate-180" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => navigate('/orders')}>
              بازگشت
            </Button>
            {can('orders.confirm') && order.status === 'draft' && (
              <Button
                icon={<CheckCircle2 size={16} />}
                loading={busy}
                onClick={() =>
                  void runAction(() => ordersApi.confirm(order.id), 'سفارش تأیید شد.')
                }
              >
                تأیید
              </Button>
            )}
            {can('orders.confirm') &&
              (order.status === 'confirmed' || order.status === 'partial') && (
                <Button
                  variant="success"
                  icon={<PackageCheck size={16} />}
                  loading={busy}
                  onClick={() =>
                    void runAction(() => ordersApi.complete(order.id), 'سفارش تکمیل شد.')
                  }
                >
                  تکمیل
                </Button>
              )}
            {can('orders.change') &&
              order.status !== 'cancelled' &&
              order.payment_status !== 'paid' && (
                <Button
                  variant="secondary"
                  icon={<CircleDollarSign size={16} />}
                  onClick={() => {
                    setPaymentAmount(String(order.remaining_amount))
                    setPaymentOpen(true)
                  }}
                >
                  ثبت پرداخت
                </Button>
              )}
            {can('orders.confirm') &&
              order.status !== 'cancelled' &&
              order.status !== 'completed' && (
                <Button
                  variant="danger"
                  icon={<Ban size={16} />}
                  onClick={() => setCancelOpen(true)}
                >
                  لغو
                </Button>
              )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={ORDER_STATUS_TONES[order.status] ?? 'neutral'}>{order.status_display}</Badge>
        <Badge tone={PAYMENT_STATUS_TONES[order.payment_status] ?? 'neutral'}>
          {order.payment_status_display}
        </Badge>
        {order.source_suggestion && (
          <Link to="/suggestions" className="badge bg-purple-50 text-purple-700">
            از پیشنهاد هوشمند
          </Link>
        )}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-ink-500">جمع کل</p>
          <p className="mt-1 text-lg font-bold">
            <Money value={order.total_amount} />
          </p>
        </Card>
        <Card>
          <p className="text-xs text-ink-500">پرداخت‌شده</p>
          <p className="mt-1 text-lg font-bold text-teal-600">
            <Money value={order.paid_amount} />
          </p>
        </Card>
        <Card>
          <p className="text-xs text-ink-500">باقیمانده</p>
          <p className="mt-1 text-lg font-bold text-rose-600">
            <Money value={order.remaining_amount} />
          </p>
        </Card>
        <Card>
          <p className="text-xs text-ink-500">سود ناخالص</p>
          <p className="mt-1 text-lg font-bold text-brand-600">
            <Money value={order.gross_profit} />
          </p>
        </Card>
      </div>

      <Card title="اقلام" className="mb-5" bodyClassName="!p-0 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-ink-50 text-ink-500 dark:bg-ink-800/60">
            <tr>
              <th className="px-4 py-3 text-right font-medium">کالا</th>
              <th className="px-4 py-3 text-right font-medium">تعداد</th>
              <th className="px-4 py-3 text-right font-medium">فی</th>
              <th className="px-4 py-3 text-right font-medium">تخفیف</th>
              <th className="px-4 py-3 text-right font-medium">جمع</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-ink-100 dark:border-ink-800">
                <td className="px-4 py-3">
                  {item.product_detail?.name ?? item.product_name}
                  <span className="mt-0.5 block text-xs text-ink-400">
                    {item.unit_display ?? item.product_detail?.unit_display}
                  </span>
                </td>
                <td className="px-4 py-3 num">
                  {formatQuantity(item.quantity, item.unit_display)}
                </td>
                <td className="px-4 py-3">
                  <Money value={item.unit_price} />
                </td>
                <td className="px-4 py-3">
                  <Money value={item.discount_amount ?? 0} />
                </td>
                <td className="px-4 py-3 font-semibold">
                  <Money value={item.total_price} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="جزئیات مالی">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">جمع جزء</dt>
              <dd>{formatMoney(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">تخفیف</dt>
              <dd>{formatMoney(order.discount_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">مالیات ({toPersianDigits(order.tax_percent)}٪)</dt>
              <dd>{formatMoney(order.tax_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">ارسال</dt>
              <dd>{formatMoney(order.shipping_amount)}</dd>
            </div>
            <div className="flex justify-between border-t border-ink-100 pt-2 font-semibold dark:border-ink-800">
              <dt>جمع نهایی</dt>
              <dd>{formatMoney(order.total_amount)}</dd>
            </div>
          </dl>
        </Card>
        <Card title="اطلاعات ثبت">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">طرف حساب</dt>
              <dd>
                <Link className="text-brand-600 hover:underline" to={`/parties/${order.party}`}>
                  {order.party_detail.name}
                </Link>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">ثبت‌کننده</dt>
              <dd>{order.created_by_name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">تأییدکننده</dt>
              <dd>{order.confirmed_by_name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">تأثیر روی موجودی</dt>
              <dd>{order.affects_stock ? 'بله' : 'خیر'}</dd>
            </div>
            {order.description && (
              <div>
                <dt className="mb-1 text-ink-500">توضیحات</dt>
                <dd className="rounded-xl bg-ink-50 p-3 text-ink-700 dark:bg-ink-800/50 dark:text-ink-200">
                  {order.description}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="ثبت پرداخت"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaymentOpen(false)}>
              انصراف
            </Button>
            <Button loading={busy} onClick={() => void submitPayment()}>
              ثبت
            </Button>
          </>
        }
      >
        <NumberInput
          label="مبلغ پرداخت (ریال)"
          value={paymentAmount}
          onChange={setPaymentAmount}
          hint={`باقیمانده فعلی: ${formatMoney(order.remaining_amount)}`}
        />
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="لغو سفارش"
        message="با لغو سفارش، موجودی و مانده‌های مرتبط برمی‌گردند. ادامه می‌دهید؟"
        confirmLabel="لغو سفارش"
        danger
        loading={busy}
        onConfirm={() => {
          setCancelOpen(false)
          void runAction(() => ordersApi.cancel(order.id), 'سفارش لغو شد.')
        }}
        onCancel={() => setCancelOpen(false)}
      />
    </>
  )
}
