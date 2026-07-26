from decimal import Decimal

from django.db import models

from core.models import BaseModel


class PartyType(models.TextChoices):
    CUSTOMER = 'customer', 'مشتری'
    SUPPLIER = 'supplier', 'تأمین‌کننده'
    BOTH = 'both', 'مشتری و تأمین‌کننده'
    OTHER = 'other', 'سایر'


class Party(BaseModel):
    """طرف حساب: مشتری، تأمین‌کننده یا هر شخص/شرکتی که با فروشگاه حساب دارد."""

    code = models.CharField(max_length=20, unique=True, blank=True, verbose_name='کد طرف حساب')
    name = models.CharField(max_length=200, verbose_name='نام / عنوان')
    party_type = models.CharField(
        max_length=20,
        choices=PartyType.choices,
        default=PartyType.CUSTOMER,
        verbose_name='نوع طرف حساب',
    )
    is_legal_entity = models.BooleanField(default=False, verbose_name='شخص حقوقی')
    national_id = models.CharField(max_length=20, blank=True, verbose_name='کد ملی / شناسه ملی')
    economic_code = models.CharField(max_length=20, blank=True, verbose_name='کد اقتصادی')
    mobile = models.CharField(max_length=15, blank=True, verbose_name='موبایل')
    phone = models.CharField(max_length=20, blank=True, verbose_name='تلفن')
    email = models.EmailField(blank=True, verbose_name='ایمیل')
    city = models.CharField(max_length=100, blank=True, verbose_name='شهر')
    address = models.TextField(blank=True, verbose_name='نشانی')
    postal_code = models.CharField(max_length=12, blank=True, verbose_name='کد پستی')

    opening_balance = models.DecimalField(
        max_digits=18, decimal_places=0, default=0,
        verbose_name='مانده اولیه (مثبت = بدهکار)',
    )
    credit_limit = models.DecimalField(
        max_digits=18, decimal_places=0, default=0,
        verbose_name='سقف اعتبار',
    )
    is_active = models.BooleanField(default=True, verbose_name='فعال')
    notes = models.TextField(blank=True, verbose_name='یادداشت')

    class Meta:
        verbose_name = 'طرف حساب'
        verbose_name_plural = 'طرف‌های حساب'
        ordering = ['name']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['party_type']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.code:
            last = Party.objects.order_by('-id').first()
            next_id = (last.id + 1) if last else 1
            self.code = f'P{next_id:05d}'
        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # محاسبه‌ی مانده حساب
    # ------------------------------------------------------------------
    def compute_balance(self, until=None) -> Decimal:
        """مانده حساب طرف حساب.

        مثبت => طرف حساب به ما بدهکار است.
        منفی => ما به طرف حساب بدهکار هستیم (طرف حساب بستانکار است).
        """
        from django.db.models import Sum

        entries = self.ledger_entries.all()
        if until is not None:
            entries = entries.filter(date__lte=until)
        totals = entries.aggregate(
            debit=Sum('debit'),
            credit=Sum('credit'),
        )
        debit = totals['debit'] or Decimal('0')
        credit = totals['credit'] or Decimal('0')
        return Decimal(self.opening_balance) + debit - credit

    @property
    def balance(self) -> Decimal:
        return self.compute_balance()

    @property
    def balance_state(self) -> str:
        balance = self.balance
        if balance > 0:
            return 'debtor'
        if balance < 0:
            return 'creditor'
        return 'settled'

    @property
    def balance_state_display(self) -> str:
        return {
            'debtor': 'بدهکار',
            'creditor': 'بستانکار',
            'settled': 'تسویه',
        }[self.balance_state]
