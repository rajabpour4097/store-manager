from datetime import date
from decimal import Decimal

from django.db.models import Count, Exists, F, OuterRef, Q, Sum
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.models import ActivityLog, log_activity
from accounts.permissions import CapabilityPermission
from core.jalali import parse_flexible_date

from .models import Product, ProductCategory, ProductDefect, ProductSerial, StockMovement
from .serializers import (
    ProductCategorySerializer,
    ProductDefectSerializer,
    ProductSerializer,
    ProductSerialSerializer,
    StockAdjustmentSerializer,
    StockMovementSerializer,
    catalog_options,
)
from .services import (
    apply_movement,
    backfill_serials_from_purchases,
    inventory_products,
    normalize_serial,
    open_defect_product_ids,
    sync_defect_serial,
)


class ProductCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ProductCategorySerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'catalog'
    filterset_fields = ['is_active', 'parent']
    search_fields = ['name', 'description']
    ordering = ['name']

    def get_queryset(self):
        return ProductCategory.objects.select_related('parent').annotate(
            products_count=Count('products'))

    def perform_destroy(self, instance):
        if instance.products.exists():
            raise ValidationError({'detail': 'این دسته‌بندی کالا دارد و قابل حذف نیست.'})
        if instance.children.exists():
            raise ValidationError({'detail': 'این دسته‌بندی زیرمجموعه دارد و قابل حذف نیست.'})
        instance.delete()


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'catalog'
    filterset_fields = ['category', 'is_active', 'unit', 'default_supplier']
    search_fields = ['name', 'sku', 'barcode', 'description']
    ordering_fields = ['name', 'sku', 'sale_price', 'purchase_price', 'stock_quantity', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        open_defect = ProductDefect.objects.filter(
            product_id=OuterRef('pk'), status=ProductDefect.Status.OPEN, serial_number='')
        queryset = Product.objects.select_related('category', 'default_supplier').annotate(
            _has_open_defect=Exists(open_defect))
        state = self.request.query_params.get('stock_state')
        if state == 'out_of_stock':
            queryset = queryset.filter(stock_quantity__lte=0)
        elif state == 'low':
            queryset = queryset.filter(stock_quantity__gt=0,
                                       stock_quantity__lte=F('reorder_point'))
        elif state == 'ok':
            queryset = queryset.filter(stock_quantity__gt=F('reorder_point'))
        exclude_defective = self.request.query_params.get('exclude_defective')
        if exclude_defective in ('1', 'true', 'True'):
            queryset = queryset.exclude(id__in=open_defect_product_ids())
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['open_defect_ids'] = set(open_defect_product_ids())
        return context

    def perform_create(self, serializer):
        product = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'Product', product.id,
                     f'ایجاد کالای {product.name}', self.request)

    def perform_update(self, serializer):
        product = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'Product', product.id,
                     f'ویرایش کالای {product.name}', self.request)

    def perform_destroy(self, instance):
        if instance.order_items.exists():
            raise ValidationError({'detail': 'این کالا در سفارشات استفاده شده است؛ '
                                             'به‌جای حذف آن را غیرفعال کنید.'})
        log_activity(self.request.user, ActivityLog.Action.DELETE, 'Product', instance.id,
                     f'حذف کالای {instance.name}', self.request)
        instance.delete()

    @action(detail=False, methods=['get'])
    def options(self, request):
        return Response(catalog_options())

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = Product.objects.all()
        active = inventory_products()
        totals = active.aggregate(
            stock_value=Sum(F('stock_quantity') * F('purchase_price')),
            retail_value=Sum(F('stock_quantity') * F('sale_price')),
        )
        return Response({
            'total_products': queryset.count(),
            'active_products': active.count(),
            'out_of_stock': active.filter(stock_quantity__lte=0).count(),
            'low_stock': active.filter(stock_quantity__gt=0,
                                       stock_quantity__lte=F('reorder_point')).count(),
            'stock_value': totals['stock_value'] or Decimal('0'),
            'retail_value': totals['retail_value'] or Decimal('0'),
            'categories': ProductCategory.objects.count(),
        })

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        queryset = inventory_products().select_related('category', 'default_supplier').filter(
            Q(stock_quantity__lte=F('reorder_point')) | Q(stock_quantity__lte=0)
        ).order_by('stock_quantity')[:50]
        return Response(ProductSerializer(queryset, many=True,
                                          context=self.get_serializer_context()).data)

    @action(detail=True, methods=['get'])
    def movements(self, request, pk=None):
        product = self.get_object()
        queryset = product.movements.select_related('created_by').order_by('-date', '-id')[:200]
        return Response(StockMovementSerializer(queryset, many=True).data)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'catalog'
    filterset_fields = ['product', 'reason', 'source_type']
    search_fields = ['product__name', 'description']
    ordering_fields = ['date', 'quantity', 'created_at']
    ordering = ['-date', '-id']

    def get_queryset(self):
        queryset = StockMovement.objects.select_related('product', 'created_by')
        date_from = parse_flexible_date(self.request.query_params.get('date_from'))
        date_to = parse_flexible_date(self.request.query_params.get('date_to'))
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        return queryset

    @action(detail=False, methods=['post'])
    def adjust(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        movement = apply_movement(
            product=data['product'],
            date=data['date'],
            quantity=data['quantity'],
            reason=data['reason'],
            unit_cost=data.get('unit_cost') or 0,
            source_type='manual',
            description=data.get('description', ''),
            user=request.user,
        )
        log_activity(request.user, ActivityLog.Action.CREATE, 'StockMovement', movement.id,
                     f'گردش انبار {movement.product.name}: {movement.quantity}', request)
        return Response(StockMovementSerializer(movement).data, status=http_status.HTTP_201_CREATED)


class ProductDefectViewSet(viewsets.ModelViewSet):
    serializer_class = ProductDefectSerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'catalog'
    filterset_fields = ['status', 'product']
    ordering_fields = ['registered_at', 'last_follow_up_at', 'created_at', 'status']
    ordering = ['-registered_at', '-id']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = ProductDefect.objects.select_related(
            'product', 'product__default_supplier', 'created_by')
        term = normalize_serial(self.request.query_params.get('search') or '')
        if term:
            queryset = queryset.filter(
                Q(serial_number__icontains=term)
                | Q(product__name__icontains=term)
                | Q(product__sku__icontains=term)
                | Q(reason__icontains=term)
                | Q(description__icontains=term)
                | Q(product__default_supplier__name__icontains=term)
            )
        return queryset

    def perform_create(self, serializer):
        defect = serializer.save(
            created_by=self.request.user,
            status=ProductDefect.Status.OPEN,
            repaired_at=None,
        )
        sync_defect_serial(defect)
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'ProductDefect', defect.id,
                     f'ثبت خرابی کالای {defect.product.name}', self.request)

    def perform_update(self, serializer):
        previous = serializer.instance.status
        defect = serializer.save()
        if (previous != ProductDefect.Status.REPAIRED
                and defect.status == ProductDefect.Status.REPAIRED
                and not defect.repaired_at):
            defect.repaired_at = date.today()
            defect.save(update_fields=['repaired_at', 'modified_at'])
        elif defect.status == ProductDefect.Status.OPEN and defect.repaired_at:
            defect.repaired_at = None
            defect.save(update_fields=['repaired_at', 'modified_at'])
        sync_defect_serial(defect)
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'ProductDefect', defect.id,
                     f'به‌روزرسانی خرابی کالای {defect.product.name}', self.request)

    @action(detail=True, methods=['post'])
    def repair(self, request, pk=None):
        defect = self.get_object()
        if defect.status == ProductDefect.Status.REPAIRED:
            raise ValidationError({'detail': 'این کالا قبلاً به‌عنوان درست‌شده ثبت شده است.'})
        follow_up = parse_flexible_date(request.data.get('last_follow_up_at')) or date.today()
        description = request.data.get('description')
        reason = request.data.get('reason')
        defect.status = ProductDefect.Status.REPAIRED
        defect.repaired_at = parse_flexible_date(request.data.get('repaired_at')) or date.today()
        defect.last_follow_up_at = follow_up
        if description is not None:
            defect.description = description
        if reason is not None:
            reason = str(reason).strip()
            if not reason:
                raise ValidationError({'reason': 'علت خرابی را وارد کنید.'})
            defect.reason = reason
        defect.save()
        sync_defect_serial(defect)
        log_activity(request.user, ActivityLog.Action.UPDATE, 'ProductDefect', defect.id,
                     f'درست شدن کالای {defect.product.name}', request)
        return Response(ProductDefectSerializer(defect).data)


class ProductSerialViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProductSerialSerializer
    permission_classes = [CapabilityPermission]
    capability_prefix = 'catalog'
    filterset_fields = ['product', 'status']
    ordering_fields = ['serial_number', 'created_at']
    ordering = ['serial_number']

    def get_queryset(self):
        backfill_serials_from_purchases()
        queryset = ProductSerial.objects.select_related('product')
        term = normalize_serial(self.request.query_params.get('search') or '')
        if term:
            queryset = queryset.filter(
                Q(serial_number__icontains=term)
                | Q(product__name__icontains=term)
                | Q(product__sku__icontains=term)
            )
        return queryset
