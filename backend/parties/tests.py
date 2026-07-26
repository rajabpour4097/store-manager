from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from catalog.models import Product, StockMovement
from catalog.services import apply_movement
from ledger.models import EntryCategory, LedgerEntry
from orders.models import Order, OrderItem, OrderType
from orders.services import confirm_order

from .models import Party, PartyType


class PartyModelTests(TestCase):
    def test_code_is_auto_generated(self):
        party = Party.objects.create(name='طرف الف')
        self.assertTrue(party.code.startswith('P'))

    def test_balance_with_opening_and_entries(self):
        party = Party.objects.create(name='طرف ب', opening_balance=Decimal('500'))
        LedgerEntry.objects.create(party=party, date=date.today(), debit=Decimal('1500'))
        LedgerEntry.objects.create(party=party, date=date.today(), credit=Decimal('300'))
        self.assertEqual(party.balance, Decimal('1700'))

    def test_compute_balance_until_date(self):
        party = Party.objects.create(name='طرف ج')
        LedgerEntry.objects.create(party=party, date=date.today() - timedelta(days=10),
                                   debit=Decimal('100'))
        LedgerEntry.objects.create(party=party, date=date.today(), debit=Decimal('200'))
        self.assertEqual(party.compute_balance(until=date.today() - timedelta(days=5)),
                         Decimal('100'))


class PartyApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.accountant = User.objects.create_user(username='a', password='x',
                                                   role=Role.ACCOUNTANT)
        self.client = APIClient()

    def test_create_and_validate(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.post('/api/parties/', {
            'name': 'فروشگاه نمونه', 'party_type': PartyType.CUSTOMER, 'mobile': '09120000000',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['balance_state'], 'settled')

    def test_short_name_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/parties/', {'name': 'ا'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_non_numeric_national_id_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/parties/', {
            'name': 'شرکت الف', 'national_id': 'abc123',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_balance_state_filter(self):
        debtor = Party.objects.create(name='بدهکار')
        creditor = Party.objects.create(name='بستانکار')
        LedgerEntry.objects.create(party=debtor, date=date.today(), debit=Decimal('1000'))
        LedgerEntry.objects.create(party=creditor, date=date.today(), credit=Decimal('1000'))

        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.get('/api/parties/?balance_state=debtor').data['count'], 1)
        self.assertEqual(self.client.get('/api/parties/?balance_state=creditor').data['count'], 1)

    def test_summary_totals(self):
        debtor = Party.objects.create(name='بدهکار')
        creditor = Party.objects.create(name='بستانکار')
        LedgerEntry.objects.create(party=debtor, date=date.today(), debit=Decimal('3000'))
        LedgerEntry.objects.create(party=creditor, date=date.today(), credit=Decimal('1000'))

        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/parties/summary/')
        self.assertEqual(response.data['total_debtor_amount'], Decimal('3000'))
        self.assertEqual(response.data['total_creditor_amount'], Decimal('1000'))
        self.assertEqual(response.data['net_balance'], Decimal('2000'))

    def test_statement_endpoint(self):
        party = Party.objects.create(name='طرف', opening_balance=Decimal('1000'))
        LedgerEntry.objects.create(party=party, date=date.today(), debit=Decimal('500'),
                                   category=EntryCategory.SALE_INVOICE)
        self.client.force_authenticate(self.manager)
        response = self.client.get(f'/api/parties/{party.id}/statement/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['totals']['opening_balance'], Decimal('1000'))
        self.assertEqual(response.data['rows'][0]['running_balance'], Decimal('1500'))
        self.assertIn('date_jalali', response.data['rows'][0])

    def test_statement_respects_date_filters(self):
        party = Party.objects.create(name='طرف')
        LedgerEntry.objects.create(party=party, date=date.today() - timedelta(days=40),
                                   debit=Decimal('700'))
        LedgerEntry.objects.create(party=party, date=date.today(), debit=Decimal('300'))
        self.client.force_authenticate(self.manager)
        response = self.client.get(
            f'/api/parties/{party.id}/statement/?date_from={date.today() - timedelta(days=5)}')
        self.assertEqual(len(response.data['rows']), 1)
        self.assertEqual(response.data['totals']['opening_balance'], Decimal('700'))

    def test_accountant_cannot_delete_party(self):
        party = Party.objects.create(name='طرف')
        self.client.force_authenticate(self.accountant)
        self.assertEqual(self.client.delete(f'/api/parties/{party.id}/').status_code, 403)

    def test_aging_report(self):
        customer = Party.objects.create(name='مشتری', party_type=PartyType.CUSTOMER)
        product = Product.objects.create(name='کالا', purchase_price=100, sale_price=200)
        apply_movement(product=product, date=date.today(), quantity=Decimal('100'),
                       reason=StockMovement.Reason.INITIAL)

        order = Order.objects.create(order_type=OrderType.SALE, party=customer,
                                     order_date=date.today() - timedelta(days=45),
                                     due_date=date.today() - timedelta(days=40))
        OrderItem.objects.create(order=order, product=product, quantity=Decimal('10'),
                                 unit_price=200, unit_cost=100)
        order.recalculate()
        confirm_order(order, user=self.manager)

        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/parties/aging/')
        self.assertEqual(response.status_code, 200)
        buckets = {row['key']: row for row in response.data['buckets']}
        self.assertEqual(buckets['b31_60']['count'], 1)
        self.assertEqual(buckets['b31_60']['amount'], Decimal('2000'))
