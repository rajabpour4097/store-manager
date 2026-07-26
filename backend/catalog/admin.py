from django.contrib import admin

from .models import Product, ProductCategory, StockMovement


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['sku', 'name', 'category', 'purchase_price', 'sale_price',
                    'stock_quantity', 'is_active']
    list_filter = ['is_active', 'category', 'unit']
    search_fields = ['name', 'sku', 'barcode']
    readonly_fields = ['sku', 'stock_quantity']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ['date', 'product', 'quantity', 'reason', 'balance_after']
    list_filter = ['reason']
    search_fields = ['product__name']
    date_hierarchy = 'date'
