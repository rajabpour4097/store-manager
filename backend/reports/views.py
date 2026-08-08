import csv
from datetime import date, timedelta

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import has_capability
from core.jalali import jalali_month_range, parse_flexible_date, to_jalali

from . import services


def _range(request, *, default_days: int = 30) -> tuple[date, date]:
    """بازه‌ی تاریخ را از پارامترهای درخواست می‌خواند.

    پشتیبانی از: date_from/date_to (شمسی یا میلادی)، preset، jyear/jmonth
    """
    params = request.query_params
    preset = params.get('preset')
    today = date.today()

    if preset:
        import jdatetime

        jtoday = jdatetime.date.fromgregorian(date=today)
        if preset == 'today':
            return today, today
        if preset == 'week':
            return today - timedelta(days=6), today
        if preset == 'month':
            return today - timedelta(days=29), today
        if preset == 'quarter':
            return today - timedelta(days=89), today
        if preset == 'year':
            return today - timedelta(days=364), today
        if preset == 'jalali_month':
            return jalali_month_range(jtoday.year, jtoday.month)
        if preset == 'jalali_prev_month':
            year, month = (jtoday.year, jtoday.month - 1) if jtoday.month > 1 else (jtoday.year - 1, 12)
            return jalali_month_range(year, month)
        if preset == 'jalali_year':
            start = jdatetime.date(jtoday.year, 1, 1).togregorian()
            return start, today
        if preset == 'jalali_prev_year':
            start = jdatetime.date(jtoday.year - 1, 1, 1).togregorian()
            end = jdatetime.date(jtoday.year, 1, 1).togregorian() - timedelta(days=1)
            return start, end

    jyear = params.get('jyear')
    jmonth = params.get('jmonth')
    if jyear and jmonth:
        return jalali_month_range(int(jyear), int(jmonth))

    try:
        date_from = parse_flexible_date(params.get('date_from'))
        date_to = parse_flexible_date(params.get('date_to'))
    except ValueError as exc:
        raise ValidationError({'detail': str(exc)})

    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=default_days - 1))

    if date_from > date_to:
        raise ValidationError({'detail': 'تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.'})

    return date_from, date_to


def _require(request, capability: str):
    if not has_capability(request.user, capability):
        raise PermissionDenied('دسترسی لازم برای مشاهده این گزارش را ندارید.')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_view(request):
    _require(request, 'reports.view')
    date_from, date_to = _range(request)
    return Response(services.dashboard(date_from, date_to))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profit_loss_view(request):
    _require(request, 'reports.profit_loss')
    date_from, date_to = _range(request)
    data = services.profit_and_loss(date_from, date_to)
    data['monthly'] = services.profit_and_loss_monthly(date_from, date_to)

    if request.query_params.get('compare') == 'true':
        span = (date_to - date_from).days + 1
        prev_to = date_from - timedelta(days=1)
        prev_from = prev_to - timedelta(days=span - 1)
        previous = services.profit_and_loss(prev_from, prev_to)
        data['previous_period'] = {
            'date_from_jalali': previous['date_from_jalali'],
            'date_to_jalali': previous['date_to_jalali'],
            'net_sales': previous['revenue']['net_sales'],
            'gross_profit': previous['gross_profit'],
            'net_profit': previous['net_profit'],
            'operating_expenses': previous['operating_expenses'],
        }
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sales_view(request):
    _require(request, 'reports.view')
    date_from, date_to = _range(request)
    group_by = request.query_params.get('group_by', 'month')
    return Response(services.sales_report(date_from, date_to, group_by=group_by))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def purchases_view(request):
    _require(request, 'reports.view')
    date_from, date_to = _range(request)
    return Response(services.purchase_report(date_from, date_to))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def receivables_view(request):
    _require(request, 'reports.view')
    return Response(services.receivables_payables())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cheques_view(request):
    _require(request, 'reports.view')
    date_from, date_to = _range(request, default_days=180)
    return Response(services.cheque_report(date_from, date_to))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_view(request):
    _require(request, 'reports.view')
    return Response(services.inventory_report())


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def warehouse_stats_view(request):
    _require(request, 'reports.view')
    date_from, date_to = _range(request)
    return Response(services.warehouse_stats(date_from, date_to))


REPORT_CATALOG = [
    {'key': 'profit_loss', 'title': 'سود و زیان', 'capability': 'reports.profit_loss',
     'description': 'صورت سود و زیان با انتخاب بازه تاریخ، شامل بهای تمام‌شده، هزینه‌ها و حاشیه سود.'},
    {'key': 'sales', 'title': 'فروش', 'capability': 'reports.view',
     'description': 'گزارش فروش به تفکیک کالا، مشتری و بازه زمانی.'},
    {'key': 'purchases', 'title': 'خرید', 'capability': 'reports.view',
     'description': 'گزارش خرید به تفکیک تأمین‌کننده و کالا.'},
    {'key': 'receivables', 'title': 'بدهکاران و بستانکاران', 'capability': 'reports.view',
     'description': 'مانده حساب همه طرف‌های حساب و وضعیت اعتبار.'},
    {'key': 'cheques', 'title': 'چک‌ها', 'capability': 'reports.view',
     'description': 'گزارش چک‌های پرداختی و دریافتی بر اساس سرسید و وضعیت.'},
    {'key': 'inventory', 'title': 'موجودی انبار', 'capability': 'reports.view',
     'description': 'ارزش موجودی، کالاهای ناموجود و زیر نقطه سفارش.'},
    {'key': 'warehouse', 'title': 'آمار گردش انبار', 'capability': 'reports.view',
     'description': 'ورود و خروج کالا، گردش روزانه و وضعیت موجودی.'},
]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def catalog_view(request):
    return Response([
        {**item, 'allowed': has_capability(request.user, item['capability'])}
        for item in REPORT_CATALOG
    ])


EXPORTERS = {
    'receivables': lambda request, df, dt: (
        ['کد', 'نام', 'نوع', 'موبایل', 'مانده'],
        [[row['code'], row['name'], row['party_type_display'], row['mobile'], row['balance']]
         for row in services.receivables_payables()['debtors']],
        'receivables',
    ),
    'inventory': lambda request, df, dt: (
        ['کد کالا', 'نام کالا', 'دسته', 'واحد', 'موجودی', 'نقطه سفارش', 'قیمت خرید',
         'قیمت فروش', 'ارزش موجودی'],
        [[row['sku'], row['name'], row['category'], row['unit_display'], row['stock_quantity'],
          row['reorder_point'], row['purchase_price'], row['sale_price'], row['stock_value']]
         for row in services.inventory_report()['items']],
        'inventory',
    ),
    'sales': lambda request, df, dt: (
        ['کالا', 'واحد', 'تعداد', 'فروش', 'بهای تمام‌شده', 'سود'],
        [[row['product_name'], row['unit_display'], row['quantity'], row['revenue'],
          row['cost'], row['profit']]
         for row in services.sales_report(df, dt)['by_product']],
        'sales',
    ),
}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_view(request, report_key):
    _require(request, 'reports.view')
    exporter = EXPORTERS.get(report_key)
    if exporter is None:
        raise ValidationError({'detail': 'این گزارش قابلیت خروجی CSV ندارد.'})

    date_from, date_to = _range(request)
    header, rows, filename = exporter(request, date_from, date_to)

    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}-{date_to}.csv"'
    response.write('\ufeff')
    writer = csv.writer(response)
    writer.writerow(header)
    writer.writerows(rows)
    return response
