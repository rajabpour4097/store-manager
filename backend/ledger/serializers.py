from decimal import Decimal

from rest_framework import serializers

from core.jalali import to_jalali
from parties.models import Party
from parties.serializers import PartyMiniSerializer

from .models import (
    BankAccount,
    EntryCategory,
    FinanceCategory,
    FinanceRecord,
    LedgerEntry,
    SourceType,
)


class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = [
            'id', 'title', 'bank_name', 'account_number', 'iban', 'card_number',
            'branch', 'initial_balance', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class LedgerEntrySerializer(serializers.ModelSerializer):
    party_detail = PartyMiniSerializer(source='party', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    source_type_display = serializers.CharField(source='get_source_type_display', read_only=True)
    entry_type = serializers.CharField(read_only=True)
    amount = serializers.DecimalField(max_digits=18, decimal_places=0, read_only=True)
    date_jalali = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, default='')
    bank_account_title = serializers.CharField(source='bank_account.title', read_only=True, default='')

    class Meta:
        model = LedgerEntry
        fields = [
            'id', 'party', 'party_detail', 'date', 'date_jalali', 'debit', 'credit',
            'amount', 'entry_type', 'category', 'category_display', 'document_number',
            'description', 'source_type', 'source_type_display', 'source_id',
            'is_system_generated', 'bank_account', 'bank_account_title',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'is_system_generated']

    def get_date_jalali(self, obj):
        return to_jalali(obj.date)

    def validate(self, attrs):
        debit = attrs.get('debit', getattr(self.instance, 'debit', Decimal('0'))) or Decimal('0')
        credit = attrs.get('credit', getattr(self.instance, 'credit', Decimal('0'))) or Decimal('0')

        if debit < 0 or credit < 0:
            raise serializers.ValidationError('مبلغ بدهکار و بستانکار نمی‌تواند منفی باشد.')
        if debit == 0 and credit == 0:
            raise serializers.ValidationError('یکی از مبالغ بدهکار یا بستانکار باید بزرگ‌تر از صفر باشد.')
        if debit > 0 and credit > 0:
            raise serializers.ValidationError('یک سند نمی‌تواند هم‌زمان بدهکار و بستانکار باشد.')
        return attrs

    def update(self, instance, validated_data):
        if instance.is_system_generated:
            raise serializers.ValidationError(
                'این سند به‌صورت خودکار از سفارش یا چک ساخته شده و قابل ویرایش دستی نیست.'
            )
        return super().update(instance, validated_data)


class SimpleLedgerEntrySerializer(serializers.Serializer):
    """ثبت سریع سند بدهکار/بستانکار با یک مبلغ و نوع."""

    party = serializers.PrimaryKeyRelatedField(queryset=Party.objects.all())
    date = serializers.DateField()
    entry_type = serializers.ChoiceField(choices=[('debit', 'بدهکار'), ('credit', 'بستانکار')])
    amount = serializers.DecimalField(max_digits=18, decimal_places=0, min_value=Decimal('1'))
    category = serializers.ChoiceField(choices=EntryCategory.choices, default=EntryCategory.OTHER)
    document_number = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=BankAccount.objects.all(), required=False, allow_null=True)

    def create(self, validated_data):
        entry_type = validated_data.pop('entry_type')
        amount = validated_data.pop('amount')
        return LedgerEntry.objects.create(
            debit=amount if entry_type == 'debit' else 0,
            credit=amount if entry_type == 'credit' else 0,
            source_type=SourceType.MANUAL,
            created_by=self.context['request'].user,
            **validated_data,
        )


class FinanceCategorySerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    records_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = FinanceCategory
        fields = ['id', 'name', 'kind', 'kind_display', 'description', 'is_active', 'records_count']


class FinanceRecordSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    party_name = serializers.CharField(source='party.name', read_only=True, default='')
    date_jalali = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, default='')

    class Meta:
        model = FinanceRecord
        fields = [
            'id', 'kind', 'kind_display', 'category', 'category_name', 'title', 'amount',
            'date', 'date_jalali', 'payment_method', 'payment_method_display', 'party',
            'party_name', 'bank_account', 'description', 'attachment', 'created_by',
            'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by']

    def get_date_jalali(self, obj):
        return to_jalali(obj.date)

    def validate(self, attrs):
        category = attrs.get('category') or getattr(self.instance, 'category', None)
        kind = attrs.get('kind') or getattr(self.instance, 'kind', None)
        if category and kind and category.kind != kind:
            raise serializers.ValidationError(
                {'category': 'نوع دسته‌بندی با نوع رکورد هم‌خوانی ندارد.'}
            )
        return attrs
