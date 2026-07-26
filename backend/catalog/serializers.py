from rest_framework import serializers

from core.jalali import to_jalali

from .models import Product, ProductCategory, StockMovement, Unit


class ProductCategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True, default='')
    products_count = serializers.IntegerField(read_only=True, required=False)
    full_name = serializers.CharField(source='__str__', read_only=True)

    class Meta:
        model = ProductCategory
        fields = ['id', 'name', 'full_name', 'parent', 'parent_name', 'description',
                  'is_active', 'products_count']

    def validate(self, attrs):
        parent = attrs.get('parent')
        if parent and self.instance and parent.pk == self.instance.pk:
            raise serializers.ValidationError({'parent': 'یک دسته نمی‌تواند والد خودش باشد.'})
        return attrs


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    supplier_name = serializers.CharField(source='default_supplier.name', read_only=True, default='')
    profit_margin = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)
    stock_value = serializers.DecimalField(max_digits=18, decimal_places=0, read_only=True)
    stock_state = serializers.CharField(read_only=True)
    stock_state_display = serializers.CharField(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'barcode', 'name', 'category', 'category_name', 'unit', 'unit_display',
            'purchase_price', 'sale_price', 'stock_quantity', 'reorder_point', 'lead_time_days',
            'default_supplier', 'supplier_name', 'image', 'description', 'is_active',
            'profit_margin', 'stock_value', 'stock_state', 'stock_state_display', 'created_at',
        ]
        read_only_fields = ['id', 'sku', 'created_at', 'stock_quantity']

    def validate(self, attrs):
        purchase = attrs.get('purchase_price', getattr(self.instance, 'purchase_price', 0))
        sale = attrs.get('sale_price', getattr(self.instance, 'sale_price', 0))
        if sale and purchase and sale < purchase:
            # هشدار است نه خطا؛ فروش زیر قیمت خرید ممکن است عمدی باشد
            pass
        return attrs


class ProductMiniSerializer(serializers.ModelSerializer):
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)

    class Meta:
        model = Product
        fields = ['id', 'sku', 'name', 'unit', 'unit_display', 'sale_price',
                  'purchase_price', 'stock_quantity']


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    date_jalali = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, default='')

    class Meta:
        model = StockMovement
        fields = [
            'id', 'product', 'product_name', 'date', 'date_jalali', 'quantity', 'unit_cost',
            'reason', 'reason_display', 'balance_after', 'source_type', 'source_id',
            'description', 'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'balance_after', 'created_at', 'created_by']

    def get_date_jalali(self, obj):
        return to_jalali(obj.date)


class StockAdjustmentSerializer(serializers.Serializer):
    """اصلاح دستی موجودی."""

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=2)
    reason = serializers.ChoiceField(choices=StockMovement.Reason.choices,
                                     default=StockMovement.Reason.ADJUSTMENT)
    unit_cost = serializers.DecimalField(max_digits=18, decimal_places=0, required=False, default=0)
    description = serializers.CharField(required=False, allow_blank=True)

    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError('مقدار گردش نمی‌تواند صفر باشد.')
        return value


def catalog_options() -> dict:
    return {
        'units': [{'value': v, 'label': l} for v, l in Unit.choices],
        'movement_reasons': [{'value': v, 'label': l} for v, l in StockMovement.Reason.choices],
    }
