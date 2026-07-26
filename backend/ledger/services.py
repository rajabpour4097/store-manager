"""سرویس‌های دفتر معین: ساخت و همگام‌سازی اسناد سیستمی."""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum

from .models import EntryCategory, LedgerEntry, SourceType


def sync_system_entry(
    *,
    party,
    date,
    debit: Decimal | int = 0,
    credit: Decimal | int = 0,
    category: str = EntryCategory.OTHER,
    source_type: str = SourceType.MANUAL,
    source_id: int | None = None,
    document_number: str = '',
    description: str = '',
    created_by=None,
    marker: str = '',
) -> LedgerEntry | None:
    """یک سند سیستمی را می‌سازد یا به‌روزرسانی می‌کند.

    اسناد سیستمی با ترکیب (source_type, source_id, category, marker) یکتا می‌شوند
    تا در صورت ویرایش سفارش یا چک، سند تکراری ساخته نشود.
    """
    debit = Decimal(debit or 0)
    credit = Decimal(credit or 0)

    lookup = {
        'source_type': source_type,
        'source_id': source_id,
        'category': category,
        'is_system_generated': True,
    }
    if marker:
        lookup['document_number'] = marker

    existing = LedgerEntry.objects.filter(**lookup).first()

    if debit == 0 and credit == 0:
        if existing:
            existing.delete()
        return None

    defaults = {
        'party': party,
        'date': date,
        'debit': debit,
        'credit': credit,
        'description': description,
        'created_by': created_by,
        'document_number': marker or document_number,
    }

    if existing:
        for key, value in defaults.items():
            setattr(existing, key, value)
        existing.save()
        return existing

    return LedgerEntry.objects.create(
        source_type=source_type,
        source_id=source_id,
        category=category,
        is_system_generated=True,
        **defaults,
    )


def delete_system_entries(*, source_type: str, source_id: int, category: str | None = None) -> int:
    queryset = LedgerEntry.objects.filter(
        source_type=source_type, source_id=source_id, is_system_generated=True
    )
    if category:
        queryset = queryset.filter(category=category)
    deleted, _ = queryset.delete()
    return deleted


def party_totals(party, *, date_from=None, date_to=None) -> dict:
    """مجموع بدهکار/بستانکار و مانده یک طرف حساب در بازه‌ی داده‌شده."""
    entries = party.ledger_entries.all()
    if date_from:
        entries = entries.filter(date__gte=date_from)
    if date_to:
        entries = entries.filter(date__lte=date_to)
    totals = entries.aggregate(debit=Sum('debit'), credit=Sum('credit'))
    debit = totals['debit'] or Decimal('0')
    credit = totals['credit'] or Decimal('0')

    opening = Decimal(party.opening_balance)
    if date_from:
        prior = party.ledger_entries.filter(date__lt=date_from).aggregate(
            debit=Sum('debit'), credit=Sum('credit')
        )
        opening += (prior['debit'] or Decimal('0')) - (prior['credit'] or Decimal('0'))

    return {
        'opening_balance': opening,
        'total_debit': debit,
        'total_credit': credit,
        'closing_balance': opening + debit - credit,
    }


def build_statement(party, *, date_from=None, date_to=None) -> dict:
    """صورتحساب (کاردکس) طرف حساب با مانده‌ی تجمعی."""
    totals = party_totals(party, date_from=date_from, date_to=date_to)

    entries = party.ledger_entries.select_related('bank_account', 'created_by')
    if date_from:
        entries = entries.filter(date__gte=date_from)
    if date_to:
        entries = entries.filter(date__lte=date_to)
    entries = entries.order_by('date', 'id')

    running = totals['opening_balance']
    rows = []
    for entry in entries:
        running += entry.debit - entry.credit
        rows.append({'entry': entry, 'running_balance': running})

    return {'totals': totals, 'rows': rows}
