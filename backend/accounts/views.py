from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import ActivityLog, Role, User, log_activity
from .permissions import IsManager, capabilities_for
from .serializers import (
    ActivityLogSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    UserSerializer,
    UserWriteSerializer,
)


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = []

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            username = request.data.get('username')
            user = User.objects.filter(username=username).first()
            if user:
                log_activity(user, ActivityLog.Action.LOGIN, 'User', user.id, 'ورود به سیستم', request)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        allowed = {'first_name', 'last_name', 'email', 'phone_number'}
        payload = {key: value for key, value in request.data.items() if key in allowed}
        serializer = UserWriteSerializer(request.user, data=payload, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class CapabilitiesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'role': request.user.role,
            'role_display': request.user.get_role_display(),
            'is_manager': request.user.is_manager,
            'capabilities': capabilities_for(request.user),
        })


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, ActivityLog.Action.UPDATE, 'User', request.user.id, 'تغییر رمز عبور', request)
        return Response({'detail': 'رمز عبور با موفقیت تغییر کرد.'})


class UserViewSet(viewsets.ModelViewSet):
    """مدیریت کاربران؛ فقط برای مدیر."""

    queryset = User.objects.all()
    permission_classes = [IsManager]
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone_number']
    filterset_fields = ['role', 'is_active']
    ordering_fields = ['date_joined', 'username', 'last_login']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return UserWriteSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.CREATE, 'User', user.id,
                     f'ایجاد کاربر {user.username}', self.request)

    def perform_update(self, serializer):
        user = serializer.save()
        log_activity(self.request.user, ActivityLog.Action.UPDATE, 'User', user.id,
                     f'ویرایش کاربر {user.username}', self.request)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'نمی‌توانید حساب کاربری خودتان را حذف کنید.'})
        if instance.is_superuser:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'حذف کاربر ابرمدیر مجاز نیست.'})
        log_activity(self.request.user, ActivityLog.Action.DELETE, 'User', instance.id,
                     f'حذف کاربر {instance.username}', self.request)
        instance.delete()

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response({'detail': 'نمی‌توانید حساب خودتان را غیرفعال کنید.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.is_active = not user.is_active
        user.save(update_fields=['is_active'])
        log_activity(request.user, ActivityLog.Action.STATUS, 'User', user.id,
                     f'{"فعال" if user.is_active else "غیرفعال"} کردن کاربر {user.username}', request)
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        new_password = request.data.get('new_password', '')
        if len(new_password) < 8:
            return Response({'detail': 'رمز عبور باید حداقل ۸ کاراکتر باشد.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save(update_fields=['password'])
        log_activity(request.user, ActivityLog.Action.UPDATE, 'User', user.id,
                     f'بازنشانی رمز عبور {user.username}', request)
        return Response({'detail': 'رمز عبور کاربر بازنشانی شد.'})

    @action(detail=False, methods=['get'])
    def roles(self, request):
        return Response([{'value': value, 'label': label} for value, label in Role.choices])


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ActivityLog.objects.select_related('user').all()
    serializer_class = ActivityLogSerializer
    permission_classes = [IsManager]
    filterset_fields = ['action', 'entity', 'user']
    search_fields = ['entity', 'description', 'entity_id']
    ordering_fields = ['created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('q')
        if search:
            queryset = queryset.filter(
                Q(description__icontains=search) | Q(entity__icontains=search)
            )
        return queryset
