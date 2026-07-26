"""منطق کسب‌وکار سفارشات: تأیید، لغو و اثر روی انبار و دفتر معین."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from catalog.models import StockMovement
from catalog.services import apply_movement, revert_movements
from ledger.models import EntryCategory, SourceType
from ledger.services import delete_system_entries, sync_system_entry

from .models import Order, OrderStatus, OrderType, PaymentStatus, SalesHistory

SOURCE_ORDER = 'order'
INVOICE_MARKER = 'ORD-INVOICE'
PAYMENT_MARKER = 'ORD-PAYMENT'


class OrderError(Exception):
    """خطای عملیات سفارش."""


def sync_order_ledger(order: Order, user=None) -> None:
    """اسناد دفتر معین سفارش را همگام می‌کند.

    فروش: مشتری بدهکار می‌شود.
    خرید: تأمین‌کننده بستانکار می‌شود.
    مبلغ پرداخت‌شده اثر معکوس دارد.
    """
    if order.status in (OrderStatus.DRAFT, OrderStatus.CANCELLED):
        delete_system_entries(source_type=SourceType.ORDER, source_id=order.id)
        return

    is_sale = order.order_type == OrderType.SALE

    sync_system_entry(
        party=order.party,
        date=order.order_date,
        debit=order.total_amount if is_sale else 0,
        credit=0 if is_sale else order.total_amount,
        category=EntryCategory.SALE_INVOICE if is_sale else EntryCategory.PURCHASE_INVOICE,
        source_type=SourceType.ORDER,
        source_id=order.id,
        marker=INVOICE_MARKER,
        description=f'{order.get_order_type_display()} طی سفارش {order.number}',
        created_by=user or order.created_by,
    )

    paid = Decimal(order.paid_amount or 0)
    sync_system_entry(
        party=order.party,
        date=order.order_date,
        debit=0 if is_sale else paid,
        credit=paid if is_sale else 0,
        category=EntryCategory.CASH_RECEIPT if is_sale else EntryCategory.CASH_PAYMENT,
        source_type=SourceType.ORDER,
        source_id=order.id,
        marker=PAYMENT_MARKER,
        description=f'پرداخت نقدی سفارش {order.number}',
        created_by=user or order.created_by,
    )


def sync_order_stock(order: Order, user=None) -> None:
    """گردش انبار سفارش را همگام می‌کند (ابتدا برگرداندن، سپس اعمال مجدد)."""
    revert_movements(source_type=SOURCE_ORDER, source_id=order.id, user=user)

    if not order.affects_stock or order.status in (OrderStatus.DRAFT, OrderStatus.CANCELLED):
        return

    is_sale = order.order_type == OrderType.SALE
    reason = StockMovement.Reason.SALE if is_sale else StockMovement.Reason.PURCHASE

    for item in order.items.select_related('product'):
        quantity = Decimal(item.quantity)
        apply_movement(
            product=item.product,
            date=order.order_date,
            quantity=-quantity if is_sale else quantity,
            reason=reason,
            unit_cost=item.unit_cost if is_sale else item.unit_price,
            source_type=SOURCE_ORDER,
            source_id=order.id,
            description=f'{order.get_order_type_display()} سفارش {order.number}',
            user=user,
        )


def sync_order_sales_history(order: Order) -> None:
    """سفارش فروش تأییدشده را به سوابق فروش اضافه می‌کند تا در تحلیل هوشمند لحاظ شود."""
    SalesHistory.objects.filter(source_order=order).delete()

    if order.order_type != OrderType.SALE or order.status in (OrderStatus.DRAFT, OrderStatus.CANCELLED):
        return

    records = [
        SalesHistory(
            product=item.product,
            product_name_raw=item.product.name,
            sale_date=order.order_date,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_amount=item.total_price,
            unit_cost=item.unit_cost,
            customer_name=order.party.name,
            party=order.party,
            source_order=order,
        )
        for item in order.items.select_related('product')
    ]
    SalesHistory.objects.bulk_create(records)


@transaction.atomic
def refresh_order(order: Order, user=None) -> Order:
    """محاسبه‌ی مجدد سفارش و همگام‌سازی همه‌ی اثرات آن."""
    order.recalculate()
    sync_order_ledger(order, user=user)
    sync_order_stock(order, user=user)
    sync_order_sales_history(order)
    return order


@transaction.atomic
def confirm_order(order: Order, user=None) -> Order:
    """تأیید سفارش: اثرگذاری روی انبار، دفتر معین و سوابق فروش."""
    if order.status == OrderStatus.CANCELLED:
        raise OrderError('سفارش لغو‌شده را نمی‌توان تأیید کرد.')
    if order.status != OrderStatus.DRAFT:
        raise OrderError('فقط سفارش پیش‌نویس قابل تأیید است.')
    if not order.items.exists():
        raise OrderError('سفارش بدون ردیف کالا قابل تأیید نیست.')

    if order.order_type == OrderType.SALE and order.affects_stock:
        shortages = [
            f'{item.product.name} (موجودی {item.product.stock_quantity}، نیاز {item.quantity})'
            for item in order.items.select_related('product')
            if Decimal(item.product.stock_quantity) < Decimal(item.quantity)
        ]
        if shortages:
            raise OrderError('موجودی کافی نیست: ' + '، '.join(shortages))

    order.status = OrderStatus.CONFIRMED
    order.confirmed_by = user
    order.confirmed_at = timezone.now()
    order.save(update_fields=['status', 'confirmed_by', 'confirmed_at', 'modified_at'])

    refresh_order(order, user=user)
    return order


@transaction.atomic
def complete_order(order: Order, user=None) -> Order:
    if order.status not in (OrderStatus.CONFIRMED, OrderStatus.PARTIAL):
        raise OrderError('فقط سفارش تأییدشده یا با تحویل جزئی قابل تکمیل است.')
    order.status = OrderStatus.COMPLETED
    order.save(update_fields=['status', 'modified_at'])
    return order


@transaction.atomic
def cancel_order(order: Order, user=None, reason: str = '') -> Order:
    """لغو سفارش و برگرداندن همه‌ی اثرات آن."""
    if order.status == OrderStatus.CANCELLED:
        raise OrderError('سفارش از قبل لغو شده است.')
    if order.cheques.exists():
        raise OrderError('برای این سفارش چک ثبت شده است؛ ابتدا چک‌ها را اصلاح کنید.')

    revert_movements(source_type=SOURCE_ORDER, source_id=order.id, user=user)
    delete_system_entries(source_type=SourceType.ORDER, source_id=order.id)
    SalesHistory.objects.filter(source_order=order).delete()

    order.status = OrderStatus.CANCELLED
    if reason:
        order.description = (order.description + '\n' if order.description else '') + f'لغو: {reason}'
    order.save(update_fields=['status', 'description', 'modified_at'])
    return order


@transaction.atomic
def register_payment(order: Order, amount: Decimal, user=None) -> Order:
    """ثبت پرداخت روی سفارش."""
    amount = Decimal(amount)
    if amount <= 0:
        raise OrderError('مبلغ پرداخت باید بزرگ‌تر از صفر باشد.')
    if order.status in (OrderStatus.DRAFT, OrderStatus.CANCELLED):
        raise OrderError('برای سفارش پیش‌نویس یا لغو‌شده امکان ثبت پرداخت وجود ندارد.')

    new_paid = Decimal(order.paid_amount) + amount
    if new_paid > Decimal(order.total_amount):
        raise OrderError(
            f'مبلغ پرداخت از باقی‌مانده سفارش بیشتر است. باقی‌مانده: {order.remaining_amount:,}'
        )

    order.paid_amount = new_paid
    order.save(update_fields=['paid_amount', 'modified_at'])
    order.recalculate()
    sync_order_ledger(order, user=user)
    return order


@transaction.atomic
def create_order_from_suggestion(suggestion, *, party=None, order_date=None, user=None) -> Order:
    """ساخت سفارش خرید از یک پیشنهاد هوشمند."""
    from .models import OrderItem, PurchaseSuggestion

    if suggestion.status == PurchaseSuggestion.Status.ORDERED:
        raise OrderError('برای این پیشنهاد قبلاً سفارش ثبت شده است.')

    supplier = party or suggestion.suggested_supplier or suggestion.product.default_supplier
    if supplier is None:
        raise OrderError('تأمین‌کننده مشخص نیست؛ لطفاً تأمین‌کننده را انتخاب کنید.')

    order = Order.objects.create(
        order_type=OrderType.PURCHASE,
        party=supplier,
        order_date=order_date or suggestion.suggested_date or date.today(),
        due_date=suggestion.suggested_date,
        status=OrderStatus.DRAFT,
        description=f'ایجاد‌شده از پیشنهاد هوشمند #{suggestion.id}: {suggestion.reason[:400]}',
        created_by=user,
        source_suggestion=suggestion,
    )
    OrderItem.objects.create(
        order=order,
        product=suggestion.product,
        quantity=suggestion.suggested_quantity,
        unit_price=suggestion.product.purchase_price,
        unit_cost=suggestion.product.purchase_price,
    )
    order.recalculate()

    suggestion.status = PurchaseSuggestion.Status.ORDERED
    suggestion.reviewed_by = user
    suggestion.save(update_fields=['status', 'reviewed_by', 'modified_at'])

    return order
