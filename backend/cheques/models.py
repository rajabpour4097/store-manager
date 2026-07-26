from datetime import date
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from core.models import BaseModel

IRANIAN_BANKS = [
    ('melli', 'بانک ملی ایران'),
    ('sepah', 'بانک سپه'),
    ('tejarat', 'بانک تجارت'),
    ('mellat', 'بانک ملت'),
    ('saderat', 'بانک صادرات ایران'),
    ('keshavarzi', 'بانک کشاورزی'),
    ('maskan', 'بانک مسکن'),
    ('sanat_madan', 'بانک صنعت و معدن'),
    ('refah', 'بانک رفاه کارگران'),
    ('post', 'پست بانک ایران'),
    ('tosee_saderat', 'بانک توسعه صادرات'),
    ('tosee_taavon', 'بانک توسعه تعاون'),
    ('parsian', 'بانک پارسیان'),
    ('pasargad', 'بانک پاسارگاد'),
    ('saman', 'بانک سامان'),
    ('sina', 'بانک سینا'),
    ('shahr', 'بانک شهر'),
    ('dey', 'بانک دی'),
    ('ansar', 'بانک انصار'),
    ('eghtesad_novin', 'بانک اقتصاد نوین'),
    ('karafarin', 'بانک کارآفرین'),
    ('gardeshgari', 'بانک گردشگری'),
    ('iran_zamin', 'بانک ایران زمین'),
    ('ayandeh', 'بانک آینده'),
    ('resalat', 'بانک قرض‌الحسنه رسالت'),
    ('mehr_iran', 'بانک قرض‌الحسنه مهر ایران'),
    ('khavarmiane', 'بانک خاورمیانه'),
    ('sarmayeh', 'بانک سرمایه'),
    ('other', 'سایر'),
]


class ChequeDirection(models.TextChoices):
    PAYABLE = 'payable', 'پرداختی'
    RECEIVABLE = 'receivable', 'دریافتی'


class ChequeStatus(models.TextChoices):
    IN_PORTFOLIO = 'in_portfolio', 'در جریان'
    SUBMITTED = 'submitted', 'واگذار شده به بانک'
    CLEARED = 'cleared', 'وصول شده'
    BOUNCED = 'bounced', 'برگشتی'
    RETURNED = 'returned', 'عودت داده شده'
    TRANSFERRED = 'transferred', 'واگذار به غیر (خرج شده)'
    EXTENDED = 'extended', 'تمدید شده'
    CANCELLED = 'cancelled', 'ابطال شده'


# وضعیت‌هایی که چک در آن‌ها هنوز «باز» است و روی نقدینگی آینده اثر دارد
OPEN_STATUSES = [
    ChequeStatus.IN_PORTFOLIO,
    ChequeStatus.SUBMITTED,
    ChequeStatus.EXTENDED,
]

# وضعیت‌های نهایی
FINAL_STATUSES = [
    ChequeStatus.CLEARED,
    ChequeStatus.RETURNED,
    ChequeStatus.TRANSFERRED,
    ChequeStatus.CANCELLED,
]


class Cheque(BaseModel):
    """چک پرداختی (صادره) یا دریافتی (وارده)."""

    direction = models.CharField(max_length=15, choices=ChequeDirection.choices,
                                 verbose_name='نوع چک')
    serial_number = models.CharField(max_length=30, verbose_name='شماره چک')
    sayad_id = models.CharField(max_length=16, blank=True, verbose_name='شناسه صیادی')
    bank_name = models.CharField(max_length=30, choices=IRANIAN_BANKS,
                                 default='other', verbose_name='بانک')
    branch = models.CharField(max_length=120, blank=True, verbose_name='شعبه')
    account_number = models.CharField(max_length=40, blank=True, verbose_name='شماره حساب')

    amount = models.DecimalField(max_digits=18, decimal_places=0,
                                 validators=[MinValueValidator(Decimal('1'))],
                                 verbose_name='مبلغ')
    issue_date = models.DateField(verbose_name='تاریخ صدور')
    due_date = models.DateField(verbose_name='تاریخ سرسید')

    party = models.ForeignKey('parties.Party', on_delete=models.PROTECT,
                              related_name='cheques', verbose_name='طرف حساب')
    holder_name = models.CharField(max_length=200, blank=True,
                                   verbose_name='در وجه / صاحب چک')

    status = models.CharField(max_length=20, choices=ChequeStatus.choices,
                              default=ChequeStatus.IN_PORTFOLIO, verbose_name='وضعیت')
    settled_date = models.DateField(null=True, blank=True, verbose_name='تاریخ تعیین وضعیت نهایی')

    bank_account = models.ForeignKey('ledger.BankAccount', on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='cheques',
                                     verbose_name='حساب بانکی فروشگاه')
    order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='cheques', verbose_name='سفارش مرتبط')

    description = models.TextField(blank=True, verbose_name='توضیحات')
    attachment = models.FileField(upload_to='cheques/', blank=True, null=True, verbose_name='تصویر چک')
    create_ledger_entry = models.BooleanField(
        default=True, verbose_name='ثبت خودکار در دفتر طرف حساب')

    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='created_cheques', verbose_name='ثبت‌کننده')

    class Meta:
        verbose_name = 'چک'
        verbose_name_plural = 'چک‌ها'
        ordering = ['due_date', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['direction', 'bank_name', 'serial_number'],
                name='unique_cheque_serial_per_bank_direction',
            ),
        ]
        indexes = [
            models.Index(fields=['direction', 'status']),
            models.Index(fields=['due_date']),
            models.Index(fields=['party']),
        ]

    def __str__(self):
        return f'{self.get_direction_display()} - {self.serial_number} - {self.amount:,}'

    # ------------------------------------------------------------------
    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES

    @property
    def days_to_due(self) -> int:
        return (self.due_date - date.today()).days

    @property
    def is_overdue(self) -> bool:
        return self.is_open and self.due_date < date.today()

    @property
    def due_state(self) -> str:
        """وضعیت سرسید برای رنگ‌بندی در رابط کاربری."""
        if not self.is_open:
            return 'settled'
        days = self.days_to_due
        if days < 0:
            return 'overdue'
        if days <= 3:
            return 'critical'
        if days <= 7:
            return 'warning'
        if days <= 30:
            return 'upcoming'
        return 'far'

    @property
    def due_state_display(self) -> str:
        return {
            'settled': 'تعیین وضعیت شده',
            'overdue': 'سرسید گذشته',
            'critical': 'سرسید بحرانی (≤۳ روز)',
            'warning': 'نزدیک سرسید (≤۷ روز)',
            'upcoming': 'در یک ماه آینده',
            'far': 'سرسید دور',
        }[self.due_state]

    @property
    def bank_display(self) -> str:
        return dict(IRANIAN_BANKS).get(self.bank_name, self.bank_name)


class ChequeStatusHistory(BaseModel):
    """تاریخچه‌ی تغییر وضعیت چک."""

    cheque = models.ForeignKey(Cheque, on_delete=models.CASCADE,
                               related_name='status_history', verbose_name='چک')
    from_status = models.CharField(max_length=20, choices=ChequeStatus.choices, blank=True,
                                   verbose_name='وضعیت قبلی')
    to_status = models.CharField(max_length=20, choices=ChequeStatus.choices,
                                 verbose_name='وضعیت جدید')
    changed_at_date = models.DateField(verbose_name='تاریخ رویداد')
    note = models.TextField(blank=True, verbose_name='یادداشت')
    changed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='cheque_status_changes', verbose_name='کاربر')

    class Meta:
        verbose_name = 'تاریخچه وضعیت چک'
        verbose_name_plural = 'تاریخچه وضعیت چک‌ها'
        ordering = ['-changed_at_date', '-id']

    def __str__(self):
        return f'{self.cheque.serial_number}: {self.from_status} → {self.to_status}'
