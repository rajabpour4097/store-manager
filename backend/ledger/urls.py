from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BankAccountViewSet,
    FinanceCategoryViewSet,
    FinanceRecordViewSet,
    LedgerEntryViewSet,
)

router = DefaultRouter()
router.register('entries', LedgerEntryViewSet, basename='ledger-entry')
router.register('bank-accounts', BankAccountViewSet, basename='bank-account')
router.register('finance-categories', FinanceCategoryViewSet, basename='finance-category')
router.register('finance-records', FinanceRecordViewSet, basename='finance-record')

urlpatterns = [path('', include(router.urls))]
