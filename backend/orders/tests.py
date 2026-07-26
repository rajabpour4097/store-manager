from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from catalog.models import Product, StockMovement
from catalog.services import apply_movement
from core.jalali import parse_flexible_date, parse_jalali, to_jalali
from ledger.models import EntryCategory, LedgerEntry, SourceType
from parties.models import Party, PartyType

from .importers import ImportError_, import_sales_csv
from .models import Order, OrderItem, OrderStatus, OrderType, PurchaseSuggestion, SalesHistory
from .services import OrderError, cancel_order, confirm_order, register_payment
from .suggestions import analyze_product, generate_suggestions


class JalaliUtilTests(TestCase):
    def test_to_jalali_roundtrip(self):
        gregorian = date(2024, 8, 2)
        self.assertEqual(to_jalali(gregorian), '1403/05/12')
        self.assertEqual(parse_jalali('1403/05/12'), gregorian)

    def test_parse_jalali_accepts_persian_digits(self):
        self.assertEqual(parse_jalali('۱۴۰۳/۰۵/۱۲'), date(2024, 8, 2))

    def test_parse_flexible_detects_calendar(self):
        self.assertEqual(parse_flexible_date('1403/05/12'), date(2024, 8, 2))
        self.assertEqual(parse_flexible_date('2024-08-02'), date(2024, 8, 2))

    def test_invalid_date_raises(self):
        with self.assertRaises(ValueError):
            parse_jalali('not-a-date')


class OrderWorkflowTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.customer = Party.objects.create(name='مشتری', party_type=PartyType.CUSTOMER)
        self.supplier = Party.objects.create(name='تأمین‌کننده', party_type=PartyType.SUPPLIER)
        self.product = Product.objects.create(name='کالا الف', purchase_price=1000,
                                              sale_price=1500, lead_time_days=5)
        apply_movement(product=self.product, date=date.today(), quantity=Decimal('100'),
                       reason=StockMovement.Reason.INITIAL, unit_cost=1000)
        self.product.refresh_from_db()
        self.today = date.today()

    def make_order(self, order_type=OrderType.SALE, quantity='10', **kwargs):
        order = Order.objects.create(
            order_type=order_type,
            party=self.customer if order_type == OrderType.SALE else self.supplier,
            order_date=self.today,
            created_by=self.manager,
            **kwargs,
        )
        OrderItem.objects.create(
            order=order, product=self.product, quantity=Decimal(quantity),
            unit_price=1500 if order_type == OrderType.SALE else 1000, unit_cost=1000,
        )
        order.recalculate()
        return order

    def test_order_number_is_generated_with_prefix(self):
        sale = self.make_order()
        purchase = self.make_order(OrderType.PURCHASE)
        self.assertTrue(sale.number.startswith('SO-'))
        self.assertTrue(purchase.number.startswith('PO-'))

    def test_recalculate_computes_totals_and_tax(self):
        order = self.make_order(quantity='10', tax_percent=Decimal('10'),
                                discount_amount=Decimal('1000'))
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('15000'))
        self.assertEqual(order.tax_amount, Decimal('1400'))
        self.assertEqual(order.total_amount, Decimal('15400'))
        self.assertEqual(order.cost_amount, Decimal('10000'))

    def test_draft_order_has_no_ledger_or_stock_effect(self):
        order = self.make_order()
        self.assertFalse(LedgerEntry.objects.filter(source_id=order.id).exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('100.00'))

    def test_confirming_sale_debits_customer_and_reduces_stock(self):
        order = self.make_order(quantity='10')
        confirm_order(order, user=self.manager)
        order.refresh_from_db()
        self.product.refresh_from_db()

        self.assertEqual(order.status, OrderStatus.CONFIRMED)
        self.assertEqual(self.product.stock_quantity, Decimal('90.00'))
        entry = LedgerEntry.objects.get(source_id=order.id,
                                        category=EntryCategory.SALE_INVOICE)
        self.assertEqual(entry.debit, order.total_amount)
        self.assertEqual(self.customer.balance, order.total_amount)

    def test_confirming_purchase_credits_supplier_and_increases_stock(self):
        order = self.make_order(OrderType.PURCHASE, quantity='25')
        confirm_order(order, user=self.manager)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('125.00'))
        entry = LedgerEntry.objects.get(source_id=order.id,
                                        category=EntryCategory.PURCHASE_INVOICE)
        self.assertEqual(entry.credit, order.total_amount)

    def test_confirm_fails_on_insufficient_stock(self):
        order = self.make_order(quantity='500')
        with self.assertRaises(OrderError) as ctx:
            confirm_order(order, user=self.manager)
        self.assertIn('موجودی کافی نیست', str(ctx.exception))

    def test_confirm_fails_without_items(self):
        order = Order.objects.create(order_type=OrderType.SALE, party=self.customer,
                                     order_date=self.today)
        with self.assertRaises(OrderError):
            confirm_order(order, user=self.manager)

    def test_double_confirm_fails(self):
        order = self.make_order()
        confirm_order(order, user=self.manager)
        with self.assertRaises(OrderError):
            confirm_order(order, user=self.manager)

    def test_confirmed_sale_populates_sales_history(self):
        order = self.make_order(quantity='7')
        confirm_order(order, user=self.manager)
        self.assertEqual(SalesHistory.objects.filter(source_order=order).count(), 1)
        record = SalesHistory.objects.get(source_order=order)
        self.assertEqual(record.quantity, Decimal('7.00'))

    def test_cancel_reverts_stock_ledger_and_history(self):
        order = self.make_order(quantity='10')
        confirm_order(order, user=self.manager)
        cancel_order(order, user=self.manager, reason='اشتباه ثبت')
        order.refresh_from_db()
        self.product.refresh_from_db()

        self.assertEqual(order.status, OrderStatus.CANCELLED)
        self.assertEqual(self.product.stock_quantity, Decimal('100.00'))
        self.assertFalse(LedgerEntry.objects.filter(source_type=SourceType.ORDER,
                                                    source_id=order.id).exists())
        self.assertFalse(SalesHistory.objects.filter(source_order=order).exists())

    def test_register_payment_updates_status_and_ledger(self):
        order = self.make_order(quantity='10')
        confirm_order(order, user=self.manager)
        register_payment(order, Decimal('5000'), user=self.manager)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'partial')
        self.assertEqual(order.remaining_amount, Decimal('10000'))

        register_payment(order, Decimal('10000'), user=self.manager)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, 'paid')
        self.assertEqual(order.remaining_amount, Decimal('0'))
        self.assertEqual(self.customer.compute_balance(), Decimal('0'))

    def test_overpayment_is_rejected(self):
        order = self.make_order(quantity='10')
        confirm_order(order, user=self.manager)
        with self.assertRaises(OrderError):
            register_payment(order, Decimal('999999'), user=self.manager)

    def test_gross_profit(self):
        order = self.make_order(quantity='10')
        confirm_order(order, user=self.manager)
        order.refresh_from_db()
        self.assertEqual(order.gross_profit, Decimal('5000'))


class OrderApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.accountant = User.objects.create_user(username='a', password='x',
                                                   role=Role.ACCOUNTANT)
        self.customer = Party.objects.create(name='مشتری', party_type=PartyType.CUSTOMER)
        self.product = Product.objects.create(name='کالا', purchase_price=1000, sale_price=2000)
        apply_movement(product=self.product, date=date.today(), quantity=Decimal('50'),
                       reason=StockMovement.Reason.INITIAL)
        self.client = APIClient()
        self.today = date.today()

    def create_order(self):
        return self.client.post('/api/orders/', {
            'order_type': OrderType.SALE,
            'party': self.customer.id,
            'order_date': str(self.today),
            'items': [{'product': self.product.id, 'quantity': '3', 'unit_price': 2000}],
        }, format='json')

    def test_accountant_creates_draft_but_cannot_confirm(self):
        self.client.force_authenticate(self.accountant)
        response = self.create_order()
        self.assertEqual(response.status_code, 201, response.data)
        order_id = response.data['id']
        self.assertEqual(response.data['status'], OrderStatus.DRAFT)
        confirm = self.client.post(f'/api/orders/{order_id}/confirm/')
        self.assertEqual(confirm.status_code, 403)

    def test_manager_confirms_order(self):
        self.client.force_authenticate(self.manager)
        order_id = self.create_order().data['id']
        response = self.client.post(f'/api/orders/{order_id}/confirm/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], OrderStatus.CONFIRMED)

    def test_due_date_before_order_date_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/orders/', {
            'order_type': OrderType.SALE, 'party': self.customer.id,
            'order_date': str(self.today), 'due_date': str(self.today - timedelta(days=3)),
            'items': [{'product': self.product.id, 'quantity': '1', 'unit_price': 2000}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_invalid_tax_percent_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/orders/', {
            'order_type': OrderType.SALE, 'party': self.customer.id,
            'order_date': str(self.today), 'tax_percent': '150',
            'items': [{'product': self.product.id, 'quantity': '1', 'unit_price': 2000}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_confirmed_order_cannot_be_deleted(self):
        self.client.force_authenticate(self.manager)
        order_id = self.create_order().data['id']
        self.client.post(f'/api/orders/{order_id}/confirm/')
        response = self.client.delete(f'/api/orders/{order_id}/')
        self.assertEqual(response.status_code, 400)

    def test_summary_endpoint(self):
        self.client.force_authenticate(self.manager)
        order_id = self.create_order().data['id']
        self.client.post(f'/api/orders/{order_id}/confirm/')
        response = self.client.get('/api/orders/summary/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['sale']['count'], 1)


CSV_CONTENT = """تاریخ,کد کالا,نام کالا,واحد,تعداد,قیمت واحد,بهای واحد,مبلغ کل,مشتری
۱۴۰۳/۰۱/۱۵,SKUX1,کالای وارداتی الف,عدد,12,450000,380000,5400000,فروشگاه گلستان
1403/01/16,SKUX1,کالای وارداتی الف,عدد,8,450000,380000,3600000,فروشگاه گلستان
2024-04-06,SKUX2,کالای وارداتی ب,کیلوگرم,20,120000,90000,2400000,هایپر نیک
"""

BAD_CSV = """نام,مقدار
الف,10
"""


class SalesImportTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='m', password='x', role=Role.MANAGER)

    def test_import_creates_products_and_records(self):
        batch = import_sales_csv(raw_bytes=CSV_CONTENT.encode('utf-8'),
                                file_name='test.csv', user=self.user)
        self.assertEqual(batch.total_rows, 3)
        self.assertEqual(batch.imported_rows, 3)
        self.assertEqual(batch.skipped_rows, 0)
        self.assertEqual(batch.created_products, 2)
        self.assertEqual(SalesHistory.objects.count(), 3)

    def test_import_parses_both_calendars(self):
        import_sales_csv(raw_bytes=CSV_CONTENT.encode('utf-8'), file_name='t.csv', user=self.user)
        dates = set(SalesHistory.objects.values_list('sale_date', flat=True))
        self.assertIn(date(2024, 4, 3), dates)
        self.assertIn(date(2024, 4, 6), dates)

    def test_import_links_parties_when_requested(self):
        import_sales_csv(raw_bytes=CSV_CONTENT.encode('utf-8'), file_name='t.csv',
                         user=self.user, link_parties=True)
        self.assertTrue(Party.objects.filter(name='فروشگاه گلستان').exists())
        self.assertTrue(SalesHistory.objects.filter(party__isnull=False).exists())

    def test_missing_required_columns_raises(self):
        with self.assertRaises(ImportError_) as ctx:
            import_sales_csv(raw_bytes=BAD_CSV.encode('utf-8'), file_name='bad.csv',
                             user=self.user)
        self.assertIn('تاریخ', str(ctx.exception))

    def test_bad_rows_are_reported_not_fatal(self):
        content = CSV_CONTENT + 'نامعتبر,SKUX3,کالای ج,عدد,abc,1,1,1,مشتری\n'
        batch = import_sales_csv(raw_bytes=content.encode('utf-8'), file_name='mixed.csv',
                                 user=self.user)
        self.assertEqual(batch.imported_rows, 3)
        self.assertEqual(batch.skipped_rows, 1)
        self.assertEqual(len(batch.errors), 1)

    def test_windows1256_encoding_is_supported(self):
        # ویندوز-۱۲۵۶ حرف «ی» فارسی را ندارد، بنابراین از «ي» عربی استفاده می‌شود
        content = ('تاريخ,نام كالا,تعداد,قيمت واحد\n'
                   '1403/02/10,كالاي وارداتي,15,250000\n')
        batch = import_sales_csv(raw_bytes=content.encode('cp1256'),
                                 file_name='cp.csv', user=self.user)
        self.assertEqual(batch.imported_rows, 1)
        self.assertEqual(SalesHistory.objects.get().quantity, Decimal('15'))

    def test_semicolon_delimiter_is_supported(self):
        content = CSV_CONTENT.replace(',', ';')
        batch = import_sales_csv(raw_bytes=content.encode('utf-8'),
                                 file_name='semi.csv', user=self.user)
        self.assertEqual(batch.imported_rows, 3)

    def test_unit_price_derived_from_total(self):
        content = ('تاریخ,نام کالا,تعداد,مبلغ کل\n1403/01/15,کالای ت,10,1000000\n')
        import_sales_csv(raw_bytes=content.encode('utf-8'), file_name='d.csv', user=self.user)
        record = SalesHistory.objects.get()
        self.assertEqual(record.unit_price, Decimal('100000'))

    def test_upload_endpoint(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        client = APIClient()
        client.force_authenticate(self.user)
        upload = SimpleUploadedFile('sales.csv', CSV_CONTENT.encode('utf-8'), content_type='text/csv')
        response = client.post('/api/sales-imports/upload/', {'file': upload},
                               format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['imported_rows'], 3)

    def test_upload_rejects_non_csv(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        client = APIClient()
        client.force_authenticate(self.user)
        upload = SimpleUploadedFile('sales.pdf', b'%PDF-1.4', content_type='application/pdf')
        response = client.post('/api/sales-imports/upload/', {'file': upload}, format='multipart')
        self.assertEqual(response.status_code, 400)

    def test_sample_download(self):
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get('/api/sales-imports/sample/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])


class SuggestionEngineTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.supplier = Party.objects.create(name='تأمین', party_type=PartyType.SUPPLIER)
        self.today = date.today()

    def make_product(self, name, *, stock, lead_time=7, daily=10, days=120):
        product = Product.objects.create(
            name=name, purchase_price=1000, sale_price=1500,
            lead_time_days=lead_time, default_supplier=self.supplier,
            reorder_point=Decimal(str(daily * lead_time)),
        )
        apply_movement(product=product, date=self.today - timedelta(days=days),
                       quantity=Decimal(str(stock)), reason=StockMovement.Reason.INITIAL)
        records = [
            SalesHistory(product=product, product_name_raw=name,
                         sale_date=self.today - timedelta(days=offset),
                         quantity=Decimal(str(daily)), unit_price=1500,
                         total_amount=1500 * daily, unit_cost=1000)
            for offset in range(days)
        ]
        SalesHistory.objects.bulk_create(records)
        product.refresh_from_db()
        return product

    def test_analysis_returns_none_without_history(self):
        product = Product.objects.create(name='بی‌سابقه', purchase_price=1, sale_price=2)
        self.assertIsNone(analyze_product(product))

    def test_analysis_computes_daily_rate(self):
        product = self.make_product('کالای پرفروش', stock=100, daily=10, days=90)
        analysis = analyze_product(product, lookback_days=180)
        self.assertIsNotNone(analysis)
        self.assertAlmostEqual(float(analysis['avg_daily']), 10.0, delta=0.5)
        self.assertEqual(analysis['data_points'], 90)
        self.assertGreater(analysis['confidence'], 50)

    def test_low_stock_product_gets_critical_suggestion(self):
        self.make_product('کالای کم‌موجود', stock=20, daily=10, lead_time=7, days=90)
        result = generate_suggestions(coverage_days=30, horizon_days=60, lookback_days=180)
        self.assertEqual(result['created'], 1)
        suggestion = PurchaseSuggestion.objects.get()
        self.assertEqual(suggestion.priority, PurchaseSuggestion.Priority.CRITICAL)
        self.assertGreater(suggestion.suggested_quantity, Decimal('0'))
        self.assertEqual(suggestion.suggested_supplier, self.supplier)
        self.assertIn('میانگین فروش روزانه', suggestion.reason)

    def test_well_stocked_product_is_not_suggested_within_horizon(self):
        self.make_product('کالای پرموجود', stock=5000, daily=10, lead_time=7, days=90)
        result = generate_suggestions(coverage_days=30, horizon_days=30, lookback_days=180)
        self.assertEqual(result['created'], 0)
        self.assertEqual(result['skipped_not_needed'], 1)

    def test_suggested_date_accounts_for_lead_time(self):
        self.make_product('کالای الف', stock=300, daily=10, lead_time=10, days=90)
        generate_suggestions(coverage_days=30, horizon_days=90, lookback_days=180)
        suggestion = PurchaseSuggestion.objects.get()
        # موجودی ۳۰۰ با فروش ۱۰ در روز حدود ۳۰ روز دوام دارد؛ با تأمین ۱۰ روزه
        # سفارش باید حدود ۲۰ روز بعد ثبت شود.
        offset = (suggestion.suggested_date - self.today).days
        self.assertTrue(15 <= offset <= 25, f'offset={offset}')
        self.assertEqual(suggestion.lead_time_days, 10)

    def test_preferred_weekday_shifts_suggested_date(self):
        from core.jalali import jalali_weekday

        self.make_product('کالای ب', stock=300, daily=10, lead_time=10, days=90)
        generate_suggestions(coverage_days=30, horizon_days=90, lookback_days=180,
                             preferred_weekday=0)
        suggestion = PurchaseSuggestion.objects.get()
        self.assertEqual(jalali_weekday(suggestion.suggested_date), 0)

    def test_regenerate_replaces_pending_suggestions(self):
        self.make_product('کالای ج', stock=20, daily=10, days=90)
        generate_suggestions(coverage_days=30, lookback_days=180)
        first_id = PurchaseSuggestion.objects.get().id
        result = generate_suggestions(coverage_days=30, lookback_days=180)
        self.assertEqual(result['removed_pending'], 1)
        self.assertNotEqual(PurchaseSuggestion.objects.get().id, first_id)

    def test_reviewed_suggestions_are_kept(self):
        self.make_product('کالای د', stock=20, daily=10, days=90)
        generate_suggestions(coverage_days=30, lookback_days=180)
        suggestion = PurchaseSuggestion.objects.get()
        suggestion.status = PurchaseSuggestion.Status.ACCEPTED
        suggestion.save()
        generate_suggestions(coverage_days=30, lookback_days=180)
        self.assertTrue(PurchaseSuggestion.objects.filter(
            id=suggestion.id, status=PurchaseSuggestion.Status.ACCEPTED).exists())

    def test_min_confidence_filter(self):
        self.make_product('کالای ه', stock=20, daily=10, days=20)
        result = generate_suggestions(coverage_days=30, lookback_days=180, min_confidence=100)
        self.assertEqual(result['created'], 0)
        self.assertEqual(result['skipped_low_confidence'], 1)

    def test_create_order_from_suggestion(self):
        self.make_product('کالای و', stock=20, daily=10, days=90)
        generate_suggestions(coverage_days=30, lookback_days=180)
        suggestion = PurchaseSuggestion.objects.get()

        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post(f'/api/suggestions/{suggestion.id}/create-order/', {}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['order_type'], OrderType.PURCHASE)
        self.assertEqual(len(response.data['items']), 1)

        suggestion.refresh_from_db()
        self.assertEqual(suggestion.status, PurchaseSuggestion.Status.ORDERED)

        duplicate = client.post(f'/api/suggestions/{suggestion.id}/create-order/', {}, format='json')
        self.assertEqual(duplicate.status_code, 400)

    def test_generate_endpoint_and_summary(self):
        self.make_product('کالای ز', stock=20, daily=10, days=90)
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post('/api/suggestions/generate/', {
            'coverage_days': 30, 'horizon_days': 60, 'lookback_days': 180,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 1)

        summary = client.get('/api/suggestions/summary/')
        self.assertEqual(summary.data['pending'], 1)
        self.assertEqual(summary.data['critical_count'], 1)

    def test_analyze_endpoint(self):
        product = self.make_product('کالای ح', stock=100, daily=10, days=90)
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get(f'/api/suggestions/analyze/{product.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertIn('weekday_breakdown', response.data)

    def test_analyze_endpoint_without_data(self):
        product = Product.objects.create(name='خالی', purchase_price=1, sale_price=2)
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get(f'/api/suggestions/analyze/{product.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['has_data'])
