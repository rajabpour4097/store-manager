"""موتور پیشنهاد هوشمند سفارش خرید.

تحلیل بر پایه‌ی سوابق فروش (فایل CSV بارگذاری‌شده + سفارش‌های فروش تأییدشده) انجام
می‌شود و برای هر کالا محاسبه می‌کند:

* میانگین فروش روزانه و پراکندگی آن
* روند رشد یا افت فروش (مقایسه‌ی دو نیمه‌ی بازه)
* الگوی روزهای هفته (پرفروش‌ترین روز)
* ضریب فصلی (نسبت نرخ فروش اخیر به نرخ کل بازه)
* تاریخ تخمینی اتمام موجودی و در نتیجه بهترین تاریخ ثبت سفارش
* مقدار پیشنهادی سفارش با احتساب ذخیره‌ی اطمینان
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction

from catalog.models import Product
from core.jalali import WEEKDAY_NAMES, jalali_weekday, to_jalali

from .models import PurchaseSuggestion, SalesHistory

# ضریب ذخیره‌ی اطمینان برای سطح سرویس ~۹۵ درصد
SERVICE_LEVEL_Z = Decimal('1.65')

DEFAULT_LOOKBACK_DAYS = 180


def _q(value: Decimal | float | int, places: str = '0.001') -> Decimal:
    return Decimal(str(value)).quantize(Decimal(places))


def analyze_product(
    product: Product,
    *,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    reference_date: date | None = None,
) -> dict | None:
    """تحلیل آماری فروش یک کالا. اگر داده‌ای نباشد None برمی‌گردد."""
    today = reference_date or date.today()
    window_start = today - timedelta(days=lookback_days)

    records = list(
        SalesHistory.objects
        .filter(product=product, sale_date__gte=window_start, sale_date__lte=today)
        .values_list('sale_date', 'quantity', 'unit_price', 'unit_cost')
    )
    if not records:
        return None

    daily: dict[date, Decimal] = defaultdict(lambda: Decimal('0'))
    weekday_totals: dict[int, Decimal] = defaultdict(lambda: Decimal('0'))
    weekday_counts: dict[int, int] = defaultdict(int)
    prices: list[Decimal] = []
    costs: list[Decimal] = []

    for sale_date, quantity, unit_price, unit_cost in records:
        quantity = Decimal(quantity)
        daily[sale_date] += quantity
        weekday = jalali_weekday(sale_date)
        weekday_totals[weekday] += quantity
        weekday_counts[weekday] += 1
        if unit_price:
            prices.append(Decimal(unit_price))
        if unit_cost:
            costs.append(Decimal(unit_cost))

    first_sale = min(daily)
    last_sale = max(daily)
    total_quantity = sum(daily.values(), Decimal('0'))

    # طول بازه‌ی تحلیل: از اولین فروش تا امروز (حداقل ۱ روز)
    span_days = max((today - first_sale).days + 1, 1)
    active_days = len(daily)

    avg_daily = total_quantity / Decimal(span_days)

    # پراکندگی بر پایه‌ی سری روزانه‌ی کامل (روزهای بدون فروش = صفر)
    series: list[float] = []
    cursor = first_sale
    while cursor <= today:
        series.append(float(daily.get(cursor, Decimal('0'))))
        cursor += timedelta(days=1)
    std_daily = Decimal(str(statistics.pstdev(series))) if len(series) > 1 else Decimal('0')

    # روند: مقایسه‌ی نرخ فروش نیمه‌ی دوم با نیمه‌ی اول بازه
    midpoint = first_sale + timedelta(days=span_days // 2)
    first_half = sum((qty for day, qty in daily.items() if day < midpoint), Decimal('0'))
    second_half = total_quantity - first_half
    half_days = max(span_days // 2, 1)
    rate_first = first_half / Decimal(half_days)
    rate_second = second_half / Decimal(max(span_days - half_days, 1))
    if rate_first > 0:
        trend_percent = (rate_second - rate_first) / rate_first * Decimal('100')
    else:
        trend_percent = Decimal('100') if rate_second > 0 else Decimal('0')
    trend_percent = max(min(trend_percent, Decimal('500')), Decimal('-100'))

    # ضریب فصلی: نرخ ۳۰ روز اخیر نسبت به نرخ کل
    recent_start = today - timedelta(days=30)
    recent_quantity = sum((qty for day, qty in daily.items() if day >= recent_start), Decimal('0'))
    recent_rate = recent_quantity / Decimal('30')
    if avg_daily > 0:
        seasonality = recent_rate / avg_daily
    else:
        seasonality = Decimal('1')
    seasonality = max(min(seasonality, Decimal('3')), Decimal('0.3'))

    # نرخ مؤثر: میانگین وزن‌دار نرخ کل و نرخ اخیر
    effective_daily = (avg_daily * Decimal('0.4') + recent_rate * Decimal('0.6'))
    if effective_daily <= 0:
        effective_daily = avg_daily

    best_weekday = None
    weekday_breakdown = []
    if weekday_totals:
        best_weekday = max(weekday_totals, key=lambda key: weekday_totals[key])
        weekday_breakdown = [{
            'weekday': index,
            'weekday_name': WEEKDAY_NAMES[index],
            'quantity': float(weekday_totals.get(index, Decimal('0'))),
            'transactions': weekday_counts.get(index, 0),
        } for index in range(7)]

    # اطمینان: تعداد داده، پوشش روزهای فعال و ضریب تغییرات
    data_points = len(records)
    min_points = getattr(settings, 'SUGGESTION_MIN_DATA_POINTS', 5)
    points_score = min(data_points / max(min_points * 4, 1), 1.0) * 45
    coverage_score = min(active_days / max(span_days * 0.35, 1), 1.0) * 25
    cv = float(std_daily / avg_daily) if avg_daily > 0 else 5.0
    stability_score = max(0.0, 1.0 - min(cv / 2.5, 1.0)) * 30
    confidence = int(round(points_score + coverage_score + stability_score))
    confidence = max(5, min(confidence, 99))

    avg_price = (sum(prices, Decimal('0')) / len(prices)) if prices else Decimal(product.sale_price)
    avg_cost = (sum(costs, Decimal('0')) / len(costs)) if costs else Decimal(product.purchase_price)

    return {
        'total_quantity': total_quantity,
        'data_points': data_points,
        'active_days': active_days,
        'span_days': span_days,
        'first_sale': first_sale,
        'last_sale': last_sale,
        'avg_daily': _q(avg_daily),
        'recent_daily': _q(recent_rate),
        'effective_daily': _q(effective_daily),
        'std_daily': _q(std_daily),
        'trend_percent': _q(trend_percent, '0.01'),
        'seasonality': _q(seasonality),
        'best_weekday': best_weekday,
        'weekday_breakdown': weekday_breakdown,
        'confidence': confidence,
        'avg_price': _q(avg_price, '1'),
        'avg_cost': _q(avg_cost, '1'),
        'daily_series': [
            {'date': day.isoformat(), 'date_jalali': to_jalali(day), 'quantity': float(qty)}
            for day, qty in sorted(daily.items())
        ],
    }


def build_suggestion_payload(
    product: Product,
    analysis: dict,
    *,
    coverage_days: int,
    horizon_days: int,
    reference_date: date | None = None,
    preferred_weekday: int | None = None,
) -> dict | None:
    """از تحلیل آماری، یک پیشنهاد سفارش می‌سازد. اگر نیازی به سفارش نباشد None."""
    today = reference_date or date.today()
    lead_time = int(product.lead_time_days or 0)
    stock = Decimal(product.stock_quantity)

    effective_daily = analysis['effective_daily']
    if effective_daily <= 0:
        return None

    days_left = stock / effective_daily if effective_daily > 0 else Decimal('9999')
    days_left = _q(days_left, '0.1')
    stockout_date = today + timedelta(days=int(days_left))

    # تاریخ پیشنهادی سفارش = تاریخ اتمام موجودی منهای زمان تأمین
    order_offset = int(days_left) - lead_time
    suggested_date = today + timedelta(days=max(order_offset, 0))

    # اگر روز هفته‌ی ترجیحی تعیین شده باشد، تاریخ به نزدیک‌ترین روز قبل‌تر منتقل می‌شود
    if preferred_weekday is not None:
        for back in range(0, 7):
            candidate = suggested_date - timedelta(days=back)
            if candidate < today:
                break
            if jalali_weekday(candidate) == preferred_weekday:
                suggested_date = candidate
                break

    # فقط کالاهایی که در افق زمانی موردنظر نیاز به سفارش دارند
    if (suggested_date - today).days > horizon_days:
        return None

    safety_stock = analysis['std_daily'] * SERVICE_LEVEL_Z * Decimal(str(math.sqrt(max(lead_time, 1))))
    target_stock = effective_daily * Decimal(lead_time + coverage_days) * analysis['seasonality']
    raw_quantity = target_stock + safety_stock - stock

    reorder_point = Decimal(product.reorder_point or 0)
    if raw_quantity <= 0 and stock <= reorder_point:
        raw_quantity = max(reorder_point - stock, effective_daily * Decimal(coverage_days))

    if raw_quantity <= 0:
        return None

    quantity = _round_order_quantity(raw_quantity)

    if days_left <= Decimal(lead_time):
        priority = PurchaseSuggestion.Priority.CRITICAL
    elif days_left <= Decimal(lead_time + 7):
        priority = PurchaseSuggestion.Priority.HIGH
    elif days_left <= Decimal(lead_time + coverage_days):
        priority = PurchaseSuggestion.Priority.MEDIUM
    else:
        priority = PurchaseSuggestion.Priority.LOW

    trend = analysis['trend_percent']
    trend_text = (
        f'روند فروش {abs(trend):.0f}٪ {"صعودی" if trend > 0 else "نزولی"}'
        if abs(trend) >= 5 else 'روند فروش پایدار'
    )
    weekday_text = ''
    if analysis['best_weekday'] is not None:
        weekday_text = f'، پرفروش‌ترین روز هفته: {WEEKDAY_NAMES[analysis["best_weekday"]]}'

    reason = (
        f'میانگین فروش روزانه {analysis["effective_daily"]} {product.get_unit_display()}؛ '
        f'موجودی فعلی {stock} برای حدود {days_left} روز کافی است و با زمان تأمین '
        f'{lead_time} روز، سفارش باید تا {to_jalali(suggested_date)} ثبت شود. '
        f'{trend_text}{weekday_text}. '
        f'مقدار پیشنهادی برای پوشش {coverage_days} روز آینده با ذخیره اطمینان محاسبه شده است.'
    )

    estimated_cost = (quantity * Decimal(product.purchase_price or analysis['avg_cost'])).quantize(Decimal('1'))

    return {
        'product': product,
        'suggested_date': suggested_date,
        'suggested_quantity': quantity,
        'suggested_supplier': product.default_supplier,
        'estimated_cost': estimated_cost,
        'avg_daily_sales': analysis['effective_daily'],
        'current_stock': stock,
        'days_of_stock_left': days_left,
        'stockout_date': stockout_date,
        'coverage_days': coverage_days,
        'lead_time_days': lead_time,
        'best_weekday': analysis['best_weekday'],
        'seasonality_factor': analysis['seasonality'],
        'trend_percent': analysis['trend_percent'],
        'confidence': analysis['confidence'],
        'data_points': analysis['data_points'],
        'priority': priority,
        'reason': reason,
        'analysis': {
            'avg_daily': float(analysis['avg_daily']),
            'recent_daily': float(analysis['recent_daily']),
            'effective_daily': float(analysis['effective_daily']),
            'std_daily': float(analysis['std_daily']),
            'safety_stock': float(_q(safety_stock, '0.01')),
            'target_stock': float(_q(target_stock, '0.01')),
            'raw_quantity': float(_q(raw_quantity, '0.01')),
            'active_days': analysis['active_days'],
            'span_days': analysis['span_days'],
            'first_sale': analysis['first_sale'].isoformat(),
            'first_sale_jalali': to_jalali(analysis['first_sale']),
            'last_sale': analysis['last_sale'].isoformat(),
            'last_sale_jalali': to_jalali(analysis['last_sale']),
            'weekday_breakdown': analysis['weekday_breakdown'],
            'avg_price': float(analysis['avg_price']),
            'avg_cost': float(analysis['avg_cost']),
        },
    }


def _round_order_quantity(value: Decimal) -> Decimal:
    """گرد کردن مقدار سفارش به عددی خوانا."""
    value = Decimal(value)
    if value < 10:
        return value.quantize(Decimal('1'), rounding='ROUND_UP')
    if value < 100:
        return (value / 5).quantize(Decimal('1'), rounding='ROUND_UP') * 5
    if value < 1000:
        return (value / 10).quantize(Decimal('1'), rounding='ROUND_UP') * 10
    return (value / 50).quantize(Decimal('1'), rounding='ROUND_UP') * 50


@transaction.atomic
def generate_suggestions(
    *,
    coverage_days: int | None = None,
    horizon_days: int = 60,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    min_confidence: int = 0,
    product_ids: list[int] | None = None,
    preferred_weekday: int | None = None,
    reference_date: date | None = None,
    user=None,
) -> dict:
    """پیشنهادهای در انتظار را بازتولید می‌کند و آمار اجرا را برمی‌گرداند."""
    coverage_days = coverage_days or getattr(settings, 'SUGGESTION_COVERAGE_DAYS', 30)
    today = reference_date or date.today()

    products = Product.objects.filter(is_active=True).select_related('default_supplier')
    if product_ids:
        products = products.filter(id__in=product_ids)

    # پیشنهادهای بررسی‌نشده‌ی قبلی حذف می‌شوند تا نتیجه‌ی تحلیل تازه باشد
    stale = PurchaseSuggestion.objects.filter(status=PurchaseSuggestion.Status.PENDING)
    if product_ids:
        stale = stale.filter(product_id__in=product_ids)
    removed = stale.count()
    stale.delete()

    created = 0
    analyzed = 0
    skipped_no_data = 0
    skipped_low_confidence = 0
    skipped_not_needed = 0

    for product in products:
        analysis = analyze_product(product, lookback_days=lookback_days, reference_date=today)
        if not analysis:
            skipped_no_data += 1
            continue
        analyzed += 1

        if analysis['confidence'] < min_confidence:
            skipped_low_confidence += 1
            continue

        payload = build_suggestion_payload(
            product, analysis,
            coverage_days=coverage_days,
            horizon_days=horizon_days,
            reference_date=today,
            preferred_weekday=preferred_weekday,
        )
        if not payload:
            skipped_not_needed += 1
            continue

        PurchaseSuggestion.objects.create(**payload)
        created += 1

    return {
        'created': created,
        'removed_pending': removed,
        'analyzed_products': analyzed,
        'total_products': products.count(),
        'skipped_no_data': skipped_no_data,
        'skipped_low_confidence': skipped_low_confidence,
        'skipped_not_needed': skipped_not_needed,
        'parameters': {
            'coverage_days': coverage_days,
            'horizon_days': horizon_days,
            'lookback_days': lookback_days,
            'min_confidence': min_confidence,
            'preferred_weekday': preferred_weekday,
            'reference_date': today.isoformat(),
            'reference_date_jalali': to_jalali(today),
        },
    }
