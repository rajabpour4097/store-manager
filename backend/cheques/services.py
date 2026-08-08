"""منطق کسب‌وکار چک‌ها: انتقال وضعیت و اثر آن روی دفتر طرف حساب."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from ledger.models import EntryCategory, SourceType
from ledger.services import delete_system_entries, sync_system_entry

from .models import Cheque, ChequeDirection, ChequeStatus, ChequeStatusHistory

# انتقال‌های مجاز وضعیت چک
ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    ChequeStatus.IN_PORTFOLIO: [
        ChequeStatus.SUBMITTED,
        ChequeStatus.CLEARED,
        ChequeStatus.BOUNCED,
        ChequeStatus.TRANSFERRED,
        ChequeStatus.RETURNED,
        ChequeStatus.EXTENDED,
        ChequeStatus.CANCELLED,
    ],
    ChequeStatus.SUBMITTED: [
        ChequeStatus.CLEARED,
        ChequeStatus.BOUNCED,
        ChequeStatus.IN_PORTFOLIO,
        ChequeStatus.EXTENDED,
        ChequeStatus.CANCELLED,
    ],
    ChequeStatus.EXTENDED: [
        ChequeStatus.SUBMITTED,
        ChequeStatus.CLEARED,
        ChequeStatus.BOUNCED,
        ChequeStatus.RETURNED,
        ChequeStatus.TRANSFERRED,
        ChequeStatus.CANCELLED,
    ],
    ChequeStatus.BOUNCED: [
        ChequeStatus.IN_PORTFOLIO,
        ChequeStatus.CLEARED,
        ChequeStatus.RETURNED,
        ChequeStatus.EXTENDED,
        ChequeStatus.CANCELLED,
    ],
    ChequeStatus.CLEARED: [],
    ChequeStatus.RETURNED: [],
    ChequeStatus.TRANSFERRED: [],
    ChequeStatus.CANCELLED: [],
}


class ChequeTransitionError(Exception):
    """خطای انتقال غیرمجاز وضعیت چک."""


def allowed_next_statuses(cheque: Cheque) -> list[dict]:
    labels = dict(ChequeStatus.choices)
    return [
        {'value': status, 'label': labels[status]}
        for status in ALLOWED_TRANSITIONS.get(cheque.status, [])
    ]


ISSUE_MARKER = 'CHQ-ISSUE'
SETTLE_MARKER = 'CHQ-SETTLE'


def _party_non_cheque_balance(party) -> Decimal:
    """مانده طرف حساب بدون اسناد چک (فقط فاکتور، پرداخت نقدی و …)."""
    totals = party.ledger_entries.exclude(
        source_type=SourceType.CHEQUE,
    ).aggregate(debit=Sum('debit'), credit=Sum('credit'))
    debit = totals['debit'] or Decimal('0')
    credit = totals['credit'] or Decimal('0')
    return Decimal(party.opening_balance) + debit - credit


def _cheque_issue_amounts(cheque: Cheque) -> tuple[Decimal, Decimal]:
    """بدهکار/بستانکار سند صدور چک را برمی‌گرداند."""
    if cheque.direction == ChequeDirection.RECEIVABLE:
        return Decimal('0'), cheque.amount

    # چک پرداختی: اگر بدهی واقعی (فاکتور خرید و …) داریم، چک تسویه است (بدهکار).
    # در غیر این صورت — از جمله چند چک پرداختی پشت‌سرهم — تعهد جدید ثبت می‌شود (بستانکار).
    if _party_non_cheque_balance(cheque.party) < 0:
        return cheque.amount, Decimal('0')
    return Decimal('0'), cheque.amount


def sync_cheque_ledger(cheque: Cheque, user=None) -> None:
    """اسناد دفتر معین متناظر با یک چک را همگام می‌کند.

    چک دریافتی: هنگام دریافت، بدهی مشتری کم می‌شود (بستانکار).
    چک پرداختی: اگر بدهی قبلی داریم تسویه می‌شود (بدهکار)، وگرنه بدهی جدید ثبت می‌شود (بستانکار).
    چک برگشتی: اثر اولیه با یک سند معکوس خنثی می‌شود.
    """
    if not cheque.create_ledger_entry:
        delete_system_entries(source_type=SourceType.CHEQUE, source_id=cheque.id)
        return

    if cheque.status == ChequeStatus.CANCELLED:
        delete_system_entries(source_type=SourceType.CHEQUE, source_id=cheque.id)
        return

    is_receivable = cheque.direction == ChequeDirection.RECEIVABLE
    issue_debit, issue_credit = _cheque_issue_amounts(cheque)

    # سند اصلی: ثبت دریافت/صدور چک
    sync_system_entry(
        party=cheque.party,
        date=cheque.issue_date,
        debit=issue_debit,
        credit=issue_credit,
        category=EntryCategory.CHEQUE_RECEIVED if is_receivable else EntryCategory.CHEQUE_ISSUED,
        source_type=SourceType.CHEQUE,
        source_id=cheque.id,
        marker=ISSUE_MARKER,
        description=(
            f'{cheque.get_direction_display()} چک {cheque.serial_number} '
            f'{cheque.bank_display} سرسید {cheque.due_date}'
        ),
        created_by=user or cheque.created_by,
    )

    # سند خنثی‌کننده در صورت برگشت یا عودت چک
    reversing_statuses = (ChequeStatus.BOUNCED, ChequeStatus.RETURNED)
    if cheque.status in reversing_statuses:
        label = 'برگشت' if cheque.status == ChequeStatus.BOUNCED else 'عودت'
        sync_system_entry(
            party=cheque.party,
            date=cheque.settled_date or cheque.due_date,
            debit=issue_credit,
            credit=issue_debit,
            category=EntryCategory.CHEQUE_BOUNCED,
            source_type=SourceType.CHEQUE,
            source_id=cheque.id,
            marker=SETTLE_MARKER,
            description=f'{label} چک {cheque.serial_number}',
            created_by=user or cheque.created_by,
        )
    else:
        delete_system_entries(
            source_type=SourceType.CHEQUE,
            source_id=cheque.id,
            category=EntryCategory.CHEQUE_BOUNCED,
        )


@transaction.atomic
def change_status(cheque: Cheque, new_status: str, *, user=None, event_date=None, note: str = '') -> Cheque:
    """تغییر وضعیت چک همراه با اعتبارسنجی، تاریخچه و همگام‌سازی دفتر."""
    labels = dict(ChequeStatus.choices)

    if new_status not in labels:
        raise ChequeTransitionError('وضعیت انتخاب‌شده معتبر نیست.')

    if new_status == cheque.status:
        raise ChequeTransitionError('چک از قبل در همین وضعیت است.')

    allowed = ALLOWED_TRANSITIONS.get(cheque.status, [])
    if new_status not in allowed:
        allowed_labels = '، '.join(labels[item] for item in allowed) or 'هیچ وضعیتی'
        raise ChequeTransitionError(
            f'تغییر وضعیت از «{labels[cheque.status]}» به «{labels[new_status]}» مجاز نیست. '
            f'وضعیت‌های مجاز: {allowed_labels}.'
        )

    previous = cheque.status
    cheque.status = new_status

    from .models import FINAL_STATUSES

    if new_status in FINAL_STATUSES or new_status == ChequeStatus.BOUNCED:
        cheque.settled_date = event_date or date.today()
    else:
        cheque.settled_date = None

    cheque.save(update_fields=['status', 'settled_date', 'modified_at'])

    ChequeStatusHistory.objects.create(
        cheque=cheque,
        from_status=previous,
        to_status=new_status,
        changed_at_date=event_date or date.today(),
        note=note,
        changed_by=user,
    )

    sync_cheque_ledger(cheque, user=user)
    return cheque


@transaction.atomic
def extend_cheque(cheque: Cheque, new_due_date, *, user=None, note: str = '') -> Cheque:
    """تمدید سرسید چک."""
    if not cheque.is_open and cheque.status != ChequeStatus.BOUNCED:
        raise ChequeTransitionError('فقط چک‌های باز یا برگشتی را می‌توان تمدید کرد.')
    if new_due_date <= cheque.due_date:
        raise ChequeTransitionError('تاریخ سرسید جدید باید بعد از سرسید فعلی باشد.')

    previous_status = cheque.status
    previous_due = cheque.due_date
    cheque.due_date = new_due_date
    cheque.status = ChequeStatus.EXTENDED
    cheque.settled_date = None
    cheque.save(update_fields=['due_date', 'status', 'settled_date', 'modified_at'])

    ChequeStatusHistory.objects.create(
        cheque=cheque,
        from_status=previous_status,
        to_status=ChequeStatus.EXTENDED,
        changed_at_date=date.today(),
        note=note or f'تمدید سرسید از {previous_due} به {new_due_date}',
        changed_by=user,
    )

    sync_cheque_ledger(cheque, user=user)
    return cheque
