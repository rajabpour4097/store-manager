from rest_framework import serializers

from core.jalali import to_jalali, to_jalali_verbose
from parties.serializers import PartyMiniSerializer

from .models import IRANIAN_BANKS, Cheque, ChequeDirection, ChequeStatus, ChequeStatusHistory


class ChequeStatusHistorySerializer(serializers.ModelSerializer):
    from_status_display = serializers.CharField(source='get_from_status_display', read_only=True)
    to_status_display = serializers.CharField(source='get_to_status_display', read_only=True)
    changed_by_name = serializers.CharField(source='changed_by.display_name', read_only=True, default='')
    changed_at_date_jalali = serializers.SerializerMethodField()

    class Meta:
        model = ChequeStatusHistory
        fields = [
            'id', 'from_status', 'from_status_display', 'to_status', 'to_status_display',
            'changed_at_date', 'changed_at_date_jalali', 'note', 'changed_by',
            'changed_by_name', 'created_at',
        ]

    def get_changed_at_date_jalali(self, obj):
        return to_jalali(obj.changed_at_date)


class ChequeSerializer(serializers.ModelSerializer):
    party_detail = PartyMiniSerializer(source='party', read_only=True)
    direction_display = serializers.CharField(source='get_direction_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    bank_display = serializers.CharField(read_only=True)
    due_state = serializers.CharField(read_only=True)
    due_state_display = serializers.CharField(read_only=True)
    days_to_due = serializers.IntegerField(read_only=True)
    is_open = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    issue_date_jalali = serializers.SerializerMethodField()
    due_date_jalali = serializers.SerializerMethodField()
    due_date_verbose = serializers.SerializerMethodField()
    settled_date_jalali = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.display_name', read_only=True, default='')
    allowed_transitions = serializers.SerializerMethodField()
    order_number = serializers.CharField(source='order.number', read_only=True, default='')

    class Meta:
        model = Cheque
        fields = [
            'id', 'direction', 'direction_display', 'serial_number', 'sayad_id',
            'bank_name', 'bank_display', 'branch', 'account_number', 'amount',
            'issue_date', 'issue_date_jalali', 'due_date', 'due_date_jalali',
            'due_date_verbose', 'party', 'party_detail', 'holder_name', 'status',
            'status_display', 'settled_date', 'settled_date_jalali', 'bank_account',
            'order', 'order_number', 'description', 'attachment', 'create_ledger_entry',
            'created_by', 'created_by_name', 'created_at', 'due_state', 'due_state_display',
            'days_to_due', 'is_open', 'is_overdue', 'allowed_transitions',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'settled_date', 'status']
        # اعتبارسنجی یکتایی به‌صورت دستی انجام می‌شود تا پیام فارسی روشنی برگردد
        validators = []

    def get_issue_date_jalali(self, obj):
        return to_jalali(obj.issue_date)

    def get_due_date_jalali(self, obj):
        return to_jalali(obj.due_date)

    def get_due_date_verbose(self, obj):
        return to_jalali_verbose(obj.due_date)

    def get_settled_date_jalali(self, obj):
        return to_jalali(obj.settled_date)

    def get_allowed_transitions(self, obj):
        from .services import allowed_next_statuses
        return allowed_next_statuses(obj)

    def validate_serial_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('شماره چک الزامی است.')
        return value

    def validate_sayad_id(self, value):
        value = (value or '').strip()
        if value and (not value.isdigit() or len(value) != 16):
            raise serializers.ValidationError('شناسه صیادی باید یک عدد ۱۶ رقمی باشد.')
        return value

    def validate(self, attrs):
        issue_date = attrs.get('issue_date') or getattr(self.instance, 'issue_date', None)
        due_date = attrs.get('due_date') or getattr(self.instance, 'due_date', None)

        if issue_date and due_date and due_date < issue_date:
            raise serializers.ValidationError(
                {'due_date': 'تاریخ سرسید نمی‌تواند قبل از تاریخ صدور باشد.'}
            )

        direction = attrs.get('direction') or getattr(self.instance, 'direction', None)
        bank_name = attrs.get('bank_name') or getattr(self.instance, 'bank_name', None)
        serial = attrs.get('serial_number') or getattr(self.instance, 'serial_number', None)

        if direction and bank_name and serial:
            duplicate = Cheque.objects.filter(
                direction=direction, bank_name=bank_name, serial_number=serial)
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError(
                    {'serial_number': 'چکی با همین شماره و بانک و نوع قبلاً ثبت شده است.'}
                )
        return attrs


class ChequeDetailSerializer(ChequeSerializer):
    status_history = ChequeStatusHistorySerializer(many=True, read_only=True)

    class Meta(ChequeSerializer.Meta):
        fields = ChequeSerializer.Meta.fields + ['status_history']


class ChequeStatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ChequeStatus.choices)
    event_date = serializers.DateField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True)


class ChequeExtendSerializer(serializers.Serializer):
    due_date = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True)


def cheque_choice_options() -> dict:
    return {
        'directions': [{'value': v, 'label': l} for v, l in ChequeDirection.choices],
        'statuses': [{'value': v, 'label': l} for v, l in ChequeStatus.choices],
        'banks': [{'value': v, 'label': l} for v, l in IRANIAN_BANKS],
    }
