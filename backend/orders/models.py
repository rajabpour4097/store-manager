from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from core.models import BaseModel


class OrderType(models.TextChoices):
    SALE = 'sale', 'فروش'
    PURCHASE = 'purchase', 'خرید'


class OrderStatus(models.TextChoices):
    DRAFT = 'draft', 'پیش‌نویس'
    CONFIRMED = 'confirmed', 'تأیید شده'
    PARTIAL = 'partial', 'تحویل جزئی'
    COMPLETED = 'completed', 'تکمیل شده'
    CANCELLED = 'cancelled', 'لغو شده'


class PaymentStatus(models.TextChoices):
    UNPAID = 'unpaid', 'پرداخت نشده'
    PARTIAL = 'partial', 'پرداخت جزئی'
    PAID = 'paid', 'تسویه شده'


class EntryMode(models.TextChoices):
    MANUAL = 'manual', 'دستی'
    AUTOMATIC = 'automatic', 'اتوماتیک'


class OcrStatus(models.TextChoices):
    PENDING = 'pending', 'در انتظار'
    PROCESSING = 'processing', 'در حال پردازش'
    DONE = 'done', 'انجام شده'
    REVIEW = 'review', 'نیاز به بررسی'
    FAILED = 'failed', 'ناموفق'


class Order(BaseModel):
    """سفارش فروش یا خرید."""

    number = models.CharField(max_length=25, unique=True, blank=True, verbose_name='شماره سفارش')
    order_type = models.CharField(max_length=15, choices=OrderType.choices,
                                  default=OrderType.SALE, verbose_name='نوع سفارش')
    party = models.ForeignKey('parties.Party', on_delete=models.PROTECT,
                              related_name='orders', verbose_name='طرف حساب')
    order_date = models.DateField(verbose_name='تاریخ سفارش')
    due_date = models.DateField(null=True, blank=True, verbose_name='مهلت پرداخت / تحویل')

    status = models.CharField(max_length=15, choices=OrderStatus.choices,
                              default=OrderStatus.DRAFT, verbose_name='وضعیت')
    payment_status = models.CharField(max_length=15, choices=PaymentStatus.choices,
                                      default=PaymentStatus.UNPAID, verbose_name='وضعیت پرداخت')

    discount_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                          validators=[MinValueValidator(Decimal('0'))],
                                          verbose_name='تخفیف')
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                      verbose_name='درصد مالیات')
    shipping_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                          verbose_name='هزینه ارسال')

    subtotal = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                   verbose_name='جمع اقلام')
    tax_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                     verbose_name='مبلغ مالیات')
    total_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                       verbose_name='مبلغ نهایی')
    paid_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                      verbose_name='مبلغ پرداخت‌شده')
    cost_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                      verbose_name='بهای تمام‌شده اقلام')

    affects_stock = models.BooleanField(default=True, verbose_name='اثر روی موجودی انبار')
    description = models.TextField(blank=True, verbose_name='توضیحات')

    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='created_orders', verbose_name='ثبت‌کننده')
    confirmed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name='confirmed_orders', verbose_name='تأییدکننده')
    confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان تأیید')

    # ارتباط با پیشنهاد هوشمندی که منشأ این سفارش بوده است
    source_suggestion = models.ForeignKey(
        'orders.PurchaseSuggestion', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='generated_orders', verbose_name='پیشنهاد مبدأ',
    )

    entry_mode = models.CharField(max_length=15, choices=EntryMode.choices,
                                  default=EntryMode.MANUAL, verbose_name='روش ثبت')
    invoice_image = models.ImageField(upload_to='invoices/', blank=True, null=True,
                                      verbose_name='تصویر فاکتور')
    ocr_status = models.CharField(max_length=15, choices=OcrStatus.choices,
                                  default=OcrStatus.PENDING, verbose_name='وضعیت استخراج')
    ocr_payload = models.JSONField(default=dict, blank=True, verbose_name='داده استخراج‌شده')
    ocr_confidence = models.PositiveSmallIntegerField(default=0, verbose_name='درصد اطمینان OCR')

    class Meta:
        verbose_name = 'سفارش'
        verbose_name_plural = 'سفارشات'
        ordering = ['-order_date', '-id']
        indexes = [
            models.Index(fields=['order_type', 'status']),
            models.Index(fields=['order_date']),
            models.Index(fields=['party']),
        ]

    def __str__(self):
        return f'{self.get_order_type_display()} {self.number} - {self.party.name}'

    def save(self, *args, **kwargs):
        if not self.number:
            prefix = 'SO' if self.order_type == OrderType.SALE else 'PO'
            last = Order.objects.filter(order_type=self.order_type).order_by('-id').first()
            next_id = (last.id + 1) if last else 1
            self.number = f'{prefix}-{next_id:06d}'
        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    @property
    def remaining_amount(self) -> Decimal:
        return max(Decimal(self.total_amount) - Decimal(self.paid_amount), Decimal('0'))

    @property
    def gross_profit(self) -> Decimal:
        """سود ناویژه؛ فقط برای سفارش فروش معنا دارد."""
        if self.order_type != OrderType.SALE:
            return Decimal('0')
        return Decimal(self.total_amount) - Decimal(self.tax_amount) - Decimal(self.cost_amount)

    @property
    def items_count(self) -> int:
        return self.items.count()

    @property
    def is_editable(self) -> bool:
        return self.status in (OrderStatus.DRAFT, OrderStatus.CONFIRMED)

    def recalculate(self, *, save: bool = True) -> None:
        """محاسبه‌ی مجدد جمع‌ها بر پایه‌ی اقلام سفارش."""
        subtotal = Decimal('0')
        cost = Decimal('0')
        for item in self.items.all():
            subtotal += item.total_price
            cost += item.total_cost

        taxable = max(subtotal - Decimal(self.discount_amount), Decimal('0'))
        tax = (taxable * Decimal(self.tax_percent) / Decimal('100')).quantize(Decimal('1'))

        self.subtotal = subtotal
        self.cost_amount = cost
        self.tax_amount = tax
        self.total_amount = taxable + tax + Decimal(self.shipping_amount)

        paid = Decimal(self.paid_amount)
        if paid <= 0:
            self.payment_status = PaymentStatus.UNPAID
        elif paid >= self.total_amount:
            self.payment_status = PaymentStatus.PAID
        else:
            self.payment_status = PaymentStatus.PARTIAL

        if save:
            self.save(update_fields=[
                'subtotal', 'cost_amount', 'tax_amount', 'total_amount',
                'payment_status', 'modified_at',
            ])


class OrderItem(BaseModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE,
                              related_name='items', verbose_name='سفارش')
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT,
                                related_name='order_items', verbose_name='کالا')
    quantity = models.DecimalField(max_digits=14, decimal_places=2,
                                   validators=[MinValueValidator(Decimal('0.01'))],
                                   verbose_name='مقدار')
    unit_price = models.DecimalField(max_digits=18, decimal_places=0,
                                     validators=[MinValueValidator(Decimal('0'))],
                                     verbose_name='قیمت واحد')
    unit_cost = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                    verbose_name='بهای واحد')
    discount_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                          verbose_name='تخفیف ردیف')
    serial_number = models.CharField(max_length=80, blank=True, verbose_name='شماره سریال')
    description = models.CharField(max_length=255, blank=True, verbose_name='توضیح')

    class Meta:
        verbose_name = 'ردیف سفارش'
        verbose_name_plural = 'ردیف‌های سفارش'
        ordering = ['id']

    def __str__(self):
        if self.serial_number:
            return f'{self.product.name} · {self.serial_number}'
        return f'{self.product.name} × {self.quantity}'

    @property
    def total_price(self) -> Decimal:
        gross = Decimal(self.quantity) * Decimal(self.unit_price)
        return (gross - Decimal(self.discount_amount)).quantize(Decimal('1'))

    @property
    def total_cost(self) -> Decimal:
        return (Decimal(self.quantity) * Decimal(self.unit_cost)).quantize(Decimal('1'))

    def save(self, *args, **kwargs):
        self.serial_number = (self.serial_number or '').strip()
        if self.serial_number:
            self.quantity = Decimal('1')
        if not self.unit_cost and self.product_id:
            self.unit_cost = self.product.purchase_price
        super().save(*args, **kwargs)


class SalesImportBatch(BaseModel):
    """هر بار بارگذاری فایل CSV فروش‌های گذشته."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'در انتظار'
        DONE = 'done', 'انجام شده'
        FAILED = 'failed', 'ناموفق'

    file_name = models.CharField(max_length=255, verbose_name='نام فایل')
    file = models.FileField(upload_to='sales_imports/', blank=True, null=True, verbose_name='فایل')
    status = models.CharField(max_length=15, choices=Status.choices,
                              default=Status.PENDING, verbose_name='وضعیت')
    total_rows = models.PositiveIntegerField(default=0, verbose_name='تعداد کل ردیف')
    imported_rows = models.PositiveIntegerField(default=0, verbose_name='ردیف‌های وارد‌شده')
    skipped_rows = models.PositiveIntegerField(default=0, verbose_name='ردیف‌های رد‌شده')
    created_products = models.PositiveIntegerField(default=0, verbose_name='کالاهای ساخته‌شده')
    errors = models.JSONField(default=list, blank=True, verbose_name='خطاها')
    date_from = models.DateField(null=True, blank=True, verbose_name='از تاریخ')
    date_to = models.DateField(null=True, blank=True, verbose_name='تا تاریخ')
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='sales_imports', verbose_name='کاربر')

    class Meta:
        verbose_name = 'بارگذاری فروش گذشته'
        verbose_name_plural = 'بارگذاری‌های فروش گذشته'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.file_name} ({self.imported_rows}/{self.total_rows})'


class SalesHistory(BaseModel):
    """رکورد فروش گذشته؛ ورودی موتور پیشنهاد هوشمند."""

    batch = models.ForeignKey(SalesImportBatch, on_delete=models.CASCADE,
                              related_name='records', null=True, blank=True, verbose_name='دسته ورود')
    product = models.ForeignKey('catalog.Product', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='sales_history', verbose_name='کالا')
    product_name_raw = models.CharField(max_length=255, verbose_name='نام کالا در فایل')
    sale_date = models.DateField(verbose_name='تاریخ فروش')
    quantity = models.DecimalField(max_digits=14, decimal_places=2, verbose_name='مقدار')
    unit_price = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                     verbose_name='قیمت واحد')
    total_amount = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                       verbose_name='مبلغ کل')
    unit_cost = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                    verbose_name='بهای واحد')
    customer_name = models.CharField(max_length=200, blank=True, verbose_name='نام مشتری')
    party = models.ForeignKey('parties.Party', on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='sales_history', verbose_name='طرف حساب')
    source_order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='history_records', verbose_name='سفارش مبدأ')

    class Meta:
        verbose_name = 'سابقه فروش'
        verbose_name_plural = 'سوابق فروش'
        ordering = ['-sale_date', '-id']
        indexes = [
            models.Index(fields=['product', 'sale_date']),
            models.Index(fields=['sale_date']),
        ]

    def __str__(self):
        return f'{self.product_name_raw} | {self.sale_date} | {self.quantity}'


class PurchaseSuggestion(BaseModel):
    """پیشنهاد هوشمند خرید/سفارش بر پایه‌ی تحلیل فروش‌های گذشته."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'در انتظار بررسی'
        ACCEPTED = 'accepted', 'پذیرفته شده'
        REJECTED = 'rejected', 'رد شده'
        ORDERED = 'ordered', 'سفارش ثبت شد'
        EXPIRED = 'expired', 'منقضی شده'

    class Priority(models.TextChoices):
        CRITICAL = 'critical', 'بحرانی'
        HIGH = 'high', 'بالا'
        MEDIUM = 'medium', 'متوسط'
        LOW = 'low', 'پایین'

    product = models.ForeignKey('catalog.Product', on_delete=models.CASCADE,
                                related_name='suggestions', verbose_name='کالا')
    suggested_date = models.DateField(verbose_name='تاریخ پیشنهادی سفارش')
    suggested_quantity = models.DecimalField(max_digits=14, decimal_places=2,
                                             verbose_name='مقدار پیشنهادی')
    suggested_supplier = models.ForeignKey('parties.Party', on_delete=models.SET_NULL,
                                            null=True, blank=True, related_name='suggestions',
                                            verbose_name='تأمین‌کننده پیشنهادی')
    estimated_cost = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                         verbose_name='هزینه تقریبی')

    avg_daily_sales = models.DecimalField(max_digits=12, decimal_places=3, default=0,
                                          verbose_name='میانگین فروش روزانه')
    current_stock = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                                        verbose_name='موجودی فعلی')
    days_of_stock_left = models.DecimalField(max_digits=8, decimal_places=1, default=0,
                                             verbose_name='روز باقی‌مانده تا اتمام موجودی')
    stockout_date = models.DateField(null=True, blank=True, verbose_name='تاریخ تخمینی اتمام موجودی')
    coverage_days = models.PositiveIntegerField(default=30, verbose_name='روز پوشش هدف')
    lead_time_days = models.PositiveIntegerField(default=7, verbose_name='زمان تأمین')

    best_weekday = models.PositiveSmallIntegerField(null=True, blank=True,
                                                    verbose_name='پرفروش‌ترین روز هفته')
    seasonality_factor = models.DecimalField(max_digits=6, decimal_places=3, default=1,
                                              verbose_name='ضریب فصلی')
    trend_percent = models.DecimalField(max_digits=8, decimal_places=2, default=0,
                                         verbose_name='درصد روند رشد')
    confidence = models.PositiveSmallIntegerField(default=0, verbose_name='درصد اطمینان')
    data_points = models.PositiveIntegerField(default=0, verbose_name='تعداد داده تحلیل‌شده')

    priority = models.CharField(max_length=15, choices=Priority.choices,
                                default=Priority.MEDIUM, verbose_name='اولویت')
    status = models.CharField(max_length=15, choices=Status.choices,
                              default=Status.PENDING, verbose_name='وضعیت')
    reason = models.TextField(blank=True, verbose_name='دلیل پیشنهاد')
    analysis = models.JSONField(default=dict, blank=True, verbose_name='جزئیات تحلیل')

    generated_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان تولید')
    reviewed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='reviewed_suggestions', verbose_name='بررسی‌کننده')
    review_note = models.TextField(blank=True, verbose_name='یادداشت بررسی')

    class Meta:
        verbose_name = 'پیشنهاد هوشمند'
        verbose_name_plural = 'پیشنهادهای هوشمند'
        ordering = ['suggested_date', '-priority']
        indexes = [
            models.Index(fields=['status', 'suggested_date']),
            models.Index(fields=['product']),
        ]

    def __str__(self):
        return f'{self.product.name} → {self.suggested_quantity} در {self.suggested_date}'
