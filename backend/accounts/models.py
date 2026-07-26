from django.contrib.auth.models import AbstractUser
from django.db import models

from core.models import BaseModel


class Role(models.TextChoices):
    MANAGER = 'manager', 'مدیر'
    ACCOUNTANT = 'accountant', 'حسابدار'


class User(AbstractUser):
    """کاربر سیستم با دو سطح دسترسی: مدیر و حسابدار."""

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.ACCOUNTANT,
        verbose_name='نقش',
    )
    phone_number = models.CharField(max_length=15, blank=True, verbose_name='شماره تماس')
    national_id = models.CharField(max_length=10, blank=True, verbose_name='کد ملی')
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True, verbose_name='تصویر')
    is_active = models.BooleanField(default=True, verbose_name='فعال')

    class Meta:
        verbose_name = 'کاربر'
        verbose_name_plural = 'کاربران'
        ordering = ['-date_joined']

    def __str__(self):
        return f'{self.display_name} ({self.get_role_display()})'

    @property
    def display_name(self) -> str:
        full = f'{self.first_name} {self.last_name}'.strip()
        return full or self.username

    @property
    def is_manager(self) -> bool:
        return self.role == Role.MANAGER or self.is_superuser

    @property
    def is_accountant(self) -> bool:
        return self.role == Role.ACCOUNTANT


class ActivityLog(BaseModel):
    """گزارش فعالیت کاربران برای ردگیری تغییرات مهم."""

    class Action(models.TextChoices):
        CREATE = 'create', 'ایجاد'
        UPDATE = 'update', 'ویرایش'
        DELETE = 'delete', 'حذف'
        LOGIN = 'login', 'ورود'
        STATUS = 'status', 'تغییر وضعیت'
        IMPORT = 'import', 'ورود داده'

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='activity_logs',
        verbose_name='کاربر',
    )
    action = models.CharField(max_length=20, choices=Action.choices, verbose_name='عملیات')
    entity = models.CharField(max_length=100, verbose_name='موجودیت')
    entity_id = models.CharField(max_length=50, blank=True, verbose_name='شناسه')
    description = models.TextField(blank=True, verbose_name='توضیحات')
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name='آدرس IP')

    class Meta:
        verbose_name = 'گزارش فعالیت'
        verbose_name_plural = 'گزارش‌های فعالیت'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} - {self.get_action_display()} - {self.entity}'


def log_activity(user, action, entity, entity_id='', description='', request=None):
    """ثبت یک رکورد در گزارش فعالیت‌ها."""
    ip = None
    if request is not None:
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
    return ActivityLog.objects.create(
        user=user if getattr(user, 'is_authenticated', False) else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id or ''),
        description=description,
        ip_address=ip,
    )
