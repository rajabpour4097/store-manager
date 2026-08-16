"""سرویس‌های انبار."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import QuerySet

from .models import Product, ProductDefect, ProductSerial, StockMovement


def open_defect_product_ids() -> QuerySet:
    """شناسه کالاهایی که فعلاً خراب ثبت شده‌اند و نباید در آمار موجودی باشند."""
    return ProductDefect.objects.filter(
        status=ProductDefect.Status.OPEN,
    ).values_list('product_id', flat=True)


def inventory_products() -> QuerySet:
    """کالاهای فعال بدون خرابی باز برای آمار موجودی."""
    return Product.objects.filter(is_active=True).exclude(id__in=open_defect_product_ids())


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


def normalize_serial(value: str | None) -> str:
    return (value or '').strip()


def find_serial(serial_number: str) -> ProductSerial | None:
    serial = normalize_serial(serial_number)
    if not serial:
        return None
    return ProductSerial.objects.filter(serial_number__iexact=serial).first()


def revert_order_serials(*, order_type: str, order_id: int) -> None:
    """اثر سریال‌های یک سفارش را برمی‌گرداند."""
    if order_type == 'purchase':
        ProductSerial.objects.filter(purchase_order_id=order_id).delete()
        return
    ProductSerial.objects.filter(sale_order_id=order_id).update(
        status=ProductSerial.Status.IN_STOCK,
        sale_order_id=None,
    )


def apply_order_serials(order) -> None:
    """ثبت یا خروج سریال‌های اقلام سفارش تأییدشده."""
    is_sale = order.order_type == 'sale'
    for item in order.items.select_related('product'):
        serial = normalize_serial(item.serial_number)
        if not serial:
            continue
        if is_sale:
            locked = (
                ProductSerial.objects.select_for_update()
                .filter(serial_number__iexact=serial)
                .first()
            )
            if locked is None:
                continue
            locked.status = ProductSerial.Status.SOLD
            locked.sale_order_id = order.id
            locked.save(update_fields=['status', 'sale_order_id', 'modified_at'])
        else:
            ProductSerial.objects.create(
                product=item.product,
                serial_number=serial,
                status=ProductSerial.Status.IN_STOCK,
                purchase_order_id=order.id,
            )
