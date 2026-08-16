from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ProductCategoryViewSet,
    ProductDefectViewSet,
    ProductSerialViewSet,
    ProductViewSet,
    StockMovementViewSet,
)

router = DefaultRouter()
router.register('products', ProductViewSet, basename='product')
router.register('categories', ProductCategoryViewSet, basename='product-category')
router.register('stock-movements', StockMovementViewSet, basename='stock-movement')
router.register('defects', ProductDefectViewSet, basename='product-defect')
router.register('serials', ProductSerialViewSet, basename='product-serial')

urlpatterns = [path('', include(router.urls))]
