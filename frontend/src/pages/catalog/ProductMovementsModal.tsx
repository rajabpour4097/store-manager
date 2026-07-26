import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Money } from '@/components/ui/Misc'
import { useAsync } from '@/hooks/useAsync'
import { catalogApi } from '@/services/endpoints'
import { formatQuantity, toNumber } from '@/utils/format'
import type { Product, StockMovement } from '@/types'

interface ProductMovementsModalProps {
  open: boolean
  product: Product | null
  onClose: () => void
}

export function ProductMovementsModal({ open, product, onClose }: ProductMovementsModalProps) {
  const { data, loading, error } = useAsync(
    () => catalogApi.productMovements(product!.id),
    [product?.id, open],
    { skip: !open || !product },
  )

  const columns: Array<Column<StockMovement>> = [
    { key: 'date', header: 'تاریخ', render: (row) => <span className="num">{row.date_jalali}</span> },
    {
      key: 'quantity',
      header: 'مقدار',
      render: (row) => (
        <span
          className={
            toNumber(row.quantity) >= 0
              ? 'num font-semibold text-teal-600 dark:text-teal-400'
              : 'num font-semibold text-rose-600 dark:text-rose-400'
          }
        >
          {toNumber(row.quantity) >= 0 ? '+' : '−'}
          {formatQuantity(Math.abs(toNumber(row.quantity)))}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'موجودی پس از گردش',
      render: (row) => (
        <span className="num">{formatQuantity(row.balance_after, product?.unit_display)}</span>
      ),
    },
    {
      key: 'reason',
      header: 'دلیل',
      render: (row) => <Badge tone="neutral">{row.reason_display}</Badge>,
    },
    {
      key: 'cost',
      header: 'بهای واحد',
      render: (row) =>
        toNumber(row.unit_cost) > 0 ? <Money value={row.unit_cost} /> : <span className="text-ink-300">—</span>,
    },
    {
      key: 'description',
      header: 'توضیحات',
      render: (row) => (
        <span className="text-xs text-ink-500">{row.description || row.created_by_name || '—'}</span>
      ),
    },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="گردش انبار"
      subtitle={
        product
          ? `${product.name} — موجودی فعلی ${formatQuantity(product.stock_quantity, product.unit_display)}`
          : undefined
      }
    >
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        emptyMessage="گردشی برای این کالا ثبت نشده است."
      />
    </Modal>
  )
}
