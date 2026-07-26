from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    OrderViewSet,
    PurchaseSuggestionViewSet,
    SalesHistoryViewSet,
    SalesImportViewSet,
)

router = DefaultRouter()
router.register('orders', OrderViewSet, basename='order')
router.register('suggestions', PurchaseSuggestionViewSet, basename='purchase-suggestion')
router.register('sales-history', SalesHistoryViewSet, basename='sales-history')
router.register('sales-imports', SalesImportViewSet, basename='sales-import')

urlpatterns = [path('', include(router.urls))]
