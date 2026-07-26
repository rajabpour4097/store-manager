from collections import OrderedDict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import ActivityLog, log_activity
from accounts.permissions import CapabilityPermission
from core.jalali import jalali_month_label, parse_flexible_date, to_jalali

from .models import (
    FINAL_STATUSES,
    OPEN_STATUSES,
    Cheque,
    ChequeDirection,
    ChequeStatus,
)
from .serializers import (
    ChequeDetailSerializer,
    ChequeExtendSerializer,
    ChequeSerializer,
    ChequeStatusChangeSerializer,
    cheque_choice_options,
)
from .services import ChequeTransitionError, change_status, extend_cheque, sync_cheque_ledger


class ChequeViewSet(viewsets.ModelViewSet):
    permission_classes = [CapabilityPermission]
    capability_prefix = 'cheques'
    filterset_fields = ['direction', 'status', 'party', 'bank_name', 'bank_account']
    search_fields = ['serial_number', 'sayad_id', 'party__name', 'holder_name', 'description']
    ordering_fields = ['due_date', 'issue_date', 'amount', 'created_at']
    ordering = ['due_date']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ChequeDetailSerializer
        return ChequeSerializer

    def get_queryset(self):
        queryset = Cheque.objects.select_related('party', 'created_by', 'bank_account', 'order')
        params = self.request.query_params

        due_from = parse_flexible_date(params.get('due_from'))
        due_to = parse_flexible_date(params.get('due_to'))
        if due_from:
            queryset = queryset.filter(due_date__gte=due_from)
        if due_to:
            queryset = queryset.filter(due_date__lte=due_to)

        issue_from = parse_flexible_date(params.get('issue_from'))
        issue_to = parse_flexible_date(params.get('issue_to'))
        if issue_from:
            queryset = queryset.filter(issue_date__gte=issue_from)
        if issue_to:
            queryset = queryset.filter(issue_date__lte=issue_to)

        state = params.get('state')
        if state == 'open':
            queryset = queryset.filter(status__in=OPEN_STATUSES)
        elif state == 'closed':
            queryset = queryset.filter(status__in=FINAL_STATUSES)
        elif state == 'overdue':
            queryset = queryset.filter(status__in=OPEN_STATUSES, due_date__lt=date.today())
        elif state == 'upcoming':
            queryset = queryset.filter(
                status__in=OPEN_STATUSES,
                due_date__gte=date.today(),
                due_date__lte=date.today() + timedelta(days=30),
            )
        elif state == 'bounced':
            queryset = queryset.filter(status=ChequeStatus.BOUNCED)

        min_amount = params.get('min_amount')
        max_amount = params.get('max_amount')
        if min_amount:
            queryset = queryset.filter(amount__gte=min_amount)
        if max_amount:
            queryset = queryset.filter(amount__lte=max_amount)

        return queryset

    def perform_create(self, serializer):
        cheque = serializer.save(created_by=self.request.user, status=ChequeStatus.IN_PORTFOLIO)
        sync_cheque_ledger(cheque, user=self.request.user)
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'Cheque', cheque.id,
                     f'ثبت {cheque.get_direction_display()} چک {cheque.serial_number}', self.request)

    def perform_update(self, serializer):
        cheque = serializer.save()
        sync_cheque_ledger(cheque, user=self.request.user)
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'Cheque', cheque.id,
                     f'ویرایش چک {cheque.serial_number}', self.request)

    def perform_destroy(self, instance):
        from ledger.models import SourceType
        from ledger.services import delete_system_entries

        delete_system_entries(source_type=SourceType.CHEQUE, source_id=instance.id)
        log_activity(self.request.user, ActivityLog.Action.DELETE, 'Cheque', instance.id,
                     f'حذف چک {instance.serial_number}', self.request)
        instance.delete()

    # ------------------------------------------------------------------
    @action(detail=False, methods=['get'])
    def options(self, request):
        return Response(cheque_choice_options())

    @action(detail=True, methods=['post'], url_path='change-status')
    def change_status_action(self, request, pk=None):
        cheque = self.get_object()
        serializer = ChequeStatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            change_status(
                cheque,
                serializer.validated_data['status'],
                user=request.user,
                event_date=serializer.validated_data.get('event_date'),
                note=serializer.validated_data.get('note', ''),
            )
        except ChequeTransitionError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)

        log_activity(request.user, ActivityLog.Action.STATUS, 'Cheque', cheque.id,
                     f'تغییر وضعیت چک {cheque.serial_number} به {cheque.get_status_display()}', request)
        return Response(ChequeDetailSerializer(cheque).data)

    @action(detail=True, methods=['post'])
    def extend(self, request, pk=None):
        cheque = self.get_object()
        serializer = ChequeExtendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            extend_cheque(
                cheque,
                serializer.validated_data['due_date'],
                user=request.user,
                note=serializer.validated_data.get('note', ''),
            )
        except ChequeTransitionError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)

        log_activity(request.user, ActivityLog.Action.STATUS, 'Cheque', cheque.id,
                     f'تمدید سرسید چک {cheque.serial_number}', request)
        return Response(ChequeDetailSerializer(cheque).data)

    # ------------------------------------------------------------------
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """خلاصه‌ی وضعیت چک‌ها به تفکیک پرداختی/دریافتی."""
        today = date.today()
        base = self.get_queryset()

        def side_summary(direction):
            queryset = base.filter(direction=direction)
            open_qs = queryset.filter(status__in=OPEN_STATUSES)
            return {
                'count': queryset.count(),
                'total_amount': queryset.aggregate(t=Sum('amount'))['t'] or Decimal('0'),
                'open_count': open_qs.count(),
                'open_amount': open_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0'),
                'overdue_count': open_qs.filter(due_date__lt=today).count(),
                'overdue_amount': open_qs.filter(due_date__lt=today).aggregate(
                    t=Sum('amount'))['t'] or Decimal('0'),
                'due_7_days': open_qs.filter(
                    due_date__gte=today, due_date__lte=today + timedelta(days=7)
                ).aggregate(t=Sum('amount'))['t'] or Decimal('0'),
                'due_30_days': open_qs.filter(
                    due_date__gte=today, due_date__lte=today + timedelta(days=30)
                ).aggregate(t=Sum('amount'))['t'] or Decimal('0'),
                'cleared_amount': queryset.filter(status=ChequeStatus.CLEARED).aggregate(
                    t=Sum('amount'))['t'] or Decimal('0'),
                'bounced_count': queryset.filter(status=ChequeStatus.BOUNCED).count(),
                'bounced_amount': queryset.filter(status=ChequeStatus.BOUNCED).aggregate(
                    t=Sum('amount'))['t'] or Decimal('0'),
            }

        payable = side_summary(ChequeDirection.PAYABLE)
        receivable = side_summary(ChequeDirection.RECEIVABLE)

        by_status = (
            base.values('direction', 'status')
            .annotate(count=Count('id'), total=Sum('amount'))
            .order_by('direction', 'status')
        )
        status_labels = dict(ChequeStatus.choices)

        return Response({
            'payable': payable,
            'receivable': receivable,
            'net_open_position': receivable['open_amount'] - payable['open_amount'],
            'by_status': [{
                'direction': row['direction'],
                'status': row['status'],
                'status_display': status_labels.get(row['status'], row['status']),
                'count': row['count'],
                'total': row['total'] or Decimal('0'),
            } for row in by_status],
        })

    @action(detail=False, methods=['get'])
    def calendar(self, request):
        """تقویم سرسید چک‌ها، گروه‌بندی‌شده بر اساس ماه شمسی."""
        months = int(request.query_params.get('months', 6))
        today = date.today()
        end = today + timedelta(days=months * 31)

        queryset = (
            Cheque.objects.select_related('party')
            .filter(status__in=OPEN_STATUSES, due_date__lte=end)
            .order_by('due_date')
        )

        grouped: OrderedDict[str, dict] = OrderedDict()
        for cheque in queryset:
            key = jalali_month_label(cheque.due_date)
            bucket = grouped.setdefault(key, {
                'month': key,
                'payable_amount': Decimal('0'),
                'receivable_amount': Decimal('0'),
                'payable_count': 0,
                'receivable_count': 0,
                'items': [],
            })
            if cheque.direction == ChequeDirection.PAYABLE:
                bucket['payable_amount'] += cheque.amount
                bucket['payable_count'] += 1
            else:
                bucket['receivable_amount'] += cheque.amount
                bucket['receivable_count'] += 1
            bucket['items'].append({
                'id': cheque.id,
                'direction': cheque.direction,
                'serial_number': cheque.serial_number,
                'amount': cheque.amount,
                'due_date': cheque.due_date,
                'due_date_jalali': to_jalali(cheque.due_date),
                'party_name': cheque.party.name,
                'status': cheque.status,
                'status_display': cheque.get_status_display(),
                'due_state': cheque.due_state,
            })

        for bucket in grouped.values():
            bucket['net'] = bucket['receivable_amount'] - bucket['payable_amount']

        return Response({'months': list(grouped.values())})

    @action(detail=False, methods=['get'])
    def alerts(self, request):
        """هشدارهای چک: سرسید گذشته و نزدیک."""
        today = date.today()
        open_qs = Cheque.objects.select_related('party').filter(status__in=OPEN_STATUSES)

        overdue = open_qs.filter(due_date__lt=today).order_by('due_date')[:20]
        soon = open_qs.filter(
            due_date__gte=today, due_date__lte=today + timedelta(days=7)
        ).order_by('due_date')[:20]

        return Response({
            'overdue': ChequeSerializer(overdue, many=True).data,
            'due_soon': ChequeSerializer(soon, many=True).data,
            'overdue_count': open_qs.filter(due_date__lt=today).count(),
            'due_soon_count': open_qs.filter(
                due_date__gte=today, due_date__lte=today + timedelta(days=7)).count(),
        })
