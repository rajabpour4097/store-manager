from django.contrib import admin

from .models import (
    Order,
    OrderItem,
    PurchaseSuggestion,
    SalesHistory,
    SalesImportBatch,
)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    autocomplete_fields = ['product']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['number', 'order_type', 'party', 'order_date', 'total_amount',
                    'paid_amount', 'status', 'payment_status']
    list_filter = ['order_type', 'status', 'payment_status']
    search_fields = ['number', 'party__name']
    autocomplete_fields = ['party']
    date_hierarchy = 'order_date'
    inlines = [OrderItemInline]
    readonly_fields = ['number', 'subtotal', 'tax_amount', 'total_amount', 'cost_amount']


@admin.register(SalesImportBatch)
class SalesImportBatchAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'status', 'total_rows', 'imported_rows', 'skipped_rows', 'created_at']
    list_filter = ['status']


@admin.register(SalesHistory)
class SalesHistoryAdmin(admin.ModelAdmin):
    list_display = ['sale_date', 'product_name_raw', 'quantity', 'unit_price', 'total_amount']
    search_fields = ['product_name_raw', 'customer_name']
    date_hierarchy = 'sale_date'


@admin.register(PurchaseSuggestion)
class PurchaseSuggestionAdmin(admin.ModelAdmin):
    list_display = ['product', 'suggested_date', 'suggested_quantity', 'priority',
                    'confidence', 'status']
    list_filter = ['status', 'priority']
    search_fields = ['product__name']
