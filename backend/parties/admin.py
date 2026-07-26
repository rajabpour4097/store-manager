from django.contrib import admin

from .models import Party


@admin.register(Party)
class PartyAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'party_type', 'mobile', 'city', 'is_active']
    list_filter = ['party_type', 'is_active', 'is_legal_entity']
    search_fields = ['name', 'code', 'mobile', 'national_id']
    readonly_fields = ['code', 'created_at', 'modified_at']
