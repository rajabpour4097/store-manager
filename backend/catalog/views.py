from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.models import ActivityLog, log_activity
from accounts.permissions import CapabilityPermission
from core.jalali import parse_flexible_date

from .models import Product, ProductCategory, StockMovement
from .serializers import (
    ProductCategorySerializer,
    ProductSerializer,
    StockAdjustmentSerializer,
    StockMovementSerializer,
    catalog_options,
)
from .services import apply_movement


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
        queryset = Product.objects.select_related('category', 'default_supplier')
        state = self.request.query_params.get('stock_state')
        if state == 'out_of_stock':
            queryset = queryset.filter(stock_quantity__lte=0)
        elif state == 'low':
            queryset = queryset.filter(stock_quantity__gt=0,
                                       stock_quantity__lte=F('reorder_point'))
        elif state == 'ok':
            queryset = queryset.filter(stock_quantity__gt=F('reorder_point'))
        return queryset

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
        active = queryset.filter(is_active=True)
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
        queryset = Product.objects.select_related('category', 'default_supplier').filter(
            is_active=True
        ).filter(Q(stock_quantity__lte=F('reorder_point')) | Q(stock_quantity__lte=0)
                 ).order_by('stock_quantity')[:50]
        return Response(ProductSerializer(queryset, many=True).data)

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
