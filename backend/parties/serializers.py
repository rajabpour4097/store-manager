from rest_framework import serializers

from core.jalali import to_jalali

from .models import Party, PartyType


class PartySerializer(serializers.ModelSerializer):
    party_type_display = serializers.CharField(source='get_party_type_display', read_only=True)
    balance = serializers.SerializerMethodField()
    balance_state = serializers.SerializerMethodField()
    balance_state_display = serializers.SerializerMethodField()
    created_at_jalali = serializers.SerializerMethodField()

    class Meta:
        model = Party
        fields = [
            'id', 'code', 'name', 'party_type', 'party_type_display', 'is_legal_entity',
            'national_id', 'economic_code', 'mobile', 'phone', 'email', 'city', 'address',
            'postal_code', 'opening_balance', 'credit_limit', 'is_active', 'notes',
            'balance', 'balance_state', 'balance_state_display',
            'created_at', 'created_at_jalali',
        ]
        read_only_fields = ['id', 'code', 'created_at']

    def get_balance(self, obj):
        cached = getattr(obj, 'cached_balance', None)
        return cached if cached is not None else obj.balance

    def get_balance_state(self, obj):
        balance = self.get_balance(obj)
        if balance > 0:
            return 'debtor'
        if balance < 0:
            return 'creditor'
        return 'settled'

    def get_balance_state_display(self, obj):
        return {'debtor': 'بدهکار', 'creditor': 'بستانکار', 'settled': 'تسویه'}[
            self.get_balance_state(obj)
        ]

    def get_created_at_jalali(self, obj):
        return to_jalali(obj.created_at)

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('نام طرف حساب باید حداقل ۲ کاراکتر باشد.')
        return value

    def validate(self, attrs):
        national_id = attrs.get('national_id', '').strip() if attrs.get('national_id') else ''
        if national_id and not national_id.isdigit():
            raise serializers.ValidationError({'national_id': 'کد ملی / شناسه ملی باید فقط عدد باشد.'})
        return attrs


class PartyMiniSerializer(serializers.ModelSerializer):
    party_type_display = serializers.CharField(source='get_party_type_display', read_only=True)

    class Meta:
        model = Party
        fields = ['id', 'code', 'name', 'party_type', 'party_type_display', 'mobile']


class PartyTypeChoiceSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()

    @staticmethod
    def all_choices():
        return [{'value': value, 'label': label} for value, label in PartyType.choices]
