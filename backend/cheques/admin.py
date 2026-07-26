from django.contrib import admin

from .models import Cheque, ChequeStatusHistory


class ChequeStatusHistoryInline(admin.TabularInline):
    model = ChequeStatusHistory
    extra = 0
    readonly_fields = ['created_at']


@admin.register(Cheque)
class ChequeAdmin(admin.ModelAdmin):
    list_display = ['serial_number', 'direction', 'party', 'amount', 'due_date', 'status']
    list_filter = ['direction', 'status', 'bank_name']
    search_fields = ['serial_number', 'sayad_id', 'party__name']
    autocomplete_fields = ['party']
    date_hierarchy = 'due_date'
    inlines = [ChequeStatusHistoryInline]


@admin.register(ChequeStatusHistory)
class ChequeStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ['cheque', 'from_status', 'to_status', 'changed_at_date', 'changed_by']
    list_filter = ['to_status']
