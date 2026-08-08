from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.http import HttpResponse
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import ActivityLog, log_activity
from accounts.permissions import CapabilityPermission, has_capability
from core.jalali import parse_flexible_date, to_jalali
from parties.models import Party

from .importers import ImportError_, build_sample_csv, import_sales_csv
from .ocr_providers import ocr_capabilities
from .invoice_parser import InvoiceParseError, build_items_from_client, parse_invoice_image
from .models import (
    EntryMode,
    Order,
    OrderStatus,
    OrderType,
    OcrStatus,
    PaymentStatus,
    PurchaseSuggestion,
    SalesHistory,
    SalesImportBatch,
)
from .serializers import (
    GenerateSuggestionsSerializer,
    InvoiceUploadSerializer,
    OrderCancelSerializer,
    OrderListSerializer,
    OrderPaymentSerializer,
    OrderSerializer,
    PurchaseSuggestionSerializer,
    SalesHistorySerializer,
    SalesImportBatchSerializer,
    SalesImportSerializer,
    SuggestionToOrderSerializer,
    order_options,
)
from .services import (
    OrderError,
    cancel_order,
    complete_order,
    confirm_order,
    create_order_from_invoice,
    create_order_from_suggestion,
    refresh_order,
    register_payment,
)
from .suggestions import analyze_product, generate_suggestions


class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [CapabilityPermission]
    capability_prefix = 'orders'
    filterset_fields = ['order_type', 'status', 'payment_status', 'party', 'entry_mode']
    search_fields = ['number', 'party__name', 'description']
    ordering_fields = ['order_date', 'total_amount', 'created_at', 'due_date']
    ordering = ['-order_date', '-id']

    def get_serializer_class(self):
        if self.action == 'list':
            return OrderListSerializer
        return OrderSerializer

    def get_queryset(self):
        queryset = (
            Order.objects
            .select_related('party', 'created_by', 'confirmed_by')
            .prefetch_related('items__product')
        )
        params = self.request.query_params

        date_from = parse_flexible_date(params.get('date_from'))
        date_to = parse_flexible_date(params.get('date_to'))
        if date_from:
            queryset = queryset.filter(order_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(order_date__lte=date_to)

        if params.get('unpaid') == 'true':
            queryset = queryset.filter(
                paid_amount__lt=F('total_amount')
            ).exclude(status__in=[OrderStatus.DRAFT, OrderStatus.CANCELLED])

        if params.get('overdue') == 'true':
            queryset = queryset.filter(
                due_date__lt=date.today(), paid_amount__lt=F('total_amount')
            ).exclude(status__in=[OrderStatus.DRAFT, OrderStatus.CANCELLED])

        return queryset

    def perform_create(self, serializer):
        order = serializer.save(created_by=self.request.user)
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'Order', order.id,
                     f'ایجاد {order.get_order_type_display()} {order.number}', self.request)

    def perform_update(self, serializer):
        order = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'Order', order.id,
                     f'ویرایش سفارش {order.number}', self.request)

    def perform_destroy(self, instance):
        if instance.status not in (OrderStatus.DRAFT, OrderStatus.CANCELLED):
            raise ValidationError({'detail': 'فقط سفارش پیش‌نویس یا لغو‌شده قابل حذف است. '
                                             'ابتدا سفارش را لغو کنید.'})
        log_activity(self.request.user, ActivityLog.Action.DELETE, 'Order', instance.id,
                     f'حذف سفارش {instance.number}', self.request)
        instance.delete()

    # ------------------------------------------------------------------
    def _require(self, capability):
        if not has_capability(self.request.user, capability):
            raise PermissionDenied('برای این عملیات دسترسی مدیر لازم است.')

    @action(detail=False, methods=['get'])
    def options(self, request):
        return Response(order_options())

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        self._require('orders.confirm')
        order = self.get_object()
        try:
            confirm_order(order, user=request.user)
        except OrderError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        log_activity(request.user, ActivityLog.Action.STATUS, 'Order', order.id,
                     f'تأیید سفارش {order.number}', request)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        self._require('orders.confirm')
        order = self.get_object()
        try:
            complete_order(order, user=request.user)
        except OrderError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        log_activity(request.user, ActivityLog.Action.STATUS, 'Order', order.id,
                     f'تکمیل سفارش {order.number}', request)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        self._require('orders.confirm')
        order = self.get_object()
        serializer = OrderCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cancel_order(order, user=request.user, reason=serializer.validated_data.get('reason', ''))
        except OrderError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        log_activity(request.user, ActivityLog.Action.STATUS, 'Order', order.id,
                     f'لغو سفارش {order.number}', request)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='register-payment')
    def register_payment_action(self, request, pk=None):
        order = self.get_object()
        serializer = OrderPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            register_payment(order, serializer.validated_data['amount'], user=request.user)
        except OrderError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        log_activity(request.user, ActivityLog.Action.UPDATE, 'Order', order.id,
                     f'ثبت پرداخت برای سفارش {order.number}', request)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        order = self.get_object()
        refresh_order(order, user=request.user)
        return Response(OrderSerializer(order).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset()
        active = queryset.exclude(status__in=[OrderStatus.CANCELLED])

        def side(order_type):
            side_qs = active.filter(order_type=order_type)
            totals = side_qs.aggregate(
                total=Sum('total_amount'), paid=Sum('paid_amount'), cost=Sum('cost_amount'))
            total = totals['total'] or Decimal('0')
            paid = totals['paid'] or Decimal('0')
            return {
                'count': side_qs.count(),
                'draft_count': side_qs.filter(status=OrderStatus.DRAFT).count(),
                'automatic_count': side_qs.filter(entry_mode=EntryMode.AUTOMATIC).count(),
                'manual_count': side_qs.filter(entry_mode=EntryMode.MANUAL).count(),
                'total_amount': total,
                'paid_amount': paid,
                'remaining_amount': total - paid,
                'cost_amount': totals['cost'] or Decimal('0'),
            }

        return Response({
            'sale': side(OrderType.SALE),
            'purchase': side(OrderType.PURCHASE),
            'cancelled_count': queryset.filter(status=OrderStatus.CANCELLED).count(),
            'overdue_count': active.filter(
                due_date__lt=date.today(), paid_amount__lt=F('total_amount')).count(),
            'pending_suggestions': PurchaseSuggestion.objects.filter(
                status=PurchaseSuggestion.Status.PENDING).count(),
            'automatic_total': active.filter(entry_mode=EntryMode.AUTOMATIC).count(),
            'manual_total': active.filter(entry_mode=EntryMode.MANUAL).count(),
        })

    @action(detail=False, methods=['post'], url_path='upload-invoice',
            parser_classes=[MultiPartParser, FormParser])
    def upload_invoice(self, request):
        if not has_capability(request.user, 'orders.upload_invoice'):
            raise PermissionDenied('دسترسی آپلود فاکتور را ندارید.')

        serializer = InvoiceUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        uploaded = data['image']
        order_type = data['order_type']
        party_id = data.get('party')

        try:
            image_bytes = uploaded.read()
            parsed = parse_invoice_image(
                image_bytes,
                order_type=order_type,
                party_id=party_id,
            )
        except InvoiceParseError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)

        parsed_items = [{
            'product_name': item.product_name,
            'product_id': item.product_id,
            'product_code': item.product_code,
            'quantity': str(item.quantity),
            'unit_price': str(item.unit_price),
            'match_score': item.match_score,
            'matched': item.product_id is not None,
        } for item in parsed.items]

        ocr_status = OcrStatus.DONE if parsed.confidence >= 50 else OcrStatus.REVIEW
        payload = {
            'party_name': parsed.party_name,
            'invoice_number': parsed.invoice_number,
            'order_date': parsed.order_date.isoformat() if parsed.order_date else None,
            'total_amount': str(parsed.total_amount) if parsed.total_amount else None,
            'items': parsed_items,
            'warnings': parsed.warnings,
            'raw_text': parsed.raw_text[:2000],
            'ocr_engine': parsed.ocr_engine,
        }

        if not data.get('confirm'):
            return Response({
                'parsed': {
                    'party_name': parsed.party_name,
                    'party_id': parsed.party_id,
                    'invoice_number': parsed.invoice_number,
                    'order_date': parsed.order_date,
                    'order_date_jalali': to_jalali(parsed.order_date),
                    'total_amount': parsed.total_amount,
                    'confidence': parsed.confidence,
                    'warnings': parsed.warnings,
                    'items': parsed_items,
                    'raw_text': parsed.raw_text[:500],
                    'ocr_engine': parsed.ocr_engine,
                    'ocr_error': parsed.ocr_error,
                },
                'requires_party': parsed.party_id is None,
                'ocr_capabilities': ocr_capabilities(),
            })

        # ردیف‌های ویرایش‌شده توسط کاربر (اولویت بر OCR مجدد)
        client_items_raw = request.data.get('items')
        if client_items_raw:
            import json as json_lib
            if isinstance(client_items_raw, str):
                client_items_raw = json_lib.loads(client_items_raw)
            client_items = build_items_from_client(client_items_raw)
            if client_items:
                parsed.items = client_items
                parsed.confidence = min(95, parsed.confidence + 20)

        if not parsed.party_id and not party_id:
            return Response(
                {'detail': 'طرف حساب مشخص نیست. لطفاً طرف حساب را انتخاب کنید.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        party = Party.objects.filter(pk=party_id or parsed.party_id).first()
        if party is None:
            return Response({'detail': 'طرف حساب یافت نشد.'}, status=http_status.HTTP_400_BAD_REQUEST)

        items_data = [
            {
                'product': item.product_id,
                'product_name': item.product_name,
                'product_code': item.product_code,
                'quantity': item.quantity,
                'unit_price': item.unit_price,
            }
            for item in parsed.items
        ]

        if not items_data:
            return Response(
                {'detail': 'هیچ ردیف کالایی شناسایی نشد. OCR را فعال کنید یا اطلاعات را دستی وارد کنید.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        uploaded.seek(0)
        order = create_order_from_invoice(
            order_type=order_type,
            party=party,
            order_date=parsed.order_date,
            invoice_image=uploaded,
            parsed_payload=payload,
            ocr_confidence=parsed.confidence,
            ocr_status=ocr_status,
            items_data=items_data,
            create_missing_products=data.get('create_missing_products', True),
            user=request.user,
        )

        log_activity(request.user, ActivityLog.Action.CREATE, 'Order', order.id,
                     f'ثبت خودکار {order.get_order_type_display()} از فاکتور {order.number}', request)
        return Response(OrderSerializer(order, context={'request': request}).data,
                        status=http_status.HTTP_201_CREATED)


class SalesHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SalesHistorySerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'orders'
    filterset_fields = ['product', 'batch', 'party']
    search_fields = ['product_name_raw', 'customer_name']
    ordering_fields = ['sale_date', 'quantity', 'total_amount']
    ordering = ['-sale_date', '-id']

    def get_queryset(self):
        queryset = SalesHistory.objects.select_related('product', 'party')
        date_from = parse_flexible_date(self.request.query_params.get('date_from'))
        date_to = parse_flexible_date(self.request.query_params.get('date_to'))
        if date_from:
            queryset = queryset.filter(sale_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(sale_date__lte=date_to)
        return queryset

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset()
        totals = queryset.aggregate(
            quantity=Sum('quantity'), amount=Sum('total_amount'), count=Count('id'))
        first_record = queryset.order_by('sale_date').values_list('sale_date', flat=True).first()
        last_record = queryset.order_by('-sale_date').values_list('sale_date', flat=True).first()

        top_products = (
            queryset.values('product', 'product_name_raw')
            .annotate(quantity=Sum('quantity'), amount=Sum('total_amount'), count=Count('id'))
            .order_by('-amount')[:10]
        )

        return Response({
            'count': totals['count'] or 0,
            'total_quantity': totals['quantity'] or Decimal('0'),
            'total_amount': totals['amount'] or Decimal('0'),
            'first_date': first_record,
            'first_date_jalali': to_jalali(first_record),
            'last_date': last_record,
            'last_date_jalali': to_jalali(last_record),
            'distinct_products': queryset.values('product').distinct().count(),
            'top_products': list(top_products),
        })


class SalesImportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SalesImportBatch.objects.select_related('created_by').all()
    serializer_class = SalesImportBatchSerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'orders'
    parser_classes = [MultiPartParser, FormParser]
    ordering = ['-created_at']

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        if not has_capability(request.user, 'orders.import_sales'):
            raise PermissionDenied('دسترسی بارگذاری فایل فروش را ندارید.')

        serializer = SalesImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = serializer.validated_data['file']

        try:
            batch = import_sales_csv(
                raw_bytes=uploaded.read(),
                file_name=uploaded.name,
                user=request.user,
                create_missing_products=serializer.validated_data['create_missing_products'],
                link_parties=serializer.validated_data['link_parties'],
                replace_existing=serializer.validated_data['replace_existing'],
            )
        except ImportError_ as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)

        log_activity(request.user, ActivityLog.Action.IMPORT, 'SalesImportBatch', batch.id,
                     f'ورود {batch.imported_rows} ردیف فروش از {batch.file_name}', request)
        return Response(SalesImportBatchSerializer(batch).data, status=http_status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='sample')
    def sample(self, request):
        content = build_sample_csv()
        response = HttpResponse(content.encode('utf-8-sig'), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="sales-sample.csv"'
        return response

    @action(detail=True, methods=['delete'], url_path='records')
    def delete_records(self, request, pk=None):
        if not has_capability(request.user, 'orders.delete'):
            raise PermissionDenied('حذف داده‌های وارد‌شده فقط برای مدیر مجاز است.')
        batch = self.get_object()
        deleted = batch.records.count()
        batch.records.all().delete()
        log_activity(request.user, ActivityLog.Action.DELETE, 'SalesImportBatch', batch.id,
                     f'حذف {deleted} ردیف از دسته {batch.file_name}', request)
        return Response({'deleted': deleted})


class PurchaseSuggestionViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseSuggestionSerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'orders'
    filterset_fields = ['status', 'priority', 'product', 'suggested_supplier']
    search_fields = ['product__name', 'reason']
    ordering_fields = ['suggested_date', 'confidence', 'estimated_cost', 'days_of_stock_left']
    ordering = ['suggested_date']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        queryset = PurchaseSuggestion.objects.select_related(
            'product', 'suggested_supplier', 'reviewed_by')
        params = self.request.query_params

        date_from = parse_flexible_date(params.get('date_from'))
        date_to = parse_flexible_date(params.get('date_to'))
        if date_from:
            queryset = queryset.filter(suggested_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(suggested_date__lte=date_to)

        min_confidence = params.get('min_confidence')
        if min_confidence:
            queryset = queryset.filter(confidence__gte=min_confidence)

        return queryset

    @action(detail=False, methods=['post'])
    def generate(self, request):
        serializer = GenerateSuggestionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = generate_suggestions(
            coverage_days=data.get('coverage_days'),
            horizon_days=data.get('horizon_days', 60),
            lookback_days=data.get('lookback_days', 180),
            min_confidence=data.get('min_confidence', 0),
            product_ids=data.get('product_ids'),
            preferred_weekday=data.get('preferred_weekday'),
            reference_date=data.get('reference_date'),
            user=request.user,
        )
        log_activity(request.user, ActivityLog.Action.CREATE, 'PurchaseSuggestion', '',
                     f'تولید {result["created"]} پیشنهاد هوشمند', request)
        return Response(result)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        suggestion = self.get_object()
        suggestion.status = PurchaseSuggestion.Status.ACCEPTED
        suggestion.reviewed_by = request.user
        suggestion.review_note = request.data.get('note', '')
        suggestion.save(update_fields=['status', 'reviewed_by', 'review_note', 'modified_at'])
        return Response(PurchaseSuggestionSerializer(suggestion).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        suggestion = self.get_object()
        suggestion.status = PurchaseSuggestion.Status.REJECTED
        suggestion.reviewed_by = request.user
        suggestion.review_note = request.data.get('note', '')
        suggestion.save(update_fields=['status', 'reviewed_by', 'review_note', 'modified_at'])
        return Response(PurchaseSuggestionSerializer(suggestion).data)

    @action(detail=True, methods=['post'], url_path='create-order')
    def create_order(self, request, pk=None):
        suggestion = self.get_object()
        serializer = SuggestionToOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        party = None
        party_id = serializer.validated_data.get('party')
        if party_id:
            party = Party.objects.filter(pk=party_id).first()
            if party is None:
                return Response({'detail': 'طرف حساب انتخابی یافت نشد.'},
                                status=http_status.HTTP_400_BAD_REQUEST)

        try:
            order = create_order_from_suggestion(
                suggestion,
                party=party,
                order_date=serializer.validated_data.get('order_date'),
                user=request.user,
            )
        except OrderError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)

        log_activity(request.user, ActivityLog.Action.CREATE, 'Order', order.id,
                     f'ایجاد سفارش {order.number} از پیشنهاد #{suggestion.id}', request)
        return Response(OrderSerializer(order).data, status=http_status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = PurchaseSuggestion.objects.all()
        pending = queryset.filter(status=PurchaseSuggestion.Status.PENDING)

        by_priority = (
            pending.values('priority')
            .annotate(count=Count('id'), cost=Sum('estimated_cost'))
            .order_by()
        )
        priority_labels = dict(PurchaseSuggestion.Priority.choices)

        return Response({
            'total': queryset.count(),
            'pending': pending.count(),
            'accepted': queryset.filter(status=PurchaseSuggestion.Status.ACCEPTED).count(),
            'ordered': queryset.filter(status=PurchaseSuggestion.Status.ORDERED).count(),
            'rejected': queryset.filter(status=PurchaseSuggestion.Status.REJECTED).count(),
            'estimated_cost': pending.aggregate(t=Sum('estimated_cost'))['t'] or Decimal('0'),
            'critical_count': pending.filter(
                priority=PurchaseSuggestion.Priority.CRITICAL).count(),
            'due_this_week': pending.filter(
                suggested_date__lte=date.today() + timedelta(days=7)).count(),
            'by_priority': [{
                'priority': row['priority'],
                'priority_display': priority_labels.get(row['priority'], row['priority']),
                'count': row['count'],
                'estimated_cost': row['cost'] or Decimal('0'),
            } for row in by_priority],
        })

    @action(detail=False, methods=['get'], url_path='analyze/(?P<product_id>[^/.]+)')
    def analyze(self, request, product_id=None):
        """تحلیل فروش یک کالا بدون ذخیره‌ی پیشنهاد؛ برای نمایش نمودار."""
        from catalog.models import Product

        product = Product.objects.filter(pk=product_id).first()
        if product is None:
            return Response({'detail': 'کالا یافت نشد.'}, status=http_status.HTTP_404_NOT_FOUND)

        lookback = int(request.query_params.get('lookback_days', 180))
        analysis = analyze_product(product, lookback_days=lookback)
        if not analysis:
            return Response({
                'product_id': product.id,
                'product_name': product.name,
                'has_data': False,
                'detail': 'برای این کالا سابقه فروشی در بازه‌ی انتخابی ثبت نشده است.',
            })

        payload = {key: (float(value) if isinstance(value, Decimal) else value)
                   for key, value in analysis.items()
                   if key not in ('first_sale', 'last_sale')}
        payload.update({
            'product_id': product.id,
            'product_name': product.name,
            'unit_display': product.get_unit_display(),
            'current_stock': float(product.stock_quantity),
            'lead_time_days': product.lead_time_days,
            'has_data': True,
            'first_sale': analysis['first_sale'],
            'first_sale_jalali': to_jalali(analysis['first_sale']),
            'last_sale': analysis['last_sale'],
            'last_sale_jalali': to_jalali(analysis['last_sale']),
        })
        return Response(payload)
