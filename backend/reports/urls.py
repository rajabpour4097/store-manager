from django.urls import path

from . import views

urlpatterns = [
    path('dashboard/', views.dashboard_view, name='report-dashboard'),
    path('catalog/', views.catalog_view, name='report-catalog'),
    path('profit-loss/', views.profit_loss_view, name='report-profit-loss'),
    path('sales/', views.sales_view, name='report-sales'),
    path('purchases/', views.purchases_view, name='report-purchases'),
    path('receivables/', views.receivables_view, name='report-receivables'),
    path('cheques/', views.cheques_view, name='report-cheques'),
    path('inventory/', views.inventory_view, name='report-inventory'),
    path('warehouse-stats/', views.warehouse_stats_view, name='report-warehouse-stats'),
    path('export/<str:report_key>/', views.export_view, name='report-export'),
]
