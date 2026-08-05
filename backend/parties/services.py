"""عملیات حذف طرف حساب همراه با داده‌های وابسته."""

from __future__ import annotations

from django.db import transaction

from catalog.services import revert_movements
from cheques.models import Cheque
from ledger.models import SourceType
from ledger.services import delete_system_entries
from orders.models import Order, OrderStatus, SalesHistory
from orders.services import OrderError, SOURCE_ORDER, cancel_order

from .models import Party


class PartyDeleteError(Exception):
    """خطای حذف طرف حساب."""


def _delete_cheque(cheque: Cheque) -> None:
    delete_system_entries(source_type=SourceType.CHEQUE, source_id=cheque.id)
    cheque.delete()


def _delete_order(order: Order, user=None) -> None:
    if order.status != OrderStatus.CANCELLED:
        try:
            cancel_order(order, user=user, reason='حذف طرف حساب')
        except OrderError:
            revert_movements(source_type=SOURCE_ORDER, source_id=order.id, user=user)
            delete_system_entries(source_type=SourceType.ORDER, source_id=order.id)
            SalesHistory.objects.filter(source_order=order).delete()
            order.status = OrderStatus.CANCELLED
            order.save(update_fields=['status', 'modified_at'])

    delete_system_entries(source_type=SourceType.ORDER, source_id=order.id)
    revert_movements(source_type=SOURCE_ORDER, source_id=order.id, user=user)
    SalesHistory.objects.filter(source_order=order).delete()
    order.delete()


@transaction.atomic
def delete_party_cascade(party: Party, user=None) -> dict:
    """حذف طرف حساب به همراه چک‌ها، سفارش‌ها و اسناد دفتر مرتبط."""
    cheques = list(party.cheques.all())
    orders = list(party.orders.all())
    ledger_count = party.ledger_entries.count()

    for cheque in cheques:
        _delete_cheque(cheque)

    for order in orders:
        _delete_order(order, user=user)

    name = party.name
    party_id = party.id
    party.delete()

    return {
        'deleted_cheques': len(cheques),
        'deleted_orders': len(orders),
        'deleted_ledger_entries': ledger_count,
        'party_name': name,
        'party_id': party_id,
    }
