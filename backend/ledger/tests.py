from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from parties.models import Party, PartyType

from .models import EntryCategory, FinanceCategory, FinanceRecord, LedgerEntry, SourceType
from .services import build_statement, party_totals, sync_system_entry


class LedgerBalanceTests(TestCase):
    def setUp(self):
        self.party = Party.objects.create(name='طرف تست', party_type=PartyType.CUSTOMER,
                                          opening_balance=Decimal('1000'))
        self.today = date.today()

    def test_opening_balance_counts_towards_balance(self):
        self.assertEqual(self.party.balance, Decimal('1000'))

    def test_debit_increases_and_credit_decreases_balance(self):
        LedgerEntry.objects.create(party=self.party, date=self.today, debit=Decimal('5000'),
                                   category=EntryCategory.SALE_INVOICE)
        LedgerEntry.objects.create(party=self.party, date=self.today, credit=Decimal('2000'),
                                   category=EntryCategory.CASH_RECEIPT)
        self.assertEqual(self.party.balance, Decimal('4000'))
        self.assertEqual(self.party.balance_state, 'debtor')

    def test_creditor_state(self):
        LedgerEntry.objects.create(party=self.party, date=self.today, credit=Decimal('5000'),
                                   category=EntryCategory.CASH_RECEIPT)
        self.assertEqual(self.party.balance, Decimal('-4000'))
        self.assertEqual(self.party.balance_state, 'creditor')
        self.assertEqual(self.party.balance_state_display, 'بستانکار')

    def test_party_totals_respects_date_range(self):
        LedgerEntry.objects.create(party=self.party, date=self.today - timedelta(days=40),
                                   debit=Decimal('3000'))
        LedgerEntry.objects.create(party=self.party, date=self.today, debit=Decimal('7000'))
        totals = party_totals(self.party, date_from=self.today - timedelta(days=5))
        self.assertEqual(totals['opening_balance'], Decimal('4000'))
        self.assertEqual(totals['total_debit'], Decimal('7000'))
        self.assertEqual(totals['closing_balance'], Decimal('11000'))

    def test_statement_running_balance(self):
        LedgerEntry.objects.create(party=self.party, date=self.today - timedelta(days=2),
                                   debit=Decimal('2000'))
        LedgerEntry.objects.create(party=self.party, date=self.today, credit=Decimal('500'))
        statement = build_statement(self.party)
        balances = [row['running_balance'] for row in statement['rows']]
        self.assertEqual(balances, [Decimal('3000'), Decimal('2500')])

    def test_sync_system_entry_is_idempotent(self):
        for _ in range(3):
            sync_system_entry(
                party=self.party, date=self.today, debit=Decimal('9000'),
                category=EntryCategory.SALE_INVOICE, source_type=SourceType.ORDER,
                source_id=42, marker='TEST',
            )
        self.assertEqual(LedgerEntry.objects.filter(source_id=42).count(), 1)
        self.assertEqual(LedgerEntry.objects.get(source_id=42).debit, Decimal('9000'))

    def test_sync_system_entry_with_zero_deletes(self):
        sync_system_entry(party=self.party, date=self.today, debit=Decimal('100'),
                          source_type=SourceType.ORDER, source_id=99, marker='Z')
        sync_system_entry(party=self.party, date=self.today, debit=Decimal('0'),
                          source_type=SourceType.ORDER, source_id=99, marker='Z')
        self.assertFalse(LedgerEntry.objects.filter(source_id=99).exists())


class LedgerApiTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='m', password='x', role=Role.MANAGER)
        self.accountant = User.objects.create_user(username='a', password='x',
                                                   role=Role.ACCOUNTANT)
        self.party = Party.objects.create(name='طرف', party_type=PartyType.CUSTOMER)
        self.client = APIClient()
        self.today = date.today()

    def test_quick_entry_creates_ledger_row(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.post('/api/ledger/entries/quick-entry/', {
            'party': self.party.id, 'date': str(self.today), 'entry_type': 'debit',
            'amount': 250_000, 'category': EntryCategory.ADJUSTMENT, 'description': 'تعدیل',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['debit'], '250000')
        self.assertEqual(response.data['entry_type'], 'debit')

    def test_entry_cannot_be_both_debit_and_credit(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/ledger/entries/', {
            'party': self.party.id, 'date': str(self.today),
            'debit': 100, 'credit': 100,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('بدهکار و بستانکار', str(response.data['non_field_errors'][0]))

    def test_entry_requires_nonzero_amount(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/ledger/entries/', {
            'party': self.party.id, 'date': str(self.today), 'debit': 0, 'credit': 0,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_accountant_cannot_delete_entry(self):
        entry = LedgerEntry.objects.create(party=self.party, date=self.today, debit=100)
        self.client.force_authenticate(self.accountant)
        self.assertEqual(self.client.delete(f'/api/ledger/entries/{entry.id}/').status_code, 403)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.delete(f'/api/ledger/entries/{entry.id}/').status_code, 204)

    def test_system_entry_cannot_be_deleted(self):
        entry = LedgerEntry.objects.create(party=self.party, date=self.today, debit=100,
                                           is_system_generated=True,
                                           source_type=SourceType.ORDER, source_id=1)
        self.client.force_authenticate(self.manager)
        response = self.client.delete(f'/api/ledger/entries/{entry.id}/')
        self.assertEqual(response.status_code, 400)

    def test_filter_by_entry_type(self):
        LedgerEntry.objects.create(party=self.party, date=self.today, debit=100)
        LedgerEntry.objects.create(party=self.party, date=self.today, credit=200)
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/ledger/entries/?entry_type=credit')
        self.assertEqual(response.data['count'], 1)

    def test_finance_record_kind_must_match_category(self):
        category = FinanceCategory.objects.create(name='اجاره',
                                                  kind=FinanceCategory.Kind.EXPENSE)
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/ledger/finance-records/', {
            'kind': FinanceCategory.Kind.INCOME, 'category': category.id,
            'title': 'تست', 'amount': 1000, 'date': str(self.today),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('ندارد', str(response.data['category'][0]))

    def test_finance_summary(self):
        expense_cat = FinanceCategory.objects.create(name='حمل', kind=FinanceCategory.Kind.EXPENSE)
        income_cat = FinanceCategory.objects.create(name='ضایعات', kind=FinanceCategory.Kind.INCOME)
        FinanceRecord.objects.create(kind=FinanceCategory.Kind.EXPENSE, category=expense_cat,
                                     title='ح', amount=3000, date=self.today)
        FinanceRecord.objects.create(kind=FinanceCategory.Kind.INCOME, category=income_cat,
                                     title='ض', amount=1000, date=self.today)
        self.client.force_authenticate(self.manager)
        response = self.client.get('/api/ledger/finance-records/summary/')
        self.assertEqual(response.data['total_expense'], Decimal('3000'))
        self.assertEqual(response.data['net'], Decimal('-2000'))

    def test_category_with_records_cannot_be_deleted(self):
        category = FinanceCategory.objects.create(name='برق', kind=FinanceCategory.Kind.EXPENSE)
        FinanceRecord.objects.create(kind=FinanceCategory.Kind.EXPENSE, category=category,
                                     title='ب', amount=100, date=self.today)
        self.client.force_authenticate(self.manager)
        response = self.client.delete(f'/api/ledger/finance-categories/{category.id}/')
        self.assertEqual(response.status_code, 400)
