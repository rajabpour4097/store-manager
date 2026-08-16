from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from catalog.models import Product
from catalog.serializers import ProductMiniSerializer
from catalog.services import normalize_serial
from core.jalali import WEEKDAY_NAMES, to_jalali, to_jalali_verbose
from parties.serializers import PartyMiniSerializer

from .invoice_pipeline import pipeline_capabilities
from .models import (
    EntryMode,
    Order,
    OrderItem,
    OrderStatus,
    OrderType,
    OcrStatus,
    PaymentStatus,
    PurchaseSuggestion,
    SalesHistory,
    SalesImportBatch,
)


class OrderItemSerializer(serializers.ModelSerializer):
    product_detail = ProductMiniSerializer(source='product', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    unit_display = serializers.CharField(source='product.get_unit_display', read_only=True)
    total_price = serializers.DecimalField(max_digits=18, decimal_places=0, read_only=True)
    total_cost = serializers.DecimalField(max_digits=18, decimal_places=0, read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_detail', 'product_name', 'unit_display', 'quantity',
            'unit_price', 'unit_cost', 'discount_amount', 'serial_number', 'description',
            'total_price', 'total_cost',
        ]
        read_only_fields = ['id']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('مقدار باید بزرگ‌تر از صفر باشد.')
        return value

    def validate_serial_number(self, value):
        return normalize_serial(value)

    def validate(self, attrs):
        discount = attrs.get('discount_amount') or Decimal('0')
        quantity = attrs.get('quantity') or Decimal('0')
        unit_price = attrs.get('unit_price') or Decimal('0')
        serial = attrs.get('serial_number') or ''
        if serial:
            attrs['quantity'] = Decimal('1')
            quantity = Decimal('1')
        if discount > quantity * unit_price:
            raise serializers.ValidationError(
                {'discount_amount': 'تخفیف ردیف از مبلغ ردیف بیشتر است.'}
            )
        return attrs


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, required=False)
    party_detail = PartyMiniSerializer(source='party', read_only=True)
    order_type_display = serializers.CharField(source='get_order_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    order_date_jalali = serializers.SerializerMethodField()
    due_date_jalali = serializers.SerializerMethodField()
    remaining_amount = serializers.DecimalField(max_digits=18, decimal_places=0, read_only=True)
    gross_profit = serializers.DecimalField(max_digits=18, decimal_places=0, read_only=True)
    items_count = serializers.IntegerField(read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, default='')
    confirmed_by_name = serializers.CharField(source='confirmed_by.display_name', read_only=True, default='')
    entry_mode_display = serializers.CharField(source='get_entry_mode_display', read_only=True)
    ocr_status_display = serializers.CharField(source='get_ocr_status_display', read_only=True)
    invoice_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'number', 'order_type', 'order_type_display', 'party', 'party_detail',
            'order_date', 'order_date_jalali', 'due_date', 'due_date_jalali', 'status',
            'status_display', 'payment_status', 'payment_status_display', 'discount_amount',
            'tax_percent', 'shipping_amount', 'subtotal', 'tax_amount', 'total_amount',
            'paid_amount', 'cost_amount', 'remaining_amount', 'gross_profit', 'affects_stock',
            'description', 'items', 'items_count', 'is_editable', 'created_by',
            'created_by_name', 'confirmed_by', 'confirmed_by_name', 'confirmed_at',
            'source_suggestion', 'created_at',
            'entry_mode', 'entry_mode_display', 'invoice_image', 'invoice_image_url',
            'ocr_status', 'ocr_status_display', 'ocr_payload', 'ocr_confidence',
        ]
        read_only_fields = [
            'id', 'number', 'status', 'payment_status', 'subtotal', 'tax_amount',
            'total_amount', 'paid_amount', 'cost_amount', 'created_by', 'confirmed_by',
            'confirmed_at', 'created_at',
        ]

    def get_order_date_jalali(self, obj):
        return to_jalali(obj.order_date)

    def get_due_date_jalali(self, obj):
        return to_jalali(obj.due_date)

    def get_invoice_image_url(self, obj):
        if not obj.invoice_image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.invoice_image.url)
        return obj.invoice_image.url

    def validate(self, attrs):
        order_date = attrs.get('order_date') or getattr(self.instance, 'order_date', None)
        due_date = attrs.get('due_date') or getattr(self.instance, 'due_date', None)
        if order_date and due_date and due_date < order_date:
            raise serializers.ValidationError(
                {'due_date': 'مهلت پرداخت نمی‌تواند قبل از تاریخ سفارش باشد.'}
            )
        tax_percent = attrs.get('tax_percent')
        if tax_percent is not None and (tax_percent < 0 or tax_percent > 100):
            raise serializers.ValidationError({'tax_percent': 'درصد مالیات باید بین ۰ و ۱۰۰ باشد.'})
        items = attrs.get('items')
        if items:
            from .services import OrderError, validate_item_serials
            order_type = attrs.get('order_type') or getattr(self.instance, 'order_type', None)
            if order_type:
                try:
                    validate_item_serials(
                        order_type,
                        items,
                        exclude_order_id=self.instance.pk if self.instance else None,
                    )
                except OrderError as exc:
                    raise serializers.ValidationError({'items': str(exc)}) from exc
        return attrs

    def _apply_items(self, order, items_data):
        order.items.all().delete()
        for item in items_data:
            OrderItem.objects.create(order=order, **item)

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        order = Order.objects.create(**validated_data)
        self._apply_items(order, items_data)
        order.recalculate()
        from .services import OrderError, confirm_order
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        try:
            confirm_order(order, user=user)
        except OrderError as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc
        return order

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        if instance.status in (OrderStatus.COMPLETED, OrderStatus.CANCELLED):
            raise serializers.ValidationError(
                'سفارش تکمیل‌شده یا لغو‌شده قابل ویرایش نیست.'
            )
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if items_data is not None:
            self._apply_items(instance, items_data)

        from .services import OrderError, confirm_order, refresh_order
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        instance.refresh_from_db()
        try:
            if instance.status == OrderStatus.DRAFT:
                confirm_order(instance, user=user)
            else:
                refresh_order(instance, user=user)
        except OrderError as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc
        return instance


class OrderListSerializer(serializers.ModelSerializer):
    party_name = serializers.CharField(source='party.name', read_only=True)
    order_type_display = serializers.CharField(source='get_order_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    order_date_jalali = serializers.SerializerMethodField()
    due_date_jalali = serializers.SerializerMethodField()
    remaining_amount = serializers.DecimalField(max_digits=18, decimal_places=0, read_only=True)
    items_count = serializers.IntegerField(read_only=True)
    is_editable = serializers.BooleanField(read_only=True)
    entry_mode = serializers.CharField(read_only=True)
    entry_mode_display = serializers.CharField(source='get_entry_mode_display', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'number', 'order_type', 'order_type_display', 'party', 'party_name',
            'order_date', 'order_date_jalali', 'due_date', 'due_date_jalali', 'status',
            'status_display', 'payment_status', 'payment_status_display', 'total_amount',
            'paid_amount', 'remaining_amount', 'items_count', 'is_editable', 'created_at',
            'entry_mode', 'entry_mode_display',
        ]

    def get_order_date_jalali(self, obj):
        return to_jalali(obj.order_date)

    def get_due_date_jalali(self, obj):
        return to_jalali(obj.due_date)


class SalesHistorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True, default='')
    sale_date_jalali = serializers.SerializerMethodField()

    class Meta:
        model = SalesHistory
        fields = [
            'id', 'batch', 'product', 'product_name', 'product_name_raw', 'sale_date',
            'sale_date_jalali', 'quantity', 'unit_price', 'total_amount', 'unit_cost',
            'customer_name', 'party', 'source_order',
        ]

    def get_sale_date_jalali(self, obj):
        return to_jalali(obj.sale_date)


class SalesImportBatchSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, default='')
    created_at_jalali = serializers.SerializerMethodField()
    date_from_jalali = serializers.SerializerMethodField()
    date_to_jalali = serializers.SerializerMethodField()

    class Meta:
        model = SalesImportBatch
        fields = [
            'id', 'file_name', 'status', 'status_display', 'total_rows', 'imported_rows',
            'skipped_rows', 'created_products', 'errors', 'date_from', 'date_from_jalali',
            'date_to', 'date_to_jalali', 'created_by', 'created_by_name',
            'created_at', 'created_at_jalali',
        ]

    def get_created_at_jalali(self, obj):
        return to_jalali(obj.created_at)

    def get_date_from_jalali(self, obj):
        return to_jalali(obj.date_from)

    def get_date_to_jalali(self, obj):
        return to_jalali(obj.date_to)


class PurchaseSuggestionSerializer(serializers.ModelSerializer):
    product_detail = ProductMiniSerializer(source='product', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    unit_display = serializers.CharField(source='product.get_unit_display', read_only=True)
    supplier_name = serializers.CharField(source='suggested_supplier.name', read_only=True, default='')
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    suggested_date_jalali = serializers.SerializerMethodField()
    suggested_date_verbose = serializers.SerializerMethodField()
    stockout_date_jalali = serializers.SerializerMethodField()
    best_weekday_name = serializers.SerializerMethodField()
    generated_at_jalali = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseSuggestion
        fields = [
            'id', 'product', 'product_detail', 'product_name', 'unit_display',
            'suggested_date', 'suggested_date_jalali', 'suggested_date_verbose',
            'suggested_quantity', 'suggested_supplier', 'supplier_name', 'estimated_cost',
            'avg_daily_sales', 'current_stock', 'days_of_stock_left', 'stockout_date',
            'stockout_date_jalali', 'coverage_days', 'lead_time_days', 'best_weekday',
            'best_weekday_name', 'seasonality_factor', 'trend_percent', 'confidence',
            'data_points', 'priority', 'priority_display', 'status', 'status_display',
            'reason', 'analysis', 'generated_at', 'generated_at_jalali', 'reviewed_by',
            'review_note',
        ]
        read_only_fields = [f for f in fields if f not in ('status', 'review_note',
                                                            'suggested_quantity',
                                                            'suggested_date',
                                                            'suggested_supplier')]

    def get_suggested_date_jalali(self, obj):
        return to_jalali(obj.suggested_date)

    def get_suggested_date_verbose(self, obj):
        return to_jalali_verbose(obj.suggested_date)

    def get_stockout_date_jalali(self, obj):
        return to_jalali(obj.stockout_date)

    def get_generated_at_jalali(self, obj):
        return to_jalali(obj.generated_at)

    def get_best_weekday_name(self, obj):
        if obj.best_weekday is None:
            return ''
        return WEEKDAY_NAMES[obj.best_weekday]


class GenerateSuggestionsSerializer(serializers.Serializer):
    coverage_days = serializers.IntegerField(required=False, min_value=1, max_value=365)
    horizon_days = serializers.IntegerField(required=False, min_value=1, max_value=365, default=60)
    lookback_days = serializers.IntegerField(required=False, min_value=14, max_value=1095, default=180)
    min_confidence = serializers.IntegerField(required=False, min_value=0, max_value=100, default=0)
    preferred_weekday = serializers.IntegerField(required=False, allow_null=True,
                                                 min_value=0, max_value=6)
    product_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    reference_date = serializers.DateField(required=False, allow_null=True)


class OrderPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=18, decimal_places=0, min_value=Decimal('1'))


class OrderCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class SuggestionToOrderSerializer(serializers.Serializer):
    party = serializers.IntegerField(required=False, allow_null=True)
    order_date = serializers.DateField(required=False, allow_null=True)


class SalesImportSerializer(serializers.Serializer):
    file = serializers.FileField()
    create_missing_products = serializers.BooleanField(default=True)
    link_parties = serializers.BooleanField(default=False)
    replace_existing = serializers.BooleanField(default=False)

    def validate_file(self, value):
        name = (value.name or '').lower()
        if not name.endswith(('.csv', '.txt')):
            raise serializers.ValidationError('فقط فایل CSV پذیرفته می‌شود.')
        if value.size > 20 * 1024 * 1024:
            raise serializers.ValidationError('حجم فایل نباید بیشتر از ۲۰ مگابایت باشد.')
        return value


class InvoiceUploadSerializer(serializers.Serializer):
    image = serializers.ImageField()
    order_type = serializers.ChoiceField(choices=OrderType.choices, default=OrderType.SALE)
    party = serializers.IntegerField(required=False, allow_null=True)
    confirm = serializers.BooleanField(default=False)
    create_missing_products = serializers.BooleanField(default=True)

    def validate_image(self, value):
        if value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError('حجم تصویر نباید بیشتر از ۱۰ مگابایت باشد.')
        allowed = ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
        content_type = getattr(value, 'content_type', '') or ''
        if content_type and content_type not in allowed:
            raise serializers.ValidationError('فقط تصاویر JPG، PNG، WEBP و GIF پذیرفته می‌شوند.')
        return value


class InvoiceParseResultSerializer(serializers.Serializer):
    """نتیجه استخراج فاکتور قبل از ذخیره."""

    party_name = serializers.CharField(allow_blank=True)
    party_id = serializers.IntegerField(allow_null=True)
    order_date = serializers.DateField()
    order_date_jalali = serializers.SerializerMethodField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=0, allow_null=True)
    confidence = serializers.IntegerField()
    warnings = serializers.ListField(child=serializers.CharField())
    items = serializers.ListField()
    raw_text = serializers.CharField(allow_blank=True)

    def get_order_date_jalali(self, obj):
        return to_jalali(obj.get('order_date'))


def order_options() -> dict:
    return {
        'order_types': [{'value': v, 'label': l} for v, l in OrderType.choices],
        'statuses': [{'value': v, 'label': l} for v, l in OrderStatus.choices],
        'payment_statuses': [{'value': v, 'label': l} for v, l in PaymentStatus.choices],
        'entry_modes': [{'value': v, 'label': l} for v, l in EntryMode.choices],
        'ocr_statuses': [{'value': v, 'label': l} for v, l in OcrStatus.choices],
        'suggestion_statuses': [{'value': v, 'label': l}
                                for v, l in PurchaseSuggestion.Status.choices],
        'priorities': [{'value': v, 'label': l} for v, l in PurchaseSuggestion.Priority.choices],
        'weekdays': [{'value': index, 'label': name} for index, name in enumerate(WEEKDAY_NAMES)],
        'ocr_capabilities': pipeline_capabilities(),
    }
