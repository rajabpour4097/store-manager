from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.models import ActivityLog, log_activity
from accounts.permissions import CapabilityPermission, IsManagerOrReadOnly
from core.jalali import parse_flexible_date, to_jalali

from .models import BankAccount, EntryCategory, FinanceCategory, FinanceRecord, LedgerEntry
from .serializers import (
    BankAccountSerializer,
    FinanceCategorySerializer,
    FinanceRecordSerializer,
    LedgerEntrySerializer,
    SimpleLedgerEntrySerializer,
)


class BankAccountViewSet(viewsets.ModelViewSet):
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    permission_classes = [IsManagerOrReadOnly]
    search_fields = ['title', 'bank_name', 'account_number', 'iban']
    filterset_fields = ['is_active']


class LedgerEntryViewSet(viewsets.ModelViewSet):
    serializer_class = LedgerEntrySerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'ledger'
    filterset_fields = ['party', 'category', 'source_type', 'is_system_generated', 'bank_account']
    search_fields = ['description', 'document_number', 'party__name']
    ordering_fields = ['date', 'created_at', 'debit', 'credit']
    ordering = ['-date', '-id']

    def get_queryset(self):
        queryset = LedgerEntry.objects.select_related('party', 'created_by', 'bank_account')
        params = self.request.query_params

        date_from = parse_flexible_date(params.get('date_from'))
        date_to = parse_flexible_date(params.get('date_to'))
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        entry_type = params.get('entry_type')
        if entry_type == 'debit':
            queryset = queryset.filter(debit__gt=0)
        elif entry_type == 'credit':
            queryset = queryset.filter(credit__gt=0)

        min_amount = params.get('min_amount')
        if min_amount:
            queryset = queryset.filter(debit__gte=min_amount) | queryset.filter(credit__gte=min_amount)

        return queryset

    def perform_create(self, serializer):
        entry = serializer.save(created_by=self.request.user)
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'LedgerEntry', entry.id,
                     f'ثبت سند برای {entry.party.name}', self.request)

    def perform_update(self, serializer):
        entry = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'LedgerEntry', entry.id,
                     f'ویرایش سند {entry.id}', self.request)

    def perform_destroy(self, instance):
        if instance.is_system_generated:
            raise ValidationError({'detail': 'سند سیستمی را نمی‌توان مستقیماً حذف کرد؛ '
                                             'ابتدا سفارش یا چک مرتبط را اصلاح کنید.'})
        log_activity(self.request.user, ActivityLog.Action.DELETE, 'LedgerEntry', instance.id,
                     f'حذف سند {instance.id}', self.request)
        instance.delete()

    @action(detail=False, methods=['post'], url_path='quick-entry')
    def quick_entry(self, request):
        serializer = SimpleLedgerEntrySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        entry = serializer.save()
        log_activity(request.user, ActivityLog.Action.CREATE, 'LedgerEntry', entry.id,
                     f'ثبت سریع سند برای {entry.party.name}', request)
        return Response(LedgerEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def categories(self, request):
        return Response([{'value': value, 'label': label} for value, label in EntryCategory.choices])

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset()
        totals = queryset.aggregate(debit=Sum('debit'), credit=Sum('credit'), count=Count('id'))
        debit = totals['debit'] or Decimal('0')
        credit = totals['credit'] or Decimal('0')

        by_category = (
            queryset.values('category')
            .annotate(debit=Sum('debit'), credit=Sum('credit'), count=Count('id'))
            .order_by('-count')
        )
        labels = dict(EntryCategory.choices)

        return Response({
            'count': totals['count'] or 0,
            'total_debit': debit,
            'total_credit': credit,
            'net': debit - credit,
            'by_category': [{
                'category': row['category'],
                'category_display': labels.get(row['category'], row['category']),
                'debit': row['debit'] or Decimal('0'),
                'credit': row['credit'] or Decimal('0'),
                'count': row['count'],
            } for row in by_category],
        })


class FinanceCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = FinanceCategorySerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'ledger'
    filterset_fields = ['kind', 'is_active']
    search_fields = ['name', 'description']
    ordering = ['kind', 'name']

    def get_queryset(self):
        return FinanceCategory.objects.annotate(records_count=Count('records'))

    def perform_destroy(self, instance):
        if instance.records.exists():
            raise ValidationError({'detail': 'این دسته‌بندی رکورد ثبت‌شده دارد و قابل حذف نیست.'})
        instance.delete()


class FinanceRecordViewSet(viewsets.ModelViewSet):
    serializer_class = FinanceRecordSerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'ledger'
    filterset_fields = ['kind', 'category', 'payment_method', 'party', 'bank_account']
    search_fields = ['title', 'description']
    ordering_fields = ['date', 'amount', 'created_at']
    ordering = ['-date', '-id']

    def get_queryset(self):
        queryset = FinanceRecord.objects.select_related('category', 'party', 'created_by', 'bank_account')
        date_from = parse_flexible_date(self.request.query_params.get('date_from'))
        date_to = parse_flexible_date(self.request.query_params.get('date_to'))
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        return queryset

    def perform_create(self, serializer):
        record = serializer.save(created_by=self.request.user)
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'FinanceRecord', record.id,
                     f'{record.get_kind_display()}: {record.title}', self.request)

    def perform_update(self, serializer):
        record = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'FinanceRecord', record.id,
                     f'ویرایش {record.title}', self.request)

    def perform_destroy(self, instance):
        log_activity(self.request.user, ActivityLog.Action.DELETE, 'FinanceRecord', instance.id,
                     f'حذف {instance.title}', self.request)
        instance.delete()

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset()
        expenses = queryset.filter(kind=FinanceCategory.Kind.EXPENSE)
        incomes = queryset.filter(kind=FinanceCategory.Kind.INCOME)

        total_expense = expenses.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        total_income = incomes.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        by_category = (
            queryset.values('category__name', 'kind')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )

        return Response({
            'total_expense': total_expense,
            'total_income': total_income,
            'net': total_income - total_expense,
            'expense_count': expenses.count(),
            'income_count': incomes.count(),
            'by_category': [{
                'name': row['category__name'],
                'kind': row['kind'],
                'total': row['total'],
                'count': row['count'],
            } for row in by_category],
        })
