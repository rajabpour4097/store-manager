from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import ActivityLog, log_activity
from accounts.permissions import CapabilityPermission
from core.jalali import parse_flexible_date, to_jalali
from ledger.services import build_statement, party_totals

from .models import Party, PartyType
from .serializers import PartySerializer, PartyTypeChoiceSerializer
from .services import PartyDeleteError, delete_party_cascade

ZERO = Value(Decimal('0'), output_field=DecimalField(max_digits=18, decimal_places=0))


def annotate_balance(queryset):
    """محاسبه‌ی مانده حساب در سطح دیتابیس برای جلوگیری از کوئری N+1."""
    return queryset.annotate(
        sum_debit=Coalesce(Sum('ledger_entries__debit'), ZERO),
        sum_credit=Coalesce(Sum('ledger_entries__credit'), ZERO),
    ).annotate(
        cached_balance=F('opening_balance') + F('sum_debit') - F('sum_credit')
    )


class PartyViewSet(viewsets.ModelViewSet):
    serializer_class = PartySerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'parties'
    filterset_fields = ['party_type', 'is_active', 'city']
    search_fields = ['name', 'code', 'mobile', 'phone', 'national_id', 'email']
    ordering_fields = ['name', 'code', 'created_at', 'cached_balance']
    ordering = ['name']

    def get_queryset(self):
        queryset = annotate_balance(Party.objects.all())
        state = self.request.query_params.get('balance_state')
        if state == 'debtor':
            queryset = queryset.filter(cached_balance__gt=0)
        elif state == 'creditor':
            queryset = queryset.filter(cached_balance__lt=0)
        elif state == 'settled':
            queryset = queryset.filter(cached_balance=0)
        return queryset

    def perform_create(self, serializer):
        party = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'Party', party.id,
                     f'ایجاد طرف حساب {party.name}', self.request)

    def perform_update(self, serializer):
        party = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'Party', party.id,
                     f'ویرایش طرف حساب {party.name}', self.request)

    def perform_destroy(self, instance):
        try:
            result = delete_party_cascade(instance, user=self.request.user)
        except PartyDeleteError as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({'detail': str(exc)}) from exc

        log_activity(
            self.request.user,
            ActivityLog.Action.DELETE,
            'Party',
            result['party_id'],
            (
                f'حذف طرف حساب {result["party_name"]} '
                f'({result["deleted_orders"]} سفارش، {result["deleted_cheques"]} چک، '
                f'{result["deleted_ledger_entries"]} سند دفتر)'
            ),
            self.request,
        )

    @action(detail=False, methods=['get'])
    def types(self, request):
        return Response(PartyTypeChoiceSerializer.all_choices())

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """خلاصه‌ی بدهکاران و بستانکاران."""
        queryset = annotate_balance(Party.objects.filter(is_active=True))
        debtors = queryset.filter(cached_balance__gt=0)
        creditors = queryset.filter(cached_balance__lt=0)

        total_debtor = sum((party.cached_balance for party in debtors), Decimal('0'))
        total_creditor = sum((-party.cached_balance for party in creditors), Decimal('0'))

        return Response({
            'total_parties': Party.objects.count(),
            'active_parties': Party.objects.filter(is_active=True).count(),
            'customers': Party.objects.filter(
                Q(party_type=PartyType.CUSTOMER) | Q(party_type=PartyType.BOTH)).count(),
            'suppliers': Party.objects.filter(
                Q(party_type=PartyType.SUPPLIER) | Q(party_type=PartyType.BOTH)).count(),
            'debtor_count': debtors.count(),
            'creditor_count': creditors.count(),
            'total_debtor_amount': total_debtor,
            'total_creditor_amount': total_creditor,
            'net_balance': total_debtor - total_creditor,
            'top_debtors': PartySerializer(
                debtors.order_by('-cached_balance')[:10], many=True).data,
            'top_creditors': PartySerializer(
                creditors.order_by('cached_balance')[:10], many=True).data,
        })

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        """صورتحساب طرف حساب با مانده تجمعی."""
        party = self.get_object()
        date_from = parse_flexible_date(request.query_params.get('date_from'))
        date_to = parse_flexible_date(request.query_params.get('date_to'))

        statement = build_statement(party, date_from=date_from, date_to=date_to)

        rows = [{
            'id': row['entry'].id,
            'date': row['entry'].date,
            'date_jalali': to_jalali(row['entry'].date),
            'category': row['entry'].category,
            'category_display': row['entry'].get_category_display(),
            'document_number': row['entry'].document_number,
            'description': row['entry'].description,
            'debit': row['entry'].debit,
            'credit': row['entry'].credit,
            'running_balance': row['running_balance'],
            'source_type': row['entry'].source_type,
            'source_id': row['entry'].source_id,
        } for row in statement['rows']]

        return Response({
            'party': PartySerializer(party).data,
            'date_from': date_from,
            'date_to': date_to,
            'date_from_jalali': to_jalali(date_from),
            'date_to_jalali': to_jalali(date_to),
            'totals': statement['totals'],
            'rows': rows,
        })

    @action(detail=True, methods=['get'])
    def totals(self, request, pk=None):
        party = self.get_object()
        date_from = parse_flexible_date(request.query_params.get('date_from'))
        date_to = parse_flexible_date(request.query_params.get('date_to'))
        return Response(party_totals(party, date_from=date_from, date_to=date_to))

    @action(detail=False, methods=['get'])
    def aging(self, request):
        """تحلیل سنی مطالبات بر پایه‌ی سرفصل فاکتورهای باز."""
        from datetime import date, timedelta

        from orders.models import Order, OrderStatus, OrderType

        today = date.today()
        buckets = [
            ('current', 'جاری (سرسید نشده)', None, None),
            ('b1_30', '۱ تا ۳۰ روز', 0, 30),
            ('b31_60', '۳۱ تا ۶۰ روز', 31, 60),
            ('b61_90', '۶۱ تا ۹۰ روز', 61, 90),
            ('b90_plus', 'بیش از ۹۰ روز', 91, None),
        ]

        open_orders = Order.objects.filter(
            order_type=OrderType.SALE,
        ).exclude(status__in=[OrderStatus.DRAFT, OrderStatus.CANCELLED]).select_related('party')

        result = {key: {'key': key, 'label': label, 'amount': Decimal('0'), 'count': 0}
                  for key, label, _, _ in buckets}

        for order in open_orders:
            remaining = order.remaining_amount
            if remaining <= 0:
                continue
            due = order.due_date or order.order_date
            overdue_days = (today - due).days
            if overdue_days < 0:
                key = 'current'
            elif overdue_days <= 30:
                key = 'b1_30'
            elif overdue_days <= 60:
                key = 'b31_60'
            elif overdue_days <= 90:
                key = 'b61_90'
            else:
                key = 'b90_plus'
            result[key]['amount'] += remaining
            result[key]['count'] += 1

        return Response({'buckets': [result[key] for key, _, _, _ in buckets]})
