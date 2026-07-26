from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ChequeViewSet

router = DefaultRouter()
router.register('cheques', ChequeViewSet, basename='cheque')

urlpatterns = [path('', include(router.urls))]
