from django.contrib import admin

from .models import BankAccount, FinanceCategory, FinanceRecord, LedgerEntry


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ['title', 'bank_name', 'account_number', 'is_active']
    list_filter = ['is_active', 'bank_name']
    search_fields = ['title', 'bank_name', 'account_number']


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = ['date', 'party', 'debit', 'credit', 'category', 'source_type', 'is_system_generated']
    list_filter = ['category', 'source_type', 'is_system_generated']
    search_fields = ['party__name', 'description', 'document_number']
    autocomplete_fields = ['party']
    date_hierarchy = 'date'


@admin.register(FinanceCategory)
class FinanceCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'kind', 'is_active']
    list_filter = ['kind', 'is_active']
    search_fields = ['name']


@admin.register(FinanceRecord)
class FinanceRecordAdmin(admin.ModelAdmin):
    list_display = ['date', 'kind', 'title', 'amount', 'category', 'payment_method']
    list_filter = ['kind', 'category', 'payment_method']
    search_fields = ['title', 'description']
    date_hierarchy = 'date'
