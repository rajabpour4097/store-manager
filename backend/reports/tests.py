from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from catalog.models import Product, StockMovement
from catalog.services import apply_movement
from cheques.models import Cheque, ChequeDirection, ChequeStatus
from cheques.services import change_status, sync_cheque_ledger
from ledger.models import FinanceCategory, FinanceRecord
from orders.models import Order, OrderItem, OrderType
from orders.services import confirm_order
from parties.models import Party, PartyType

from . import services


class ProfitLossTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.customer = Party.objects.create(name='مشتری', party_type=PartyType.CUSTOMER)
        self.product = Product.objects.create(name='کالا', purchase_price=1000, sale_price=2500)
        apply_movement(product=self.product, date=date.today() - timedelta(days=60),
                       quantity=Decimal('1000'), reason=StockMovement.Reason.INITIAL)
        self.today = date.today()

        self.order = Order.objects.create(order_type=OrderType.SALE, party=self.customer,
                                          order_date=self.today, created_by=self.manager)
        OrderItem.objects.create(order=self.order, product=self.product,
                                 quantity=Decimal('100'), unit_price=2500, unit_cost=1000)
        self.order.recalculate()
        confirm_order(self.order, user=self.manager)

        category = FinanceCategory.objects.create(name='اجاره',
                                                  kind=FinanceCategory.Kind.EXPENSE)
        FinanceRecord.objects.create(kind=FinanceCategory.Kind.EXPENSE, category=category,
                                     title='اجاره', amount=Decimal('50000'), date=self.today)
        income_cat = FinanceCategory.objects.create(name='ضایعات',
                                                    kind=FinanceCategory.Kind.INCOME)
        FinanceRecord.objects.create(kind=FinanceCategory.Kind.INCOME, category=income_cat,
                                     title='ضایعات', amount=Decimal('20000'), date=self.today)

    def test_profit_and_loss_math(self):
        report = services.profit_and_loss(self.today, self.today)
        self.assertEqual(report['revenue']['net_sales'], Decimal('250000'))
        self.assertEqual(report['cost_of_goods_sold'], Decimal('100000'))
        self.assertEqual(report['gross_profit'], Decimal('150000'))
        self.assertEqual(report['operating_expenses'], Decimal('50000'))
        self.assertEqual(report['operating_profit'], Decimal('100000'))
        self.assertEqual(report['other_income'], Decimal('20000'))
        self.assertEqual(report['net_profit'], Decimal('120000'))
        self.assertEqual(report['gross_margin_percent'], Decimal('60.00'))

    def test_draft_orders_are_excluded(self):
        draft = Order.objects.create(order_type=OrderType.SALE, party=self.customer,
                                     order_date=self.today)
        OrderItem.objects.create(order=draft, product=self.product, quantity=Decimal('50'),
                                 unit_price=2500, unit_cost=1000)
        draft.recalculate()
        report = services.profit_and_loss(self.today, self.today)
        self.assertEqual(report['revenue']['net_sales'], Decimal('250000'))

    def test_date_range_excludes_outside_records(self):
        report = services.profit_and_loss(self.today - timedelta(days=30),
                                          self.today - timedelta(days=10))
        self.assertEqual(report['revenue']['net_sales'], Decimal('0'))
        self.assertEqual(report['net_profit'], Decimal('0'))

    def test_monthly_breakdown(self):
        monthly = services.profit_and_loss_monthly(self.today - timedelta(days=60), self.today)
        self.assertTrue(monthly)
        self.assertEqual(sum(row['net_sales'] for row in monthly), Decimal('250000'))

    def test_jalali_labels_present(self):
        report = services.profit_and_loss(self.today, self.today)
        self.assertRegex(report['date_from_jalali'], r'^\d{4}/\d{2}/\d{2}$')

    def test_sales_report_groups_by_product_and_party(self):
        report = services.sales_report(self.today, self.today)
        self.assertEqual(report['totals']['orders_count'], 1)
        self.assertEqual(report['by_product'][0]['product_name'], 'کالا')
        self.assertEqual(report['by_product'][0]['profit'], Decimal('150000'))
        self.assertEqual(report['by_party'][0]['party__name'], 'مشتری')

    def test_inventory_report(self):
        report = services.inventory_report()
        self.assertEqual(report['total_products'], 1)
        self.assertEqual(report['total_stock_value'], Decimal('900000'))

    def test_receivables_report(self):
        report = services.receivables_payables()
        self.assertEqual(report['debtor_count'], 1)
        self.assertEqual(report['total_receivable'], Decimal('250000'))

    def test_dashboard_shape(self):
        data = services.dashboard(self.today - timedelta(days=29), self.today)
        for key in ('kpis', 'cheques', 'inventory', 'suggestions', 'daily_series',
                    'top_products', 'monthly_trend'):
            self.assertIn(key, data)
        self.assertEqual(len(data['daily_series']), 30)
        self.assertEqual(data['kpis']['net_sales'], Decimal('250000'))


class ReportApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.accountant = User.objects.create_user(username='a', password='x',
                                                   role=Role.ACCOUNTANT)
        self.client = APIClient()

    def test_manager_and_accountant_can_view_profit_loss(self):
        for user in (self.manager, self.accountant):
            self.client.force_authenticate(user)
            response = self.client.get('/api/reports/profit-loss/?preset=month')
            self.assertEqual(response.status_code, 200, user.username)

    def test_report_catalog_marks_allowed(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get('/api/reports/catalog/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(item['allowed'] for item in response.data))

    def test_presets_produce_ranges(self):
        self.client.force_authenticate(self.manager)
        for preset in ('today', 'week', 'month', 'quarter', 'year',
                       'jalali_month', 'jalali_prev_month', 'jalali_year', 'jalali_prev_year'):
            response = self.client.get(f'/api/reports/profit-loss/?preset={preset}')
            self.assertEqual(response.status_code, 200, preset)

    def test_jalali_date_params_accepted(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/reports/sales/?date_from=1403/01/01&date_to=1403/12/29')
        self.assertEqual(response.status_code, 200, response.data)

    def test_reversed_range_is_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/reports/sales/?date_from=2025-05-01&date_to=2025-01-01')
        self.assertEqual(response.status_code, 400)

    def test_invalid_date_is_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/reports/sales/?date_from=hello')
        self.assertEqual(response.status_code, 400)

    def test_compare_adds_previous_period(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/reports/profit-loss/?preset=month&compare=true')
        self.assertIn('previous_period', response.data)

    def test_csv_export(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/reports/export/inventory/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        self.assertIn('attachment', response['Content-Disposition'])

    def test_unknown_export_key_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/reports/export/unknown/')
        self.assertEqual(response.status_code, 400)


class ChequeReportTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.customer = Party.objects.create(name='مشتری', party_type=PartyType.CUSTOMER)
        self.today = date.today()

        for index, (direction, status) in enumerate([
            (ChequeDirection.RECEIVABLE, None),
            (ChequeDirection.RECEIVABLE, ChequeStatus.CLEARED),
            (ChequeDirection.PAYABLE, None),
            (ChequeDirection.PAYABLE, ChequeStatus.BOUNCED),
        ]):
            cheque = Cheque.objects.create(
                direction=direction, serial_number=f'CH{index}', bank_name='melli',
                amount=Decimal('1000000'), issue_date=self.today - timedelta(days=20),
                due_date=self.today + timedelta(days=10), party=self.customer,
                created_by=self.user,
            )
            sync_cheque_ledger(cheque, user=self.user)
            if status:
                change_status(cheque, status, user=self.user, event_date=self.today)

    def test_cheque_report_totals(self):
        report = services.cheque_report(self.today - timedelta(days=30),
                                        self.today + timedelta(days=30))
        self.assertEqual(report['receivable']['count'], 2)
        self.assertEqual(report['payable']['count'], 2)
        self.assertEqual(report['receivable']['cleared_total'], Decimal('1000000'))
        self.assertEqual(report['payable']['bounced_total'], Decimal('1000000'))
        self.assertTrue(report['timeline'])
