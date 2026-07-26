from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from core.models import BaseModel


class Unit(models.TextChoices):
    PIECE = 'piece', 'عدد'
    KILOGRAM = 'kg', 'کیلوگرم'
    GRAM = 'gram', 'گرم'
    LITER = 'liter', 'لیتر'
    METER = 'meter', 'متر'
    BOX = 'box', 'کارتن'
    PACK = 'pack', 'بسته'
    SET = 'set', 'ست'
    OTHER = 'other', 'سایر'


class ProductCategory(BaseModel):
    name = models.CharField(max_length=150, verbose_name='نام دسته')
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True,
                               related_name='children', verbose_name='دسته والد')
    description = models.TextField(blank=True, verbose_name='توضیحات')
    is_active = models.BooleanField(default=True, verbose_name='فعال')

    class Meta:
        verbose_name = 'دسته‌بندی کالا'
        verbose_name_plural = 'دسته‌بندی‌های کالا'
        ordering = ['name']

    def __str__(self):
        if self.parent:
            return f'{self.parent.name} › {self.name}'
        return self.name


class Product(BaseModel):
    sku = models.CharField(max_length=40, unique=True, blank=True, verbose_name='کد کالا')
    barcode = models.CharField(max_length=40, blank=True, verbose_name='بارکد')
    name = models.CharField(max_length=200, verbose_name='نام کالا')
    category = models.ForeignKey(ProductCategory, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='products', verbose_name='دسته‌بندی')
    unit = models.CharField(max_length=15, choices=Unit.choices, default=Unit.PIECE,
                            verbose_name='واحد شمارش')

    purchase_price = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                         validators=[MinValueValidator(Decimal('0'))],
                                         verbose_name='قیمت خرید')
    sale_price = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                     validators=[MinValueValidator(Decimal('0'))],
                                     verbose_name='قیمت فروش')

    stock_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                                         verbose_name='موجودی')
    reorder_point = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                                        verbose_name='نقطه سفارش')
    lead_time_days = models.PositiveIntegerField(default=7, verbose_name='زمان تأمین (روز)')
    default_supplier = models.ForeignKey('parties.Party', on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='supplied_products',
                                         verbose_name='تأمین‌کننده پیش‌فرض')

    image = models.ImageField(upload_to='products/', blank=True, null=True, verbose_name='تصویر')
    description = models.TextField(blank=True, verbose_name='توضیحات')
    is_active = models.BooleanField(default=True, verbose_name='فعال')

    class Meta:
        verbose_name = 'کالا'
        verbose_name_plural = 'کالاها'
        ordering = ['name']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['sku']),
        ]

    def __str__(self):
        return f'{self.name} ({self.sku})'

    def save(self, *args, **kwargs):
        if not self.sku:
            last = Product.objects.order_by('-id').first()
            next_id = (last.id + 1) if last else 1
            self.sku = f'SKU{next_id:05d}'
        super().save(*args, **kwargs)

    @property
    def profit_margin(self) -> Decimal:
        sale = Decimal(self.sale_price or 0)
        if not sale:
            return Decimal('0')
        purchase = Decimal(self.purchase_price or 0)
        return ((sale - purchase) / sale * 100).quantize(Decimal('0.01'))

    @property
    def stock_value(self) -> Decimal:
        return (Decimal(self.stock_quantity or 0) * Decimal(self.purchase_price or 0)).quantize(
            Decimal('1'))

    @property
    def stock_state(self) -> str:
        stock = Decimal(self.stock_quantity or 0)
        reorder = Decimal(self.reorder_point or 0)
        if stock <= 0:
            return 'out_of_stock'
        if reorder and stock <= reorder:
            return 'low'
        return 'ok'

    @property
    def stock_state_display(self) -> str:
        return {
            'out_of_stock': 'ناموجود',
            'low': 'کمتر از نقطه سفارش',
            'ok': 'موجودی مناسب',
        }[self.stock_state]


class StockMovement(BaseModel):
    """گردش موجودی انبار."""

    class Reason(models.TextChoices):
        PURCHASE = 'purchase', 'خرید'
        SALE = 'sale', 'فروش'
        RETURN_IN = 'return_in', 'مرجوعی از مشتری'
        RETURN_OUT = 'return_out', 'مرجوعی به تأمین‌کننده'
        ADJUSTMENT = 'adjustment', 'اصلاح موجودی'
        WASTE = 'waste', 'ضایعات'
        INITIAL = 'initial', 'موجودی اولیه'

    product = models.ForeignKey(Product, on_delete=models.CASCADE,
                                related_name='movements', verbose_name='کالا')
    date = models.DateField(verbose_name='تاریخ')
    quantity = models.DecimalField(max_digits=14, decimal_places=2,
                                   verbose_name='مقدار (مثبت=ورود، منفی=خروج)')
    unit_cost = models.DecimalField(max_digits=18, decimal_places=0, default=0,
                                    verbose_name='بهای واحد')
    reason = models.CharField(max_length=20, choices=Reason.choices,
                              default=Reason.ADJUSTMENT, verbose_name='علت')
    balance_after = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                                        verbose_name='موجودی پس از گردش')
    source_type = models.CharField(max_length=20, blank=True, verbose_name='منبع')
    source_id = models.PositiveIntegerField(null=True, blank=True, verbose_name='شناسه منبع')
    description = models.TextField(blank=True, verbose_name='توضیحات')
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='stock_movements', verbose_name='کاربر')

    class Meta:
        verbose_name = 'گردش انبار'
        verbose_name_plural = 'گردش‌های انبار'
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['product', 'date']),
            models.Index(fields=['source_type', 'source_id']),
        ]

    def __str__(self):
        return f'{self.product.name} | {self.quantity} | {self.get_reason_display()}'
