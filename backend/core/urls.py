from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.jalali import today_jalali

admin.site.site_header = 'مدیریت فروشگاه'
admin.site.site_title = 'پنل مدیریت فروشگاه'
admin.site.index_title = 'مدیریت داده‌ها'


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({
        'status': 'ok',
        'service': 'store-manager-api',
        'today_jalali': today_jalali(),
    })


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health, name='health'),
    path('api/accounts/', include('accounts.urls')),
    path('api/', include('parties.urls')),
    path('api/ledger/', include('ledger.urls')),
    path('api/', include('cheques.urls')),
    path('api/catalog/', include('catalog.urls')),
    path('api/', include('orders.urls')),
    path('api/reports/', include('reports.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
