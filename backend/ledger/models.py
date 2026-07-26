from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from core.models import BaseModel


class EntryCategory(models.TextChoices):
    OPENING = 'opening', 'مانده اولیه'
    SALE_INVOICE = 'sale_invoice', 'فاکتور فروش'
    PURCHASE_INVOICE = 'purchase_invoice', 'فاکتور خرید'
    CASH_RECEIPT = 'cash_receipt', 'دریافت نقدی'
    CASH_PAYMENT = 'cash_payment', 'پرداخت نقدی'
    CHEQUE_RECEIVED = 'cheque_received', 'دریافت چک'
    CHEQUE_ISSUED = 'cheque_issued', 'صدور چک'
    CHEQUE_CLEARED = 'cheque_cleared', 'وصول چک'
    CHEQUE_BOUNCED = 'cheque_bounced', 'برگشت چک'
    DISCOUNT = 'discount', 'تخفیف'
    RETURN = 'return', 'مرجوعی'
    ADJUSTMENT = 'adjustment', 'تعدیل حساب'
    OTHER = 'other', 'سایر'


class SourceType(models.TextChoices):
    MANUAL = 'manual', 'ثبت دستی'
    ORDER = 'order', 'سفارش'
    CHEQUE = 'cheque', 'چک'
    FINANCE = 'finance', 'هزینه/درآمد'


class BankAccount(BaseModel):
    """حساب بانکی فروشگاه."""

    title = models.CharField(max_length=120, verbose_name='عنوان حساب')
    bank_name = models.CharField(max_length=100, verbose_name='نام بانک')
    account_number = models.CharField(max_length=40, blank=True, verbose_name='شماره حساب')
    iban = models.CharField(max_length=30, blank=True, verbose_name='شبا')
    card_number = models.CharField(max_length=20, blank=True, verbose_name='شماره کارت')
    branch = models.CharField(max_length=120, blank=True, verbose_name='شعبه')
    initial_balance = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                          verbose_name='موجودی اولیه')
    is_active = models.BooleanField(default=True, verbose_name='فعال')

    class Meta:
        verbose_name = 'حساب بانکی'
        verbose_name_plural = 'حساب‌های بانکی'
        ordering = ['title']

    def __str__(self):
        return f'{self.title} - {self.bank_name}'


class LedgerEntry(BaseModel):
    """یک ردیف در دفتر معین طرف حساب (بدهکار / بستانکار).

    * بدهکار (debit): طرف حساب به فروشگاه بدهکار می‌شود (مثلاً فاکتور فروش).
    * بستانکار (credit): بدهی طرف حساب کم می‌شود یا فروشگاه به او بدهکار می‌شود
      (مثلاً دریافت وجه از مشتری یا فاکتور خرید).
    """

    party = models.ForeignKey(
        'parties.Party',
        on_delete=models.CASCADE,
        related_name='ledger_entries',
        verbose_name='طرف حساب',
    )
    date = models.DateField(verbose_name='تاریخ')
    debit = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                validators=[MinValueValidator(Decimal('0'))],
                                verbose_name='بدهکار')
    credit = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                 validators=[MinValueValidator(Decimal('0'))],
                                 verbose_name='بستانکار')
    category = models.CharField(max_length=30, choices=EntryCategory.choices,
                                default=EntryCategory.OTHER, verbose_name='بابت')
    document_number = models.CharField(max_length=50, blank=True, verbose_name='شماره سند')
    description = models.TextField(blank=True, verbose_name='شرح')

    source_type = models.CharField(max_length=20, choices=SourceType.choices,
                                   default=SourceType.MANUAL, verbose_name='منبع')
    source_id = models.PositiveIntegerField(null=True, blank=True, verbose_name='شناسه منبع')
    is_system_generated = models.BooleanField(default=False, verbose_name='تولید سیستمی')

    bank_account = models.ForeignKey(
        BankAccount, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='ledger_entries', verbose_name='حساب بانکی',
    )
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='ledger_entries', verbose_name='ثبت‌کننده',
    )

    class Meta:
        verbose_name = 'سند بدهکار/بستانکار'
        verbose_name_plural = 'اسناد بدهکار/بستانکار'
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['party', 'date']),
            models.Index(fields=['date']),
            models.Index(fields=['source_type', 'source_id']),
        ]

    def __str__(self):
        return f'{self.party} | {self.date} | بدهکار {self.debit} / بستانکار {self.credit}'

    @property
    def amount(self) -> Decimal:
        return self.debit if self.debit else self.credit

    @property
    def entry_type(self) -> str:
        return 'debit' if self.debit else 'credit'


class FinanceCategory(BaseModel):
    """دسته‌بندی هزینه‌ها و درآمدهای متفرقه."""

    class Kind(models.TextChoices):
        EXPENSE = 'expense', 'هزینه'
        INCOME = 'income', 'درآمد'

    name = models.CharField(max_length=120, verbose_name='نام دسته')
    kind = models.CharField(max_length=10, choices=Kind.choices,
                            default=Kind.EXPENSE, verbose_name='نوع')
    description = models.TextField(blank=True, verbose_name='توضیحات')
    is_active = models.BooleanField(default=True, verbose_name='فعال')

    class Meta:
        verbose_name = 'دسته هزینه/درآمد'
        verbose_name_plural = 'دسته‌های هزینه و درآمد'
        ordering = ['kind', 'name']
        unique_together = [('name', 'kind')]

    def __str__(self):
        return f'{self.name} ({self.get_kind_display()})'


class FinanceRecord(BaseModel):
    """ثبت هزینه‌های عملیاتی و درآمدهای غیرفروش."""

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'نقدی'
        CARD = 'card', 'کارت به کارت'
        TRANSFER = 'transfer', 'حواله بانکی'
        CHEQUE = 'cheque', 'چک'
        OTHER = 'other', 'سایر'

    kind = models.CharField(max_length=10, choices=FinanceCategory.Kind.choices,
                            default=FinanceCategory.Kind.EXPENSE, verbose_name='نوع')
    category = models.ForeignKey(FinanceCategory, on_delete=models.PROTECT,
                                 related_name='records', verbose_name='دسته')
    title = models.CharField(max_length=200, verbose_name='عنوان')
    amount = models.DecimalField(max_digits=18, decimal_places=0,
                                 validators=[MinValueValidator(Decimal('1'))],
                                 verbose_name='مبلغ')
    date = models.DateField(verbose_name='تاریخ')
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices,
                                      default=PaymentMethod.CASH, verbose_name='روش پرداخت')
    party = models.ForeignKey('parties.Party', on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='finance_records', verbose_name='طرف حساب')
    bank_account = models.ForeignKey(BankAccount, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='finance_records', verbose_name='حساب بانکی')
    description = models.TextField(blank=True, verbose_name='توضیحات')
    attachment = models.FileField(upload_to='finance/', blank=True, null=True, verbose_name='پیوست')
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='finance_records', verbose_name='ثبت‌کننده')

    class Meta:
        verbose_name = 'هزینه / درآمد'
        verbose_name_plural = 'هزینه‌ها و درآمدها'
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['kind', 'date']),
            models.Index(fields=['date']),
        ]

    def __str__(self):
        return f'{self.get_kind_display()} - {self.title} - {self.amount}'

    def save(self, *args, **kwargs):
        if self.category_id and self.category.kind != self.kind:
            self.kind = self.category.kind
        super().save(*args, **kwargs)
