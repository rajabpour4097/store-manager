from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.jalali import to_jalali

from .models import ActivityLog, Role, User
from .permissions import capabilities_for


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    capabilities = serializers.SerializerMethodField()
    date_joined_jalali = serializers.SerializerMethodField()
    last_login_jalali = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email', 'phone_number',
            'national_id', 'role', 'role_display', 'display_name', 'is_active',
            'avatar', 'date_joined', 'date_joined_jalali', 'last_login',
            'last_login_jalali', 'capabilities',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']

    def get_capabilities(self, obj):
        return capabilities_for(obj)

    def get_date_joined_jalali(self, obj):
        return to_jalali(obj.date_joined)

    def get_last_login_jalali(self, obj):
        return to_jalali(obj.last_login)


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email', 'phone_number',
            'national_id', 'role', 'is_active', 'password',
        ]

    def validate_password(self, value):
        if value:
            password_validation.validate_password(value)
        return value

    def validate_role(self, value):
        if value not in Role.values:
            raise serializers.ValidationError('نقش انتخاب‌شده معتبر نیست.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', '') or None
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            raise serializers.ValidationError({'password': 'رمز عبور برای کاربر جدید الزامی است.'})
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', '')
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(TokenObtainPairSerializer):
    """توکن JWT همراه با اطلاعات کاربر."""

    default_error_messages = {
        'no_active_account': 'نام کاربری یا رمز عبور اشتباه است.',
    }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['display_name'] = user.display_name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('رمز عبور فعلی اشتباه است.')
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context['request'].user)
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.display_name', read_only=True, default='—')
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    created_at_jalali = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = [
            'id', 'user', 'user_name', 'action', 'action_display', 'entity',
            'entity_id', 'description', 'ip_address', 'created_at', 'created_at_jalali',
        ]

    def get_created_at_jalali(self, obj):
        return to_jalali(obj.created_at)
