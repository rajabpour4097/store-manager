"""محاسبات گزارش‌ها.

همه‌ی توابع تاریخ میلادی می‌گیرند و در خروجی معادل شمسی را هم برمی‌گردانند.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce

from catalog.models import Product
from cheques.models import OPEN_STATUSES, Cheque, ChequeDirection, ChequeStatus
from core.jalali import jalali_month_label, to_jalali
from ledger.models import FinanceCategory, FinanceRecord, LedgerEntry
from orders.models import Order, OrderItem, OrderStatus, OrderType, SalesHistory
from parties.models import Party

ZERO_MONEY = Value(Decimal('0'), output_field=DecimalField(max_digits=18, decimal_places=0))


def _money(value) -> Decimal:
    return Decimal(value or 0)


def _active_orders(order_type: str, date_from: date, date_to: date):
    return Order.objects.filter(
        order_type=order_type,
        order_date__gte=date_from,
        order_date__lte=date_to,
    ).exclude(status__in=[OrderStatus.DRAFT, OrderStatus.CANCELLED])


# ---------------------------------------------------------------------------
# سود و زیان
# ---------------------------------------------------------------------------
def profit_and_loss(date_from: date, date_to: date) -> dict:
    """صورت سود و زیان بازه‌ی انتخابی."""
    sales = _active_orders(OrderType.SALE, date_from, date_to)
    purchases = _active_orders(OrderType.PURCHASE, date_from, date_to)

    sales_totals = sales.aggregate(
        gross=Coalesce(Sum('subtotal'), ZERO_MONEY),
        discount=Coalesce(Sum('discount_amount'), ZERO_MONEY),
        tax=Coalesce(Sum('tax_amount'), ZERO_MONEY),
        shipping=Coalesce(Sum('shipping_amount'), ZERO_MONEY),
        total=Coalesce(Sum('total_amount'), ZERO_MONEY),
        cost=Coalesce(Sum('cost_amount'), ZERO_MONEY),
        count=Count('id'),
    )

    purchase_totals = purchases.aggregate(
        total=Coalesce(Sum('total_amount'), ZERO_MONEY),
        count=Count('id'),
    )

    finance = FinanceRecord.objects.filter(date__gte=date_from, date__lte=date_to)
    expenses = finance.filter(kind=FinanceCategory.Kind.EXPENSE)
    incomes = finance.filter(kind=FinanceCategory.Kind.INCOME)

    total_expense = _money(expenses.aggregate(t=Sum('amount'))['t'])
    total_other_income = _money(incomes.aggregate(t=Sum('amount'))['t'])

    # چک‌های برگشتی به‌عنوان ریسک/زیان احتمالی گزارش می‌شوند
    bounced = Cheque.objects.filter(
        status=ChequeStatus.BOUNCED,
        direction=ChequeDirection.RECEIVABLE,
        due_date__gte=date_from,
        due_date__lte=date_to,
    ).aggregate(t=Sum('amount'), c=Count('id'))

    net_sales = _money(sales_totals['gross']) - _money(sales_totals['discount'])
    cogs = _money(sales_totals['cost'])
    gross_profit = net_sales - cogs
    operating_profit = gross_profit - total_expense
    net_profit = operating_profit + total_other_income

    gross_margin = (gross_profit / net_sales * 100) if net_sales else Decimal('0')
    net_margin = (net_profit / net_sales * 100) if net_sales else Decimal('0')

    expense_breakdown = [{
        'category': row['category__name'],
        'amount': row['total'],
        'count': row['count'],
        'share_percent': float(round(row['total'] / total_expense * 100, 2)) if total_expense else 0,
    } for row in expenses.values('category__name').annotate(
        total=Sum('amount'), count=Count('id')).order_by('-total')]

    income_breakdown = [{
        'category': row['category__name'],
        'amount': row['total'],
        'count': row['count'],
    } for row in incomes.values('category__name').annotate(
        total=Sum('amount'), count=Count('id')).order_by('-total')]

    return {
        'date_from': date_from,
        'date_to': date_to,
        'date_from_jalali': to_jalali(date_from),
        'date_to_jalali': to_jalali(date_to),
        'days': (date_to - date_from).days + 1,
        'revenue': {
            'gross_sales': _money(sales_totals['gross']),
            'discounts': _money(sales_totals['discount']),
            'net_sales': net_sales,
            'tax_collected': _money(sales_totals['tax']),
            'shipping': _money(sales_totals['shipping']),
            'invoices_total': _money(sales_totals['total']),
            'sale_orders_count': sales_totals['count'],
        },
        'cost_of_goods_sold': cogs,
        'gross_profit': gross_profit,
        'gross_margin_percent': round(gross_margin, 2),
        'operating_expenses': total_expense,
        'operating_profit': operating_profit,
        'other_income': total_other_income,
        'net_profit': net_profit,
        'net_margin_percent': round(net_margin, 2),
        'purchases': {
            'total': _money(purchase_totals['total']),
            'count': purchase_totals['count'],
        },
        'bounced_cheques': {
            'amount': _money(bounced['t']),
            'count': bounced['c'] or 0,
        },
        'expense_breakdown': expense_breakdown,
        'income_breakdown': income_breakdown,
    }


def profit_and_loss_monthly(date_from: date, date_to: date) -> list[dict]:
    """روند ماهانه‌ی سود و زیان بر پایه‌ی ماه شمسی."""
    sales = _active_orders(OrderType.SALE, date_from, date_to).values(
        'order_date', 'subtotal', 'discount_amount', 'cost_amount')
    finance = FinanceRecord.objects.filter(
        date__gte=date_from, date__lte=date_to).values('date', 'kind', 'amount')

    buckets: OrderedDict[str, dict] = OrderedDict()

    def bucket(label: str) -> dict:
        return buckets.setdefault(label, {
            'month': label,
            'net_sales': Decimal('0'),
            'cogs': Decimal('0'),
            'expenses': Decimal('0'),
            'other_income': Decimal('0'),
        })

    for row in sales:
        item = bucket(jalali_month_label(row['order_date']))
        item['net_sales'] += _money(row['subtotal']) - _money(row['discount_amount'])
        item['cogs'] += _money(row['cost_amount'])

    for row in finance:
        item = bucket(jalali_month_label(row['date']))
        if row['kind'] == FinanceCategory.Kind.EXPENSE:
            item['expenses'] += _money(row['amount'])
        else:
            item['other_income'] += _money(row['amount'])

    result = []
    for label in sorted(buckets):
        item = buckets[label]
        gross = item['net_sales'] - item['cogs']
        result.append({
            **item,
            'gross_profit': gross,
            'net_profit': gross - item['expenses'] + item['other_income'],
        })
    return result


# ---------------------------------------------------------------------------
# فروش
# ---------------------------------------------------------------------------
def sales_report(date_from: date, date_to: date, *, group_by: str = 'month') -> dict:
    orders = _active_orders(OrderType.SALE, date_from, date_to)
    totals = orders.aggregate(
        total=Coalesce(Sum('total_amount'), ZERO_MONEY),
        cost=Coalesce(Sum('cost_amount'), ZERO_MONEY),
        paid=Coalesce(Sum('paid_amount'), ZERO_MONEY),
        count=Count('id'),
    )

    items = OrderItem.objects.filter(order__in=orders).select_related('product')
    by_product: dict[int, dict] = {}
    for item in items:
        entry = by_product.setdefault(item.product_id, {
            'product_id': item.product_id,
            'product_name': item.product.name,
            'unit_display': item.product.get_unit_display(),
            'quantity': Decimal('0'),
            'revenue': Decimal('0'),
            'cost': Decimal('0'),
        })
        entry['quantity'] += Decimal(item.quantity)
        entry['revenue'] += item.total_price
        entry['cost'] += item.total_cost

    products = sorted(by_product.values(), key=lambda row: row['revenue'], reverse=True)
    for row in products:
        row['profit'] = row['revenue'] - row['cost']

    by_party = list(
        orders.values('party', 'party__name')
        .annotate(total=Sum('total_amount'), count=Count('id'))
        .order_by('-total')[:20]
    )

    timeline: OrderedDict[str, dict] = OrderedDict()
    for order in orders.values('order_date', 'total_amount', 'cost_amount'):
        if group_by == 'day':
            label = to_jalali(order['order_date'])
        else:
            label = jalali_month_label(order['order_date'])
        item = timeline.setdefault(label, {
            'label': label, 'total': Decimal('0'), 'cost': Decimal('0'), 'count': 0})
        item['total'] += _money(order['total_amount'])
        item['cost'] += _money(order['cost_amount'])
        item['count'] += 1
    for item in timeline.values():
        item['profit'] = item['total'] - item['cost']

    return {
        'date_from_jalali': to_jalali(date_from),
        'date_to_jalali': to_jalali(date_to),
        'totals': {
            'total_amount': _money(totals['total']),
            'cost_amount': _money(totals['cost']),
            'paid_amount': _money(totals['paid']),
            'remaining_amount': _money(totals['total']) - _money(totals['paid']),
            'profit': _money(totals['total']) - _money(totals['cost']),
            'orders_count': totals['count'],
            'average_order': (_money(totals['total']) / totals['count']).quantize(Decimal('1'))
            if totals['count'] else Decimal('0'),
        },
        'by_product': products[:50],
        'by_party': by_party,
        'timeline': sorted(timeline.values(), key=lambda row: row['label']),
    }


def purchase_report(date_from: date, date_to: date) -> dict:
    orders = _active_orders(OrderType.PURCHASE, date_from, date_to)
    totals = orders.aggregate(
        total=Coalesce(Sum('total_amount'), ZERO_MONEY),
        paid=Coalesce(Sum('paid_amount'), ZERO_MONEY),
        count=Count('id'),
    )
    by_supplier = list(
        orders.values('party', 'party__name')
        .annotate(total=Sum('total_amount'), count=Count('id'))
        .order_by('-total')[:20]
    )
    items = OrderItem.objects.filter(order__in=orders).select_related('product')
    by_product: dict[int, dict] = {}
    for item in items:
        entry = by_product.setdefault(item.product_id, {
            'product_id': item.product_id,
            'product_name': item.product.name,
            'quantity': Decimal('0'),
            'amount': Decimal('0'),
        })
        entry['quantity'] += Decimal(item.quantity)
        entry['amount'] += item.total_price

    return {
        'date_from_jalali': to_jalali(date_from),
        'date_to_jalali': to_jalali(date_to),
        'totals': {
            'total_amount': _money(totals['total']),
            'paid_amount': _money(totals['paid']),
            'remaining_amount': _money(totals['total']) - _money(totals['paid']),
            'orders_count': totals['count'],
        },
        'by_supplier': by_supplier,
        'by_product': sorted(by_product.values(), key=lambda row: row['amount'], reverse=True)[:50],
    }


# ---------------------------------------------------------------------------
# بدهکار و بستانکار
# ---------------------------------------------------------------------------
def receivables_payables(as_of: date | None = None) -> dict:
    parties = Party.objects.filter(is_active=True).annotate(
        sum_debit=Coalesce(Sum('ledger_entries__debit'), ZERO_MONEY),
        sum_credit=Coalesce(Sum('ledger_entries__credit'), ZERO_MONEY),
    ).annotate(net_balance=F('opening_balance') + F('sum_debit') - F('sum_credit'))

    debtors = [{
        'id': party.id,
        'name': party.name,
        'code': party.code,
        'party_type_display': party.get_party_type_display(),
        'mobile': party.mobile,
        'balance': party.net_balance,
        'credit_limit': party.credit_limit,
        'over_limit': bool(party.credit_limit and party.net_balance > party.credit_limit),
    } for party in parties.filter(net_balance__gt=0).order_by('-net_balance')]

    creditors = [{
        'id': party.id,
        'name': party.name,
        'code': party.code,
        'party_type_display': party.get_party_type_display(),
        'mobile': party.mobile,
        'balance': -party.net_balance,
    } for party in parties.filter(net_balance__lt=0).order_by('net_balance')]

    total_receivable = sum((row['balance'] for row in debtors), Decimal('0'))
    total_payable = sum((row['balance'] for row in creditors), Decimal('0'))

    return {
        'as_of': as_of or date.today(),
        'as_of_jalali': to_jalali(as_of or date.today()),
        'total_receivable': total_receivable,
        'total_payable': total_payable,
        'net_position': total_receivable - total_payable,
        'debtor_count': len(debtors),
        'creditor_count': len(creditors),
        'debtors': debtors,
        'creditors': creditors,
    }


# ---------------------------------------------------------------------------
# چک‌ها
# ---------------------------------------------------------------------------
def cheque_report(date_from: date, date_to: date) -> dict:
    queryset = Cheque.objects.filter(due_date__gte=date_from, due_date__lte=date_to)

    def side(direction):
        side_qs = queryset.filter(direction=direction)
        by_status = list(
            side_qs.values('status').annotate(count=Count('id'), total=Sum('amount')).order_by()
        )
        labels = dict(ChequeStatus.choices)
        for row in by_status:
            row['status_display'] = labels.get(row['status'], row['status'])
        return {
            'count': side_qs.count(),
            'total': _money(side_qs.aggregate(t=Sum('amount'))['t']),
            'open_total': _money(side_qs.filter(status__in=OPEN_STATUSES).aggregate(
                t=Sum('amount'))['t']),
            'cleared_total': _money(side_qs.filter(status=ChequeStatus.CLEARED).aggregate(
                t=Sum('amount'))['t']),
            'bounced_total': _money(side_qs.filter(status=ChequeStatus.BOUNCED).aggregate(
                t=Sum('amount'))['t']),
            'by_status': by_status,
        }

    timeline: OrderedDict[str, dict] = OrderedDict()
    for cheque in queryset.values('due_date', 'direction', 'amount'):
        label = jalali_month_label(cheque['due_date'])
        item = timeline.setdefault(label, {
            'label': label, 'payable': Decimal('0'), 'receivable': Decimal('0')})
        if cheque['direction'] == ChequeDirection.PAYABLE:
            item['payable'] += _money(cheque['amount'])
        else:
            item['receivable'] += _money(cheque['amount'])
    for item in timeline.values():
        item['net'] = item['receivable'] - item['payable']

    return {
        'date_from_jalali': to_jalali(date_from),
        'date_to_jalali': to_jalali(date_to),
        'payable': side(ChequeDirection.PAYABLE),
        'receivable': side(ChequeDirection.RECEIVABLE),
        'timeline': sorted(timeline.values(), key=lambda row: row['label']),
    }


# ---------------------------------------------------------------------------
# انبار
# ---------------------------------------------------------------------------
def inventory_report() -> dict:
    products = Product.objects.filter(is_active=True).select_related('category')
    rows = [{
        'id': product.id,
        'sku': product.sku,
        'name': product.name,
        'category': product.category.name if product.category else '',
        'unit_display': product.get_unit_display(),
        'stock_quantity': product.stock_quantity,
        'reorder_point': product.reorder_point,
        'purchase_price': product.purchase_price,
        'sale_price': product.sale_price,
        'stock_value': product.stock_value,
        'retail_value': (Decimal(product.stock_quantity) * Decimal(product.sale_price)).quantize(Decimal('1')),
        'stock_state': product.stock_state,
        'stock_state_display': product.stock_state_display,
    } for product in products]

    total_value = sum((row['stock_value'] for row in rows), Decimal('0'))
    total_retail = sum((row['retail_value'] for row in rows), Decimal('0'))

    by_category: dict[str, dict] = {}
    for row in rows:
        key = row['category'] or 'بدون دسته‌بندی'
        entry = by_category.setdefault(key, {'category': key, 'value': Decimal('0'), 'count': 0})
        entry['value'] += row['stock_value']
        entry['count'] += 1

    return {
        'total_products': len(rows),
        'total_stock_value': total_value,
        'total_retail_value': total_retail,
        'potential_profit': total_retail - total_value,
        'out_of_stock': [row for row in rows if row['stock_state'] == 'out_of_stock'],
        'low_stock': [row for row in rows if row['stock_state'] == 'low'],
        'by_category': sorted(by_category.values(), key=lambda row: row['value'], reverse=True),
        'items': sorted(rows, key=lambda row: row['stock_value'], reverse=True),
    }


# ---------------------------------------------------------------------------
# داشبورد
# ---------------------------------------------------------------------------
def dashboard(date_from: date | None = None, date_to: date | None = None) -> dict:
    today = date.today()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=29))

    pnl = profit_and_loss(date_from, date_to)
    rp = receivables_payables(today)

    open_cheques = Cheque.objects.filter(status__in=OPEN_STATUSES)
    payable_open = open_cheques.filter(direction=ChequeDirection.PAYABLE)
    receivable_open = open_cheques.filter(direction=ChequeDirection.RECEIVABLE)

    sale_orders = _active_orders(OrderType.SALE, date_from, date_to)

    daily: OrderedDict[str, dict] = OrderedDict()
    cursor = date_from
    while cursor <= date_to:
        daily[cursor.isoformat()] = {
            'date': cursor.isoformat(),
            'label': to_jalali(cursor),
            'sales': Decimal('0'),
            'profit': Decimal('0'),
            'count': 0,
        }
        cursor += timedelta(days=1)

    for row in sale_orders.values('order_date', 'total_amount', 'cost_amount', 'tax_amount'):
        key = row['order_date'].isoformat()
        if key in daily:
            daily[key]['sales'] += _money(row['total_amount'])
            daily[key]['profit'] += (_money(row['total_amount']) - _money(row['tax_amount'])
                                     - _money(row['cost_amount']))
            daily[key]['count'] += 1

    top_products = sales_report(date_from, date_to)['by_product'][:8]

    low_stock_count = Product.objects.filter(
        is_active=True).filter(Q(stock_quantity__lte=F('reorder_point')) | Q(stock_quantity__lte=0)).count()

    from orders.models import PurchaseSuggestion

    return {
        'date_from': date_from,
        'date_to': date_to,
        'date_from_jalali': to_jalali(date_from),
        'date_to_jalali': to_jalali(date_to),
        'kpis': {
            'net_sales': pnl['revenue']['net_sales'],
            'gross_profit': pnl['gross_profit'],
            'net_profit': pnl['net_profit'],
            'net_margin_percent': pnl['net_margin_percent'],
            'operating_expenses': pnl['operating_expenses'],
            'sale_orders_count': pnl['revenue']['sale_orders_count'],
            'purchases_total': pnl['purchases']['total'],
            'total_receivable': rp['total_receivable'],
            'total_payable': rp['total_payable'],
            'net_position': rp['net_position'],
        },
        'cheques': {
            'payable_open_count': payable_open.count(),
            'payable_open_amount': _money(payable_open.aggregate(t=Sum('amount'))['t']),
            'receivable_open_count': receivable_open.count(),
            'receivable_open_amount': _money(receivable_open.aggregate(t=Sum('amount'))['t']),
            'overdue_count': open_cheques.filter(due_date__lt=today).count(),
            'due_7_days_count': open_cheques.filter(
                due_date__gte=today, due_date__lte=today + timedelta(days=7)).count(),
            'bounced_count': Cheque.objects.filter(status=ChequeStatus.BOUNCED).count(),
        },
        'inventory': {
            'low_stock_count': low_stock_count,
            'total_products': Product.objects.filter(is_active=True).count(),
        },
        'suggestions': {
            'pending_count': PurchaseSuggestion.objects.filter(
                status=PurchaseSuggestion.Status.PENDING).count(),
            'critical_count': PurchaseSuggestion.objects.filter(
                status=PurchaseSuggestion.Status.PENDING,
                priority=PurchaseSuggestion.Priority.CRITICAL).count(),
        },
        'daily_series': list(daily.values()),
        'top_products': top_products,
        'top_debtors': rp['debtors'][:5],
        'top_creditors': rp['creditors'][:5],
        'monthly_trend': profit_and_loss_monthly(
            date_to - timedelta(days=365), date_to),
    }
