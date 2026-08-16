from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from parties.models import Party, PartyType

from .models import Product, ProductCategory, ProductDefect, StockMovement
from .services import apply_movement, inventory_products, revert_movements


class ProductModelTests(TestCase):
    def setUp(self):
        self.category = ProductCategory.objects.create(name='لبنیات')

    def test_sku_is_auto_generated(self):
        product = Product.objects.create(name='شیر', purchase_price=100, sale_price=150)
        self.assertTrue(product.sku.startswith('SKU'))

    def test_profit_margin(self):
        product = Product.objects.create(name='پنیر', purchase_price=800, sale_price=1000)
        self.assertEqual(product.profit_margin, Decimal('20.00'))

    def test_stock_states(self):
        product = Product.objects.create(name='ماست', purchase_price=1, sale_price=2,
                                         reorder_point=Decimal('10'))
        self.assertEqual(product.stock_state, 'out_of_stock')

        apply_movement(product=product, date=date.today(), quantity=Decimal('5'),
                       reason=StockMovement.Reason.INITIAL)
        product.refresh_from_db()
        self.assertEqual(product.stock_state, 'low')

        apply_movement(product=product, date=date.today(), quantity=Decimal('20'),
                       reason=StockMovement.Reason.PURCHASE)
        product.refresh_from_db()
        self.assertEqual(product.stock_state, 'ok')

    def test_stock_value(self):
        product = Product.objects.create(name='کره', purchase_price=1000, sale_price=1500)
        apply_movement(product=product, date=date.today(), quantity=Decimal('7'),
                       reason=StockMovement.Reason.INITIAL)
        product.refresh_from_db()
        self.assertEqual(product.stock_value, Decimal('7000'))


class StockServiceTests(TestCase):
    def setUp(self):
        self.product = Product.objects.create(name='کالا', purchase_price=500, sale_price=800)

    def test_movement_records_balance_after(self):
        first = apply_movement(product=self.product, date=date.today(), quantity=Decimal('10'),
                               reason=StockMovement.Reason.INITIAL)
        second = apply_movement(product=self.product, date=date.today(), quantity=Decimal('-4'),
                                reason=StockMovement.Reason.SALE)
        self.assertEqual(first.balance_after, Decimal('10.00'))
        self.assertEqual(second.balance_after, Decimal('6.00'))
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('6.00'))

    def test_revert_movements_restores_stock(self):
        apply_movement(product=self.product, date=date.today(), quantity=Decimal('30'),
                       reason=StockMovement.Reason.PURCHASE, source_type='order', source_id=5)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('30.00'))

        revert_movements(source_type='order', source_id=5)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('0.00'))
        self.assertFalse(StockMovement.objects.filter(source_id=5).exists())


class CatalogApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.accountant = User.objects.create_user(username='a', password='x',
                                                   role=Role.ACCOUNTANT)
        self.category = ProductCategory.objects.create(name='نوشیدنی')
        self.client = APIClient()

    def test_create_product(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.post('/api/catalog/products/', {
            'name': 'چای', 'category': self.category.id, 'unit': 'piece',
            'purchase_price': 1000, 'sale_price': 1400, 'reorder_point': 5,
            'lead_time_days': 10,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['stock_state'], 'out_of_stock')

    def test_accountant_cannot_delete_product(self):
        product = Product.objects.create(name='قهوه', purchase_price=1, sale_price=2)
        self.client.force_authenticate(self.accountant)
        self.assertEqual(
            self.client.delete(f'/api/catalog/products/{product.id}/').status_code, 403)
        self.client.force_authenticate(self.manager)
        self.assertEqual(
            self.client.delete(f'/api/catalog/products/{product.id}/').status_code, 204)

    def test_stock_state_filter(self):
        low = Product.objects.create(name='کم', purchase_price=1, sale_price=2,
                                     reorder_point=Decimal('10'))
        apply_movement(product=low, date=date.today(), quantity=Decimal('5'),
                       reason=StockMovement.Reason.INITIAL)
        Product.objects.create(name='صفر', purchase_price=1, sale_price=2)

        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get(
            '/api/catalog/products/?stock_state=low').data['count'], 1)
        self.assertEqual(self.client.get(
            '/api/catalog/products/?stock_state=out_of_stock').data['count'], 1)

    def test_stock_adjustment_endpoint(self):
        product = Product.objects.create(name='شکر', purchase_price=1, sale_price=2)
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/catalog/stock-movements/adjust/', {
            'product': product.id, 'date': str(date.today()), 'quantity': '15',
            'reason': StockMovement.Reason.ADJUSTMENT, 'description': 'شمارش انبار',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, Decimal('15.00'))

    def test_zero_adjustment_rejected(self):
        product = Product.objects.create(name='نمک', purchase_price=1, sale_price=2)
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/catalog/stock-movements/adjust/', {
            'product': product.id, 'date': str(date.today()), 'quantity': '0',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_category_with_products_cannot_be_deleted(self):
        Product.objects.create(name='آب', purchase_price=1, sale_price=2, category=self.category)
        self.client.force_authenticate(self.manager)
        response = self.client.delete(f'/api/catalog/categories/{self.category.id}/')
        self.assertEqual(response.status_code, 400)

    def test_summary_endpoint(self):
        Product.objects.create(name='آبمیوه', purchase_price=100, sale_price=150)
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/catalog/products/summary/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_products'], 1)
        self.assertEqual(response.data['out_of_stock'], 1)


class ProductDefectApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.supplier = Party.objects.create(name='شرکت نمونه', party_type=PartyType.SUPPLIER)
        self.product = Product.objects.create(
            name='یخچال', purchase_price=1000, sale_price=1500,
            default_supplier=self.supplier, stock_quantity=Decimal('3'),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def test_create_defect_and_exclude_from_inventory(self):
        response = self.client.post('/api/catalog/defects/', {
            'product': self.product.id,
            'reason': 'کمپرسور خراب',
            'description': 'نیاز به تعمیر',
            'registered_at': str(date.today()),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['supplier_name'], 'شرکت نمونه')
        self.assertEqual(response.data['status'], ProductDefect.Status.OPEN)
        self.assertFalse(inventory_products().filter(id=self.product.id).exists())

        summary = self.client.get('/api/catalog/products/summary/')
        self.assertEqual(summary.data['active_products'], 0)

    def test_cannot_create_duplicate_open_defect(self):
        ProductDefect.objects.create(
            product=self.product, reason='خرابی', registered_at=date.today())
        response = self.client.post('/api/catalog/defects/', {
            'product': self.product.id,
            'reason': 'دوباره',
            'registered_at': str(date.today()),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_repair_returns_to_inventory(self):
        defect = ProductDefect.objects.create(
            product=self.product, reason='خرابی', registered_at=date.today())
        response = self.client.post(f'/api/catalog/defects/{defect.id}/repair/', {
            'description': 'تعمیر شد',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], ProductDefect.Status.REPAIRED)
        self.assertTrue(inventory_products().filter(id=self.product.id).exists())


class ProductSerialApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.product = Product.objects.create(name='جاروبرقی فالکو', purchase_price=1, sale_price=2)
        from .models import ProductSerial
        ProductSerial.objects.create(product=self.product, serial_number='FALCO-10')
        ProductSerial.objects.create(product=self.product, serial_number='FALCO-11',
                                     status=ProductSerial.Status.SOLD)
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def test_search_by_serial_or_product_name(self):
        by_serial = self.client.get('/api/catalog/serials/', {'search': 'FALCO-10'})
        self.assertEqual(by_serial.data['count'], 1)
        by_name = self.client.get('/api/catalog/serials/', {'search': 'فالکو', 'status': 'in_stock'})
        self.assertEqual(by_name.data['count'], 1)
        self.assertEqual(by_name.data['results'][0]['serial_number'], 'FALCO-10')
