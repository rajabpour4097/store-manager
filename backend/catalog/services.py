"""سرویس‌های انبار."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from .models import Product, StockMovement


@transaction.atomic
def apply_movement(
    *,
    product: Product,
    date,
    quantity: Decimal | float | int,
    reason: str,
    unit_cost: Decimal | int = 0,
    source_type: str = '',
    source_id: int | None = None,
    description: str = '',
    user=None,
) -> StockMovement:
    """اعمال یک گردش انبار و به‌روزرسانی موجودی کالا."""
    quantity = Decimal(str(quantity))
    locked = Product.objects.select_for_update().get(pk=product.pk)
    locked.stock_quantity = Decimal(locked.stock_quantity) + quantity
    locked.save(update_fields=['stock_quantity', 'modified_at'])

    return StockMovement.objects.create(
        product=locked,
        date=date,
        quantity=quantity,
        unit_cost=Decimal(unit_cost or 0),
        reason=reason,
        balance_after=locked.stock_quantity,
        source_type=source_type,
        source_id=source_id,
        description=description,
        created_by=user,
    )


@transaction.atomic
def revert_movements(*, source_type: str, source_id: int, user=None) -> int:
    """گردش‌های یک منبع (مثل سفارش) را برمی‌گرداند و حذف می‌کند."""
    movements = StockMovement.objects.select_related('product').filter(
        source_type=source_type, source_id=source_id
    )
    count = 0
    for movement in movements:
        locked = Product.objects.select_for_update().get(pk=movement.product_id)
        locked.stock_quantity = Decimal(locked.stock_quantity) - movement.quantity
        locked.save(update_fields=['stock_quantity', 'modified_at'])
        count += 1
    movements.delete()
    return count
