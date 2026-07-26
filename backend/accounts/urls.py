from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    ActivityLogViewSet,
    CapabilitiesView,
    ChangePasswordView,
    LoginView,
    MeView,
    UserViewSet,
)

router = DefaultRouter()
router.register('users', UserViewSet, basename='user')
router.register('activity-logs', ActivityLogViewSet, basename='activity-log')

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('token/verify/', TokenVerifyView.as_view(), name='token-verify'),
    path('me/', MeView.as_view(), name='me'),
    path('me/capabilities/', CapabilitiesView.as_view(), name='capabilities'),
    path('me/change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('', include(router.urls)),
]
