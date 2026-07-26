"""تست دود API با استفاده از کلاینت تست جنگو.

اجرا: python smoke_test.py
"""

import os
import sys

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from rest_framework.test import APIClient  # noqa: E402

client = APIClient()

failures = []
results = []


def login(username, password):
    response = client.post('/api/accounts/login/',
                           {'username': username, 'password': password}, format='json')
    if response.status_code != 200:
        raise SystemExit(f'ورود ناموفق برای {username}: {response.status_code} {response.data}')
    token = response.data['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return response.data['user']


def check(label, method, url, *, expect=200, data=None, fmt='json'):
    fn = getattr(client, method)
    response = fn(url, data, format=fmt) if data is not None else fn(url)
    ok = response.status_code == expect
    results.append((ok, label, url, response.status_code, expect))
    if not ok:
        body = getattr(response, 'data', None)
        failures.append(f'{label} [{method.upper()} {url}] => {response.status_code} '
                        f'(انتظار {expect}) :: {str(body)[:300]}')
    return response


print('=' * 70)
print('۱) ورود مدیر')
user = login('manager1', 'Manager@1234')
print(f'   کاربر: {user["display_name"]} | نقش: {user["role_display"]}')

ENDPOINTS = [
    ('سلامت سرویس', 'get', '/api/health/'),
    ('پروفایل من', 'get', '/api/accounts/me/'),
    ('دسترسی‌ها', 'get', '/api/accounts/me/capabilities/'),
    ('کاربران', 'get', '/api/accounts/users/'),
    ('نقش‌ها', 'get', '/api/accounts/users/roles/'),
    ('گزارش فعالیت', 'get', '/api/accounts/activity-logs/'),
    ('طرف‌حساب‌ها', 'get', '/api/parties/'),
    ('انواع طرف حساب', 'get', '/api/parties/types/'),
    ('خلاصه طرف‌حساب‌ها', 'get', '/api/parties/summary/'),
    ('تحلیل سنی مطالبات', 'get', '/api/parties/aging/'),
    ('اسناد دفتر', 'get', '/api/ledger/entries/'),
    ('خلاصه دفتر', 'get', '/api/ledger/entries/summary/'),
    ('بابت اسناد', 'get', '/api/ledger/entries/categories/'),
    ('حساب‌های بانکی', 'get', '/api/ledger/bank-accounts/'),
    ('دسته هزینه/درآمد', 'get', '/api/ledger/finance-categories/'),
    ('هزینه‌ها و درآمدها', 'get', '/api/ledger/finance-records/'),
    ('خلاصه هزینه‌ها', 'get', '/api/ledger/finance-records/summary/'),
    ('چک‌ها', 'get', '/api/cheques/'),
    ('گزینه‌های چک', 'get', '/api/cheques/options/'),
    ('خلاصه چک‌ها', 'get', '/api/cheques/summary/'),
    ('تقویم چک‌ها', 'get', '/api/cheques/calendar/'),
    ('هشدار چک‌ها', 'get', '/api/cheques/alerts/'),
    ('چک‌های پرداختی', 'get', '/api/cheques/?direction=payable'),
    ('چک‌های دریافتی سرسیدگذشته', 'get', '/api/cheques/?direction=receivable&state=overdue'),
    ('کالاها', 'get', '/api/catalog/products/'),
    ('گزینه‌های کالا', 'get', '/api/catalog/products/options/'),
    ('خلاصه کالاها', 'get', '/api/catalog/products/summary/'),
    ('کالاهای کم‌موجود', 'get', '/api/catalog/products/low-stock/'),
    ('دسته‌بندی کالا', 'get', '/api/catalog/categories/'),
    ('گردش انبار', 'get', '/api/catalog/stock-movements/'),
    ('سفارشات', 'get', '/api/orders/'),
    ('گزینه‌های سفارش', 'get', '/api/orders/options/'),
    ('خلاصه سفارشات', 'get', '/api/orders/summary/'),
    ('سفارشات فروش', 'get', '/api/orders/?order_type=sale'),
    ('پیشنهادهای هوشمند', 'get', '/api/suggestions/'),
    ('خلاصه پیشنهادها', 'get', '/api/suggestions/summary/'),
    ('سوابق فروش', 'get', '/api/sales-history/'),
    ('خلاصه سوابق فروش', 'get', '/api/sales-history/summary/'),
    ('دسته‌های ورود CSV', 'get', '/api/sales-imports/'),
    ('نمونه CSV', 'get', '/api/sales-imports/sample/'),
    ('داشبورد', 'get', '/api/reports/dashboard/'),
    ('فهرست گزارش‌ها', 'get', '/api/reports/catalog/'),
    ('سود و زیان', 'get', '/api/reports/profit-loss/?preset=jalali_year&compare=true'),
    ('گزارش فروش', 'get', '/api/reports/sales/?preset=quarter'),
    ('گزارش خرید', 'get', '/api/reports/purchases/?preset=quarter'),
    ('بدهکار/بستانکار', 'get', '/api/reports/receivables/'),
    ('گزارش چک', 'get', '/api/reports/cheques/?preset=year'),
    ('گزارش انبار', 'get', '/api/reports/inventory/'),
    ('خروجی CSV انبار', 'get', '/api/reports/export/inventory/'),
    ('خروجی CSV مطالبات', 'get', '/api/reports/export/receivables/'),
    ('خروجی CSV فروش', 'get', '/api/reports/export/sales/?preset=quarter'),
]

print('\n۲) بررسی اندپوینت‌ها با نقش مدیر')
for label, method, url in ENDPOINTS:
    check(label, method, url)

print('\n۳) بررسی جزئیات یک رکورد')
from cheques.models import Cheque  # noqa: E402
from orders.models import Order, PurchaseSuggestion  # noqa: E402
from parties.models import Party  # noqa: E402
from catalog.models import Product  # noqa: E402

party = Party.objects.first()
order = Order.objects.first()
cheque = Cheque.objects.first()
product = Product.objects.first()
suggestion = PurchaseSuggestion.objects.first()

if party:
    check('جزئیات طرف حساب', 'get', f'/api/parties/{party.id}/')
    check('صورتحساب طرف حساب', 'get', f'/api/parties/{party.id}/statement/')
    check('جمع‌های طرف حساب', 'get', f'/api/parties/{party.id}/totals/')
if order:
    check('جزئیات سفارش', 'get', f'/api/orders/{order.id}/')
if cheque:
    check('جزئیات چک', 'get', f'/api/cheques/{cheque.id}/')
if product:
    check('جزئیات کالا', 'get', f'/api/catalog/products/{product.id}/')
    check('گردش کالا', 'get', f'/api/catalog/products/{product.id}/movements/')
    check('تحلیل فروش کالا', 'get', f'/api/suggestions/analyze/{product.id}/')
if suggestion:
    check('جزئیات پیشنهاد', 'get', f'/api/suggestions/{suggestion.id}/')

print('\n۴) عملیات نوشتاری با نقش مدیر')
new_party = check('ایجاد طرف حساب', 'post', '/api/parties/', expect=201, data={
    'name': 'مشتری تست دود', 'party_type': 'customer', 'mobile': '09190000000',
    'opening_balance': 0, 'credit_limit': 0,
})
if new_party.status_code == 201:
    pid = new_party.data['id']
    check('سند سریع بدهکار', 'post', '/api/ledger/entries/quick-entry/', expect=201, data={
        'party': pid, 'date': '2025-01-01', 'entry_type': 'debit', 'amount': 1_000_000,
        'category': 'adjustment', 'description': 'تست دود',
    })
    check('ویرایش طرف حساب', 'patch', f'/api/parties/{pid}/', data={'city': 'تهران'})
    check('حذف طرف حساب', 'delete', f'/api/parties/{pid}/', expect=204)

check('تولید پیشنهاد هوشمند', 'post', '/api/suggestions/generate/', data={
    'coverage_days': 30, 'horizon_days': 45, 'lookback_days': 180, 'min_confidence': 10,
})

print('\n۵) ورود حسابدار و بررسی محدودیت دسترسی')
login('accountant', 'Hesab@1234')
check('حسابدار: چک‌ها', 'get', '/api/cheques/')
check('حسابدار: سود و زیان', 'get', '/api/reports/profit-loss/?preset=month')
check('حسابدار: مدیریت کاربران (باید ۴۰۳)', 'get', '/api/accounts/users/', expect=403)
check('حسابدار: گزارش فعالیت (باید ۴۰۳)', 'get', '/api/accounts/activity-logs/', expect=403)

accountant_party = check('حسابدار: ایجاد طرف حساب', 'post', '/api/parties/', expect=201, data={
    'name': 'مشتری تست حسابدار', 'party_type': 'customer', 'mobile': '09190000001',
})
if accountant_party.status_code == 201:
    apid = accountant_party.data['id']
    check('حسابدار: حذف طرف حساب (باید ۴۰۳)', 'delete', f'/api/parties/{apid}/', expect=403)
    login('manager1', 'Manager@1234')
    check('مدیر: حذف طرف حساب حسابدار', 'delete', f'/api/parties/{apid}/', expect=204)

login('accountant', 'Hesab@1234')
draft = check('حسابدار: ایجاد سفارش پیش‌نویس', 'post', '/api/orders/', expect=201, data={
    'order_type': 'sale',
    'party': Party.objects.filter(party_type='customer').first().id,
    'order_date': '2025-06-01',
    'tax_percent': '0',
    'affects_stock': False,
    'items': [{'product': product.id, 'quantity': '2', 'unit_price': str(int(product.sale_price))}],
})
if draft.status_code == 201:
    oid = draft.data['id']
    check('حسابدار: تأیید سفارش (باید ۴۰۳)', 'post', f'/api/orders/{oid}/confirm/', expect=403)
    login('manager1', 'Manager@1234')
    check('مدیر: تأیید سفارش', 'post', f'/api/orders/{oid}/confirm/')
    check('مدیر: ثبت پرداخت', 'post', f'/api/orders/{oid}/register-payment/', data={'amount': 1000})
    check('مدیر: لغو سفارش', 'post', f'/api/orders/{oid}/cancel/', data={'reason': 'تست دود'})
    check('مدیر: حذف سفارش', 'delete', f'/api/orders/{oid}/', expect=204)

print('\n' + '=' * 70)
passed = sum(1 for ok, *_ in results if ok)
print(f'نتیجه: {passed}/{len(results)} بررسی موفق')
if failures:
    print('\nخطاها:')
    for item in failures:
        print(f'  ✗ {item}')
    sys.exit(1)
print('همه بررسی‌ها موفق بود. ✅')
