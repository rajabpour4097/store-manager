from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from ledger.models import EntryCategory, LedgerEntry, SourceType
from parties.models import Party, PartyType

from .models import Cheque, ChequeDirection, ChequeStatus
from .services import ChequeTransitionError, change_status, extend_cheque, sync_cheque_ledger


class ChequeModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.customer = Party.objects.create(name='مشتری الف', party_type=PartyType.CUSTOMER)
        self.supplier = Party.objects.create(name='تأمین‌کننده ب', party_type=PartyType.SUPPLIER)
        self.today = date.today()

    def make_cheque(self, direction=ChequeDirection.RECEIVABLE, **kwargs):
        defaults = {
            'direction': direction,
            'serial_number': kwargs.pop('serial_number', '555001'),
            'bank_name': 'mellat',
            'amount': Decimal('10000000'),
            'issue_date': self.today - timedelta(days=10),
            'due_date': self.today + timedelta(days=20),
            'party': self.customer if direction == ChequeDirection.RECEIVABLE else self.supplier,
            'created_by': self.user,
        }
        defaults.update(kwargs)
        cheque = Cheque.objects.create(**defaults)
        sync_cheque_ledger(cheque, user=self.user)
        return cheque

    def test_due_state_classification(self):
        far = self.make_cheque(serial_number='1', due_date=self.today + timedelta(days=100))
        soon = self.make_cheque(serial_number='2', due_date=self.today + timedelta(days=2))
        overdue = self.make_cheque(serial_number='3', due_date=self.today - timedelta(days=5))
        self.assertEqual(far.due_state, 'far')
        self.assertEqual(soon.due_state, 'critical')
        self.assertEqual(overdue.due_state, 'overdue')
        self.assertTrue(overdue.is_overdue)

    def test_receivable_cheque_credits_the_customer(self):
        cheque = self.make_cheque()
        entry = LedgerEntry.objects.get(source_type=SourceType.CHEQUE, source_id=cheque.id,
                                        category=EntryCategory.CHEQUE_RECEIVED)
        self.assertEqual(entry.credit, cheque.amount)
        self.assertEqual(entry.debit, 0)
        self.assertEqual(self.customer.balance, -cheque.amount)

    def test_payable_cheque_without_prior_debt_credits_the_supplier(self):
        cheque = self.make_cheque(direction=ChequeDirection.PAYABLE, serial_number='7001')
        entry = LedgerEntry.objects.get(source_type=SourceType.CHEQUE, source_id=cheque.id,
                                        category=EntryCategory.CHEQUE_ISSUED)
        self.assertEqual(entry.credit, cheque.amount)
        self.assertEqual(entry.debit, 0)
        self.assertEqual(self.supplier.balance, -cheque.amount)

    def test_payable_cheque_with_prior_debt_debits_the_supplier(self):
        LedgerEntry.objects.create(
            party=self.supplier,
            date=self.today,
            debit=0,
            credit=Decimal('15000000'),
            category=EntryCategory.PURCHASE_INVOICE,
        )
        cheque = self.make_cheque(
            direction=ChequeDirection.PAYABLE,
            serial_number='7002',
            amount=Decimal('10000000'),
        )
        entry = LedgerEntry.objects.get(source_type=SourceType.CHEQUE, source_id=cheque.id,
                                        category=EntryCategory.CHEQUE_ISSUED)
        self.assertEqual(entry.debit, cheque.amount)
        self.assertEqual(entry.credit, 0)
        self.assertEqual(self.supplier.balance, Decimal('-5000000'))

    def test_bounced_cheque_reverses_the_original_entry(self):
        cheque = self.make_cheque()
        change_status(cheque, ChequeStatus.BOUNCED, user=self.user)
        cheque.refresh_from_db()
        self.assertEqual(cheque.status, ChequeStatus.BOUNCED)
        self.assertEqual(self.customer.compute_balance(), Decimal('0'))
        self.assertEqual(
            LedgerEntry.objects.filter(source_id=cheque.id,
                                       category=EntryCategory.CHEQUE_BOUNCED).count(), 1)

    def test_recovering_from_bounced_removes_reversal(self):
        cheque = self.make_cheque()
        change_status(cheque, ChequeStatus.BOUNCED, user=self.user)
        change_status(cheque, ChequeStatus.CLEARED, user=self.user)
        cheque.refresh_from_db()
        self.assertEqual(cheque.status, ChequeStatus.CLEARED)
        self.assertFalse(LedgerEntry.objects.filter(
            source_id=cheque.id, category=EntryCategory.CHEQUE_BOUNCED).exists())
        self.assertEqual(self.customer.compute_balance(), -cheque.amount)

    def test_invalid_transition_raises(self):
        cheque = self.make_cheque()
        change_status(cheque, ChequeStatus.CLEARED, user=self.user)
        with self.assertRaises(ChequeTransitionError):
            change_status(cheque, ChequeStatus.SUBMITTED, user=self.user)

    def test_same_status_transition_raises(self):
        cheque = self.make_cheque()
        with self.assertRaises(ChequeTransitionError):
            change_status(cheque, ChequeStatus.IN_PORTFOLIO, user=self.user)

    def test_status_history_is_recorded(self):
        cheque = self.make_cheque()
        change_status(cheque, ChequeStatus.SUBMITTED, user=self.user, note='واگذاری')
        change_status(cheque, ChequeStatus.CLEARED, user=self.user)
        self.assertEqual(cheque.status_history.count(), 2)

    def test_extend_requires_later_date(self):
        cheque = self.make_cheque()
        with self.assertRaises(ChequeTransitionError):
            extend_cheque(cheque, cheque.due_date - timedelta(days=1), user=self.user)
        new_due = cheque.due_date + timedelta(days=30)
        extend_cheque(cheque, new_due, user=self.user)
        cheque.refresh_from_db()
        self.assertEqual(cheque.due_date, new_due)
        self.assertEqual(cheque.status, ChequeStatus.EXTENDED)

    def test_cancelled_cheque_removes_ledger_entries(self):
        cheque = self.make_cheque()
        change_status(cheque, ChequeStatus.CANCELLED, user=self.user)
        self.assertFalse(LedgerEntry.objects.filter(
            source_type=SourceType.CHEQUE, source_id=cheque.id).exists())


class ChequeApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.accountant = User.objects.create_user(username='a', password='x',
                                                   role=Role.ACCOUNTANT)
        self.party = Party.objects.create(name='مشتری', party_type=PartyType.CUSTOMER)
        self.client = APIClient()
        self.today = date.today()

    def payload(self, **kwargs):
        data = {
            'direction': ChequeDirection.RECEIVABLE,
            'serial_number': '900100',
            'bank_name': 'melli',
            'amount': 5_000_000,
            'issue_date': str(self.today),
            'due_date': str(self.today + timedelta(days=30)),
            'party': self.party.id,
        }
        data.update(kwargs)
        return data

    def test_accountant_can_create_but_not_delete(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.post('/api/cheques/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        cheque_id = response.data['id']
        self.assertEqual(self.client.delete(f'/api/cheques/{cheque_id}/').status_code, 403)

        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.delete(f'/api/cheques/{cheque_id}/').status_code, 204)

    def test_due_date_before_issue_date_is_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/cheques/', self.payload(
            issue_date=str(self.today), due_date=str(self.today - timedelta(days=1))), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('سرسید', str(response.data))

    def test_duplicate_serial_is_rejected(self):
        self.client.force_authenticate(self.manager)
        self.client.post('/api/cheques/', self.payload(), format='json')
        response = self.client.post('/api/cheques/', self.payload(), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('ثبت شده است', str(response.data['serial_number'][0]))

    def test_invalid_sayad_id_is_rejected(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/cheques/', self.payload(sayad_id='123'), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('صیادی', str(response.data))

    def test_change_status_endpoint(self):
        self.client.force_authenticate(self.manager)
        created = self.client.post('/api/cheques/', self.payload(), format='json')
        cheque_id = created.data['id']
        response = self.client.post(f'/api/cheques/{cheque_id}/change-status/',
                                    {'status': ChequeStatus.SUBMITTED}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], ChequeStatus.SUBMITTED)

    def test_change_status_rejects_invalid_transition(self):
        self.client.force_authenticate(self.manager)
        created = self.client.post('/api/cheques/', self.payload(), format='json')
        cheque_id = created.data['id']
        self.client.post(f'/api/cheques/{cheque_id}/change-status/',
                         {'status': ChequeStatus.CLEARED}, format='json')
        response = self.client.post(f'/api/cheques/{cheque_id}/change-status/',
                                    {'status': ChequeStatus.SUBMITTED}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_summary_and_calendar_endpoints(self):
        self.client.force_authenticate(self.manager)
        self.client.post('/api/cheques/', self.payload(), format='json')
        summary = self.client.get('/api/cheques/summary/')
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data['receivable']['count'], 1)

        calendar = self.client.get('/api/cheques/calendar/')
        self.assertEqual(calendar.status_code, 200)
        self.assertEqual(len(calendar.data['months']), 1)

    def test_jalali_dates_present_in_response(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/cheques/', self.payload(), format='json')
        self.assertRegex(response.data['due_date_jalali'], r'^\d{4}/\d{2}/\d{2}$')
