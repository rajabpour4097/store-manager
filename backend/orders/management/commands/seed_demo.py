"""ساخت داده‌ی نمونه‌ی واقع‌گرایانه برای نمایش و آزمون سیستم."""

from __future__ import annotations

import csv
import random
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from catalog.models import Product, ProductCategory, StockMovement, Unit
from catalog.services import apply_movement
from cheques.models import Cheque, ChequeDirection, ChequeStatus
from cheques.services import change_status, sync_cheque_ledger
from core.jalali import jalali_weekday, to_jalali
from ledger.models import BankAccount, FinanceCategory, FinanceRecord
from orders.models import Order, OrderItem, OrderStatus, OrderType, SalesHistory
from orders.services import confirm_order, register_payment
from orders.suggestions import generate_suggestions
from parties.models import Party, PartyType

PRODUCT_CATALOG = [
    # (نام, دسته, واحد, قیمت خرید, قیمت فروش, میانگین فروش روزانه, زمان تأمین)
    ('برنج ایرانی هاشمی ۱۰ کیلویی', 'مواد غذایی خشک', Unit.BOX, 3_800_000, 4_500_000, 3.2, 10),
    ('برنج پاکستانی باسماتی ۱۰ کیلویی', 'مواد غذایی خشک', Unit.BOX, 2_100_000, 2_650_000, 4.5, 14),
    ('روغن آفتابگردان ۱.۸ لیتری', 'مواد غذایی خشک', Unit.PIECE, 150_000, 185_000, 22.0, 7),
    ('روغن سرخ‌کردنی ۴.۵ لیتری', 'مواد غذایی خشک', Unit.PIECE, 380_000, 455_000, 6.5, 7),
    ('شکر سفید ۹۰۰ گرمی', 'مواد غذایی خشک', Unit.PIECE, 35_000, 42_000, 30.0, 5),
    ('چای کیسه‌ای ۱۰۰ عددی', 'نوشیدنی', Unit.PIECE, 195_000, 245_000, 9.0, 12),
    ('قهوه فوری ۲۰۰ گرمی', 'نوشیدنی', Unit.PIECE, 420_000, 520_000, 4.0, 20),
    ('نوشابه خانواده ۱.۵ لیتری', 'نوشیدنی', Unit.PIECE, 38_000, 48_000, 45.0, 3),
    ('آب معدنی ۱.۵ لیتری بسته ۶ عددی', 'نوشیدنی', Unit.PACK, 78_000, 96_000, 18.0, 3),
    ('ماکارونی ۷۰۰ گرمی', 'مواد غذایی خشک', Unit.PIECE, 42_000, 52_000, 28.0, 5),
    ('رب گوجه ۸۰۰ گرمی', 'کنسرو و آماده', Unit.PIECE, 88_000, 108_000, 14.0, 8),
    ('تن ماهی ۱۸۰ گرمی', 'کنسرو و آماده', Unit.PIECE, 135_000, 168_000, 16.0, 10),
    ('لوبیا چیتی ۹۰۰ گرمی', 'حبوبات', Unit.PIECE, 115_000, 142_000, 8.0, 9),
    ('عدس ۹۰۰ گرمی', 'حبوبات', Unit.PIECE, 98_000, 122_000, 7.5, 9),
    ('نخود ۹۰۰ گرمی', 'حبوبات', Unit.PIECE, 105_000, 130_000, 6.0, 9),
    ('پنیر سفید ۴۰۰ گرمی', 'لبنیات', Unit.PIECE, 88_000, 110_000, 24.0, 2),
    ('شیر کم‌چرب ۱ لیتری', 'لبنیات', Unit.PIECE, 42_000, 52_000, 35.0, 1),
    ('ماست دبه ۲ کیلویی', 'لبنیات', Unit.PIECE, 165_000, 205_000, 12.0, 2),
    ('کره حیوانی ۱۰۰ گرمی', 'لبنیات', Unit.PIECE, 95_000, 118_000, 10.0, 3),
    ('مایع ظرفشویی ۳.۷۵ لیتری', 'شوینده', Unit.PIECE, 175_000, 220_000, 11.0, 6),
    ('پودر لباسشویی ۵ کیلویی', 'شوینده', Unit.PIECE, 385_000, 470_000, 5.5, 6),
    ('دستمال کاغذی ۳۰۰ برگ', 'شوینده', Unit.PACK, 68_000, 85_000, 20.0, 4),
    ('شامپو ۹۰۰ میلی‌لیتری', 'بهداشتی', Unit.PIECE, 215_000, 268_000, 7.0, 8),
    ('خمیر دندان ۱۰۰ گرمی', 'بهداشتی', Unit.PIECE, 72_000, 92_000, 13.0, 8),
    ('صابون بسته ۶ عددی', 'بهداشتی', Unit.PACK, 96_000, 120_000, 9.5, 8),
]

CUSTOMERS = [
    ('فروشگاه گلستان', '09121112201', 'تهران'),
    ('سوپرمارکت آفتاب', '09121112202', 'تهران'),
    ('هایپر نیک', '09121112203', 'کرج'),
    ('بقالی برادران احمدی', '09121112204', 'تهران'),
    ('فروشگاه زنجیره‌ای مهر', '09121112205', 'اصفهان'),
    ('سوپر پروتئین سبز', '09121112206', 'تهران'),
    ('مینی‌مارکت شبانه', '09121112207', 'شیراز'),
    ('فروشگاه رفاه محلی', '09121112208', 'قم'),
    ('کافه رستوران ونک', '09121112209', 'تهران'),
    ('تعاونی مصرف کارکنان', '09121112210', 'تبریز'),
    ('سوپرمارکت پارسیان', '09121112211', 'مشهد'),
    ('فروشگاه امید', '09121112212', 'رشت'),
    ('هایپر ستاره شهر', '09121112213', 'اهواز'),
    ('مینی‌مارکت نسیم', '09121112214', 'تهران'),
    ('فروشگاه یاس', '09121112215', 'کرمان'),
    ('سوپر مارکت البرز', '09121112216', 'کرج'),
    ('بوفه دانشگاه', '09121112217', 'تهران'),
    ('فروشگاه سپیدار', '09121112218', 'یزد'),
]

SUPPLIERS = [
    ('پخش سراسری آریا', '09131113301', 'تهران'),
    ('بازرگانی کاسپین', '09131113302', 'تهران'),
    ('صنایع غذایی بهار', '09131113303', 'اصفهان'),
    ('توزیع لبنیات دامداران', '09131113304', 'تهران'),
    ('شرکت پخش شوینده پاک', '09131113305', 'قزوین'),
    ('واردات و پخش نوشیدنی زمزم', '09131113306', 'تهران'),
    ('تأمین کالای شمال', '09131113307', 'ساری'),
]

EXPENSE_CATEGORIES = [
    ('اجاره مغازه', 'اجاره ماهانه محل فروشگاه'),
    ('حقوق و دستمزد', 'حقوق پرسنل فروشگاه'),
    ('حمل و نقل', 'کرایه حمل بار و توزیع'),
    ('آب، برق و گاز', 'هزینه‌های انرژی'),
    ('تبلیغات و بازاریابی', 'تبلیغات محلی و شبکه‌های اجتماعی'),
    ('ملزومات و بسته‌بندی', 'نایلون، کارتن و اقلام مصرفی'),
    ('تعمیر و نگهداری', 'تعمیر یخچال، ترازو و تجهیزات'),
    ('کارمزد بانکی', 'کارمزد دستگاه کارتخوان و حواله'),
]

INCOME_CATEGORIES = [
    ('فروش ضایعات', 'فروش کارتن و ضایعات'),
    ('تخفیف و جایزه تأمین‌کننده', 'پاداش خرید از تأمین‌کنندگان'),
]

BANKS = [
    ('حساب جاری اصلی', 'mellat', '1234567890'),
    ('حساب پشتیبان', 'melli', '9876543210'),
    ('حساب کارتخوان', 'saman', '5556667778'),
]

# ضریب روز هفته: شنبه(۰) تا جمعه(۶) — پنجشنبه و جمعه پرفروش‌ترند
WEEKDAY_FACTORS = [1.00, 0.92, 0.88, 0.95, 1.05, 1.45, 0.55]


class Command(BaseCommand):
    help = 'ساخت داده نمونه: کالاها، طرف‌حساب‌ها، سوابق فروش، سفارشات، چک‌ها و هزینه‌ها'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=300,
                            help='تعداد روز سابقه فروش که ساخته می‌شود')
        parser.add_argument('--flush', action='store_true',
                            help='حذف داده‌های نمونه قبلی پیش از ساخت')
        parser.add_argument('--seed', type=int, default=1403,
                            help='مقدار اولیه تولید اعداد تصادفی برای تکرارپذیری')

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(options['seed'])
        days = options['days']
        today = date.today()

        if options['flush']:
            self._flush()

        manager = User.objects.filter(role='manager').order_by('id').first()
        accountant = User.objects.filter(role='accountant').first() or manager
        if manager is None:
            self.stdout.write(self.style.ERROR(
                'ابتدا دستور seed_users را اجرا کنید تا کاربران ساخته شوند.'))
            return

        banks = self._create_banks()
        categories = self._create_categories()
        products = self._create_products(categories)
        customers, suppliers = self._create_parties()
        self._create_finance_categories()

        self.stdout.write('ساخت سوابق فروش گذشته...')
        history_rows = self._create_sales_history(products, customers, days=days, today=today)

        self.stdout.write('ساخت فایل CSV نمونه...')
        csv_path = self._write_sample_csv(history_rows)

        self.stdout.write('تنظیم موجودی اولیه انبار...')
        self._seed_stock(products, today, manager)

        self.stdout.write('ساخت سفارشات فروش و خرید...')
        self._create_orders(products, customers, suppliers, today, manager, accountant)

        self.stdout.write('ساخت چک‌های پرداختی و دریافتی...')
        self._create_cheques(customers, suppliers, banks, today, accountant)

        self.stdout.write('ثبت هزینه‌ها و درآمدهای متفرقه...')
        self._create_finance_records(banks, suppliers, today, accountant)

        self.stdout.write('تولید پیشنهادهای هوشمند...')
        result = generate_suggestions(coverage_days=30, horizon_days=60,
                                     lookback_days=days, user=manager)

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('داده نمونه با موفقیت ساخته شد.'))
        self.stdout.write(f'  کالا: {Product.objects.count()}')
        self.stdout.write(f'  طرف حساب: {Party.objects.count()}')
        self.stdout.write(f'  سابقه فروش: {SalesHistory.objects.count()}')
        self.stdout.write(f'  سفارش: {Order.objects.count()}')
        self.stdout.write(f'  چک: {Cheque.objects.count()}')
        self.stdout.write(f'  هزینه/درآمد: {FinanceRecord.objects.count()}')
        self.stdout.write(f'  پیشنهاد هوشمند: {result["created"]}')
        self.stdout.write(f'  فایل CSV نمونه: {csv_path}')

    # ------------------------------------------------------------------
    def _flush(self):
        SalesHistory.objects.all().delete()
        OrderItem.objects.all().delete()
        Cheque.objects.all().delete()
        Order.objects.all().delete()
        StockMovement.objects.all().delete()
        FinanceRecord.objects.all().delete()
        Product.objects.all().delete()
        ProductCategory.objects.all().delete()
        Party.objects.all().delete()
        self.stdout.write(self.style.WARNING('داده‌های قبلی حذف شد.'))

    def _create_banks(self):
        banks = []
        for title, bank_name, account_number in BANKS:
            bank, _ = BankAccount.objects.get_or_create(
                title=title,
                defaults={'bank_name': bank_name, 'account_number': account_number,
                          'initial_balance': random.randint(50, 400) * 1_000_000},
            )
            banks.append(bank)
        return banks

    def _create_categories(self):
        names = sorted({item[1] for item in PRODUCT_CATALOG})
        return {name: ProductCategory.objects.get_or_create(name=name)[0] for name in names}

    def _create_products(self, categories):
        products = []
        for name, category, unit, purchase, sale, daily, lead_time in PRODUCT_CATALOG:
            product, created = Product.objects.get_or_create(
                name=name,
                defaults={
                    'category': categories[category],
                    'unit': unit,
                    'purchase_price': purchase,
                    'sale_price': sale,
                    'reorder_point': Decimal(str(round(daily * lead_time * 1.2, 2))),
                    'lead_time_days': lead_time,
                },
            )
            product.expected_daily = daily
            products.append(product)
        return products

    def _create_parties(self):
        customers = []
        for name, mobile, city in CUSTOMERS:
            party, _ = Party.objects.get_or_create(
                name=name,
                defaults={
                    'party_type': PartyType.CUSTOMER,
                    'mobile': mobile,
                    'city': city,
                    'credit_limit': random.choice([0, 200, 500, 1000]) * 1_000_000,
                    'is_legal_entity': random.random() < 0.4,
                },
            )
            customers.append(party)

        suppliers = []
        for name, mobile, city in SUPPLIERS:
            party, _ = Party.objects.get_or_create(
                name=name,
                defaults={
                    'party_type': PartyType.SUPPLIER,
                    'mobile': mobile,
                    'city': city,
                    'is_legal_entity': True,
                },
            )
            suppliers.append(party)

        # تأمین‌کننده پیش‌فرض کالاها
        for index, product in enumerate(Product.objects.all()):
            if product.default_supplier_id is None:
                product.default_supplier = suppliers[index % len(suppliers)]
                product.save(update_fields=['default_supplier'])

        return customers, suppliers

    def _create_finance_categories(self):
        for name, description in EXPENSE_CATEGORIES:
            FinanceCategory.objects.get_or_create(
                name=name, kind=FinanceCategory.Kind.EXPENSE,
                defaults={'description': description})
        for name, description in INCOME_CATEGORIES:
            FinanceCategory.objects.get_or_create(
                name=name, kind=FinanceCategory.Kind.INCOME,
                defaults={'description': description})

    # ------------------------------------------------------------------
    def _create_sales_history(self, products, customers, *, days: int, today: date):
        """تولید سری زمانی فروش با الگوی روز هفته، روند رشد و نوسان تصادفی."""
        SalesHistory.objects.filter(source_order__isnull=True).delete()

        records = []
        rows = []
        start = today - timedelta(days=days)

        for product in products:
            base_daily = getattr(product, 'expected_daily', 5.0)
            trend = random.uniform(-0.25, 0.55)

            for offset in range(days + 1):
                day = start + timedelta(days=offset)
                progress = offset / max(days, 1)
                weekday_factor = WEEKDAY_FACTORS[jalali_weekday(day)]
                trend_factor = 1 + trend * progress
                noise = random.gauss(1.0, 0.32)
                expected = base_daily * weekday_factor * trend_factor * max(noise, 0.05)

                quantity = max(int(round(expected)), 0)
                if quantity == 0:
                    continue

                # قیمت با تورم تدریجی
                inflation = 1 + 0.30 * progress
                unit_price = Decimal(str(round(float(product.sale_price) / (1 + 0.30) * inflation)))
                unit_cost = Decimal(str(round(float(product.purchase_price) / (1 + 0.30) * inflation)))
                total = unit_price * quantity
                customer = random.choice(customers)

                records.append(SalesHistory(
                    product=product,
                    product_name_raw=product.name,
                    sale_date=day,
                    quantity=Decimal(quantity),
                    unit_price=unit_price,
                    total_amount=total,
                    unit_cost=unit_cost,
                    customer_name=customer.name,
                ))
                rows.append([
                    to_jalali(day), product.sku, product.name, product.get_unit_display(),
                    quantity, int(unit_price), int(unit_cost), int(total), customer.name,
                ])

        SalesHistory.objects.bulk_create(records, batch_size=1000)
        rows.sort(key=lambda row: row[0])
        return rows

    def _write_sample_csv(self, rows) -> Path:
        target_dir = Path(settings.BASE_DIR).parent / 'sample-data'
        target_dir.mkdir(parents=True, exist_ok=True)
        path = target_dir / 'sales-history.csv'
        with path.open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['تاریخ', 'کد کالا', 'نام کالا', 'واحد', 'تعداد',
                             'قیمت واحد', 'بهای واحد', 'مبلغ کل', 'مشتری'])
            writer.writerows(rows)
        return path

    # ------------------------------------------------------------------
    def _seed_stock(self, products, today: date, user):
        for product in products:
            base_daily = getattr(product, 'expected_daily', 5.0)
            # موجودی اولیه: بین ۵ تا ۵۰ روز فروش، تا برخی کالاها زیر نقطه سفارش باشند
            coverage = random.choice([4, 6, 9, 14, 20, 28, 40, 55])
            quantity = Decimal(str(round(base_daily * coverage)))
            if quantity <= 0:
                quantity = Decimal('10')
            apply_movement(
                product=product,
                date=today - timedelta(days=1),
                quantity=quantity,
                reason=StockMovement.Reason.INITIAL,
                unit_cost=product.purchase_price,
                source_type='seed',
                description='موجودی اولیه داده نمونه',
                user=user,
            )

    def _create_orders(self, products, customers, suppliers, today: date, manager, accountant):
        # سفارشات خرید
        for index in range(18):
            order_date = today - timedelta(days=random.randint(1, 110))
            supplier = random.choice(suppliers)
            order = Order.objects.create(
                order_type=OrderType.PURCHASE,
                party=supplier,
                order_date=order_date,
                due_date=order_date + timedelta(days=random.choice([15, 30, 45, 60])),
                tax_percent=Decimal('0'),
                affects_stock=False,
                created_by=accountant,
                description='سفارش خرید نمونه',
            )
            for product in random.sample(products, random.randint(2, 5)):
                quantity = Decimal(str(random.randint(20, 200)))
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    unit_price=product.purchase_price,
                    unit_cost=product.purchase_price,
                )
            order.recalculate()
            confirm_order(order, user=manager)
            if random.random() < 0.65:
                ratio = Decimal(str(random.choice([0.25, 0.5, 0.75, 1.0])))
                amount = (Decimal(order.total_amount) * ratio).quantize(Decimal('1'))
                if amount > 0:
                    register_payment(order, amount, user=accountant)

        # سفارشات فروش
        for index in range(45):
            order_date = today - timedelta(days=random.randint(0, 85))
            customer = random.choice(customers)
            order = Order.objects.create(
                order_type=OrderType.SALE,
                party=customer,
                order_date=order_date,
                due_date=order_date + timedelta(days=random.choice([0, 7, 15, 30, 45])),
                tax_percent=Decimal('0'),
                discount_amount=Decimal(str(random.choice([0, 0, 0, 200_000, 500_000]))),
                affects_stock=False,
                created_by=accountant,
                description='سفارش فروش نمونه',
            )
            for product in random.sample(products, random.randint(2, 6)):
                quantity = Decimal(str(random.randint(2, 25)))
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    unit_price=product.sale_price,
                    unit_cost=product.purchase_price,
                )
            order.recalculate()
            confirm_order(order, user=manager)
            if random.random() < 0.7:
                ratio = Decimal(str(random.choice([0.3, 0.5, 0.8, 1.0])))
                amount = (Decimal(order.total_amount) * ratio).quantize(Decimal('1'))
                if amount > 0:
                    register_payment(order, amount, user=accountant)

    def _create_cheques(self, customers, suppliers, banks, today: date, user):
        bank_codes = ['mellat', 'melli', 'saderat', 'parsian', 'saman', 'pasargad', 'tejarat']
        serial = 100_000

        # چک‌های دریافتی از مشتریان
        for index in range(22):
            serial += random.randint(3, 40)
            issue_date = today - timedelta(days=random.randint(5, 150))
            due_date = issue_date + timedelta(days=random.choice([20, 30, 45, 60, 90]))
            cheque = Cheque.objects.create(
                direction=ChequeDirection.RECEIVABLE,
                serial_number=str(serial),
                bank_name=random.choice(bank_codes),
                branch='شعبه مرکزی',
                amount=Decimal(str(random.randint(15, 350) * 1_000_000)),
                issue_date=issue_date,
                due_date=due_date,
                party=random.choice(customers),
                bank_account=random.choice(banks),
                description='چک دریافتی نمونه',
                created_by=user,
            )
            sync_cheque_ledger(cheque, user=user)
            self._maybe_settle(cheque, today, user)

        # چک‌های پرداختی به تأمین‌کنندگان
        for index in range(16):
            serial += random.randint(3, 40)
            issue_date = today - timedelta(days=random.randint(5, 150))
            due_date = issue_date + timedelta(days=random.choice([30, 45, 60, 75, 90]))
            cheque = Cheque.objects.create(
                direction=ChequeDirection.PAYABLE,
                serial_number=str(serial),
                bank_name=random.choice(bank_codes),
                branch='شعبه مرکزی',
                amount=Decimal(str(random.randint(30, 500) * 1_000_000)),
                issue_date=issue_date,
                due_date=due_date,
                party=random.choice(suppliers),
                bank_account=random.choice(banks),
                description='چک پرداختی نمونه',
                created_by=user,
            )
            sync_cheque_ledger(cheque, user=user)
            self._maybe_settle(cheque, today, user)

    def _maybe_settle(self, cheque: Cheque, today: date, user):
        """برای چک‌هایی که سرسیدشان گذشته، وضعیت نهایی تصادفی تعیین می‌کند."""
        if cheque.due_date >= today:
            if random.random() < 0.35:
                change_status(cheque, ChequeStatus.SUBMITTED, user=user,
                              event_date=today, note='واگذاری به بانک')
            return

        roll = random.random()
        if roll < 0.72:
            change_status(cheque, ChequeStatus.CLEARED, user=user,
                          event_date=cheque.due_date, note='وصول در سرسید')
        elif roll < 0.85:
            change_status(cheque, ChequeStatus.BOUNCED, user=user,
                          event_date=cheque.due_date, note='کسر موجودی')
        elif roll < 0.93:
            change_status(cheque, ChequeStatus.SUBMITTED, user=user,
                          event_date=cheque.due_date, note='در جریان وصول')

    def _create_finance_records(self, banks, suppliers, today: date, user):
        expense_categories = list(FinanceCategory.objects.filter(
            kind=FinanceCategory.Kind.EXPENSE))
        income_categories = list(FinanceCategory.objects.filter(
            kind=FinanceCategory.Kind.INCOME))

        monthly_fixed = {
            'اجاره مغازه': 85_000_000,
            'حقوق و دستمزد': 240_000_000,
            'آب، برق و گاز': 18_000_000,
        }

        for month_offset in range(10):
            month_date = today - timedelta(days=30 * month_offset)
            for name, amount in monthly_fixed.items():
                category = next((c for c in expense_categories if c.name == name), None)
                if category is None:
                    continue
                FinanceRecord.objects.create(
                    kind=FinanceCategory.Kind.EXPENSE,
                    category=category,
                    title=f'{name} - ماه {to_jalali(month_date)[:7]}',
                    amount=Decimal(str(int(amount * random.uniform(0.95, 1.08)))),
                    date=month_date.replace(day=min(month_date.day, 28)),
                    payment_method=FinanceRecord.PaymentMethod.TRANSFER,
                    bank_account=random.choice(banks),
                    created_by=user,
                )

        variable_categories = [c for c in expense_categories if c.name not in monthly_fixed]
        for index in range(60):
            category = random.choice(variable_categories)
            FinanceRecord.objects.create(
                kind=FinanceCategory.Kind.EXPENSE,
                category=category,
                title=f'{category.name} - سند {index + 1}',
                amount=Decimal(str(random.randint(2, 45) * 1_000_000)),
                date=today - timedelta(days=random.randint(0, 290)),
                payment_method=random.choice([
                    FinanceRecord.PaymentMethod.CASH,
                    FinanceRecord.PaymentMethod.CARD,
                    FinanceRecord.PaymentMethod.TRANSFER,
                ]),
                party=random.choice(suppliers) if random.random() < 0.3 else None,
                bank_account=random.choice(banks),
                created_by=user,
            )

        for index in range(12):
            category = random.choice(income_categories)
            FinanceRecord.objects.create(
                kind=FinanceCategory.Kind.INCOME,
                category=category,
                title=f'{category.name} - سند {index + 1}',
                amount=Decimal(str(random.randint(3, 30) * 1_000_000)),
                date=today - timedelta(days=random.randint(0, 290)),
                payment_method=FinanceRecord.PaymentMethod.CASH,
                created_by=user,
            )
