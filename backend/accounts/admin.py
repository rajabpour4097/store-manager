from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import ActivityLog, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'display_name', 'role', 'phone_number', 'is_active', 'last_login']
    list_filter = ['role', 'is_active', 'is_superuser']
    search_fields = ['username', 'first_name', 'last_name', 'phone_number']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('اطلاعات تکمیلی', {'fields': ('role', 'phone_number', 'national_id', 'avatar')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('اطلاعات تکمیلی', {'fields': ('role', 'phone_number')}),
    )


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'user', 'action', 'entity', 'entity_id']
    list_filter = ['action', 'entity']
    search_fields = ['description', 'entity_id']
    readonly_fields = ['created_at', 'modified_at']
