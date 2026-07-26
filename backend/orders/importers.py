"""ورود سوابق فروش از فایل CSV.

فایل باید سرستون داشته باشد. نام سرستون‌ها به فارسی یا انگلیسی پذیرفته می‌شود و
تاریخ می‌تواند شمسی (۱۴۰۳/۰۵/۱۲) یا میلادی (2024-08-02) باشد.
"""

from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction

from catalog.models import Product, Unit
from core.jalali import normalize_digits, normalize_persian, parse_flexible_date
from parties.models import Party, PartyType

from .models import SalesHistory, SalesImportBatch

# نگاشت سرستون‌های ممکن به فیلدهای داخلی
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    'sale_date': ('تاریخ', 'تاریخ فروش', 'date', 'sale_date', 'saledate', 'invoice_date'),
    'product_name': ('کالا', 'نام کالا', 'شرح کالا', 'محصول', 'product', 'product_name', 'item', 'name'),
    'sku': ('کد کالا', 'کد', 'sku', 'code', 'product_code', 'barcode'),
    'quantity': ('تعداد', 'مقدار', 'quantity', 'qty', 'count', 'amount_qty'),
    'unit_price': ('قیمت واحد', 'قیمت', 'مبلغ واحد', 'unit_price', 'price', 'unitprice'),
    'total_amount': ('مبلغ کل', 'جمع', 'مبلغ', 'total', 'total_amount', 'sum', 'total_price'),
    'unit_cost': ('بهای واحد', 'قیمت خرید', 'بهای تمام شده', 'unit_cost', 'cost', 'purchase_price'),
    'customer_name': ('مشتری', 'نام مشتری', 'خریدار', 'customer', 'customer_name', 'party'),
    'unit': ('واحد', 'unit', 'uom'),
    'category': ('دسته', 'دسته‌بندی', 'گروه کالا', 'category', 'group'),
}

REQUIRED_FIELDS = ('sale_date', 'quantity')

UNIT_ALIASES = {
    'عدد': Unit.PIECE, 'piece': Unit.PIECE, 'pcs': Unit.PIECE, 'pc': Unit.PIECE,
    'کیلوگرم': Unit.KILOGRAM, 'کیلو': Unit.KILOGRAM, 'kg': Unit.KILOGRAM,
    'گرم': Unit.GRAM, 'gram': Unit.GRAM, 'g': Unit.GRAM,
    'لیتر': Unit.LITER, 'liter': Unit.LITER, 'l': Unit.LITER,
    'متر': Unit.METER, 'meter': Unit.METER, 'm': Unit.METER,
    'کارتن': Unit.BOX, 'box': Unit.BOX, 'carton': Unit.BOX,
    'بسته': Unit.PACK, 'pack': Unit.PACK,
    'ست': Unit.SET, 'set': Unit.SET,
}


class ImportError_(Exception):
    """خطای ورود فایل."""


def _normalize_header(value: str) -> str:
    normalized = normalize_persian(value or '').lower().replace('_', ' ')
    return ' '.join(normalized.split())


def build_header_map(fieldnames: list[str]) -> dict[str, str]:
    """نگاشت سرستون فایل به فیلد داخلی."""
    mapping: dict[str, str] = {}
    normalized_aliases = {
        field: {_normalize_header(alias) for alias in aliases}
        for field, aliases in COLUMN_ALIASES.items()
    }
    for raw in fieldnames or []:
        key = _normalize_header(raw)
        for field, aliases in normalized_aliases.items():
            if key in aliases and field not in mapping.values():
                mapping[raw] = field
                break
    return mapping


def _to_decimal(value, default=Decimal('0')) -> Decimal:
    if value is None:
        return default
    text = normalize_digits(str(value)).strip().replace(',', '').replace('٬', '')
    if not text or text in ('-', '—'):
        return default
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        raise ImportError_(f'مقدار عددی نامعتبر: {value}')


def decode_csv(raw_bytes: bytes) -> str:
    """رمزگشایی فایل با پشتیبانی از UTF-8، UTF-8-BOM و Windows-1256."""
    for encoding in ('utf-8-sig', 'utf-8', 'cp1256', 'latin-1'):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ImportError_('رمزگذاری فایل قابل تشخیص نیست. فایل را با UTF-8 ذخیره کنید.')


def sniff_dialect(sample: str):
    try:
        return csv.Sniffer().sniff(sample, delimiters=',;\t|')
    except csv.Error:
        return csv.excel


@transaction.atomic
def import_sales_csv(
    *,
    raw_bytes: bytes,
    file_name: str,
    user=None,
    create_missing_products: bool = True,
    link_parties: bool = False,
    replace_existing: bool = False,
) -> SalesImportBatch:
    """فایل CSV فروش‌های گذشته را می‌خواند و در جدول سوابق فروش ذخیره می‌کند."""
    text = decode_csv(raw_bytes)
    sample = text[:4096]
    dialect = sniff_dialect(sample)

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    header_map = build_header_map(reader.fieldnames or [])
    mapped_fields = set(header_map.values())

    missing = [field for field in REQUIRED_FIELDS if field not in mapped_fields]
    if missing:
        labels = {'sale_date': 'تاریخ', 'quantity': 'تعداد'}
        raise ImportError_(
            'ستون‌های اجباری در فایل پیدا نشد: '
            + '، '.join(labels.get(item, item) for item in missing)
            + '. سرستون‌های شناخته‌شده: '
            + '، '.join(sorted({alias for aliases in COLUMN_ALIASES.values() for alias in aliases[:3]}))
        )
    if 'product_name' not in mapped_fields and 'sku' not in mapped_fields:
        raise ImportError_('فایل باید ستون «نام کالا» یا «کد کالا» داشته باشد.')

    batch = SalesImportBatch.objects.create(
        file_name=file_name,
        status=SalesImportBatch.Status.PENDING,
        created_by=user,
    )

    if replace_existing:
        SalesHistory.objects.filter(source_order__isnull=True).delete()

    errors: list[dict] = []
    records: list[SalesHistory] = []
    created_products = 0
    skipped = 0
    total = 0
    min_date: date | None = None
    max_date: date | None = None

    product_cache: dict[str, Product] = {}
    party_cache: dict[str, Party] = {}

    for line_number, row in enumerate(reader, start=2):
        total += 1
        data = {}
        for raw_key, field in header_map.items():
            data[field] = row.get(raw_key)

        try:
            sale_date = parse_flexible_date(normalize_digits(str(data.get('sale_date') or '').strip()))
            if not sale_date:
                raise ImportError_('تاریخ خالی است.')

            quantity = _to_decimal(data.get('quantity'))
            if quantity <= 0:
                raise ImportError_('تعداد باید بزرگ‌تر از صفر باشد.')

            product_name = (data.get('product_name') or '').strip()
            sku = (data.get('sku') or '').strip()
            if not product_name and not sku:
                raise ImportError_('نام یا کد کالا خالی است.')

            unit_price = _to_decimal(data.get('unit_price'))
            total_amount = _to_decimal(data.get('total_amount'))
            unit_cost = _to_decimal(data.get('unit_cost'))

            if not unit_price and total_amount and quantity:
                unit_price = (total_amount / quantity).quantize(Decimal('1'))
            if not total_amount:
                total_amount = (unit_price * quantity).quantize(Decimal('1'))

            cache_key = sku or product_name
            product = product_cache.get(cache_key)
            if product is None:
                if sku:
                    product = Product.objects.filter(sku__iexact=sku).first() \
                        or Product.objects.filter(barcode__iexact=sku).first()
                if product is None and product_name:
                    product = Product.objects.filter(name__iexact=product_name).first()
                if product is None and create_missing_products and product_name:
                    unit_raw = _normalize_header(data.get('unit') or '')
                    product = Product.objects.create(
                        name=product_name,
                        barcode=sku if sku else '',
                        unit=UNIT_ALIASES.get(unit_raw, Unit.PIECE),
                        sale_price=unit_price,
                        purchase_price=unit_cost or (unit_price * Decimal('0.8')).quantize(Decimal('1')),
                    )
                    created_products += 1
                if product is not None:
                    product_cache[cache_key] = product

            party = None
            customer_name = (data.get('customer_name') or '').strip()
            if link_parties and customer_name:
                party = party_cache.get(customer_name)
                if party is None:
                    party = Party.objects.filter(name__iexact=customer_name).first()
                    if party is None:
                        party = Party.objects.create(
                            name=customer_name, party_type=PartyType.CUSTOMER)
                    party_cache[customer_name] = party

            records.append(SalesHistory(
                batch=batch,
                product=product,
                product_name_raw=product_name or (product.name if product else sku),
                sale_date=sale_date,
                quantity=quantity,
                unit_price=unit_price,
                total_amount=total_amount,
                unit_cost=unit_cost or (product.purchase_price if product else Decimal('0')),
                customer_name=customer_name,
                party=party,
            ))

            min_date = sale_date if min_date is None or sale_date < min_date else min_date
            max_date = sale_date if max_date is None or sale_date > max_date else max_date

        except (ImportError_, ValueError) as exc:
            skipped += 1
            if len(errors) < 100:
                errors.append({'line': line_number, 'error': str(exc), 'row': {
                    key: value for key, value in list(row.items())[:8]
                }})

    SalesHistory.objects.bulk_create(records, batch_size=500)

    batch.total_rows = total
    batch.imported_rows = len(records)
    batch.skipped_rows = skipped
    batch.created_products = created_products
    batch.errors = errors
    batch.date_from = min_date
    batch.date_to = max_date
    batch.status = (
        SalesImportBatch.Status.DONE if records else SalesImportBatch.Status.FAILED
    )
    batch.save()

    return batch


SAMPLE_CSV_HEADER = 'تاریخ,کد کالا,نام کالا,واحد,تعداد,قیمت واحد,بهای واحد,مبلغ کل,مشتری'


def build_sample_csv() -> str:
    """یک نمونه فایل CSV برای راهنمایی کاربر می‌سازد."""
    rows = [
        '۱۴۰۳/۰۱/۱۵,SKU00001,برنج ایرانی هاشمی ۱۰ کیلویی,عدد,12,4500000,3800000,54000000,فروشگاه گلستان',
        '۱۴۰۳/۰۱/۱۵,SKU00002,روغن آفتابگردان ۱.۸ لیتری,عدد,40,185000,150000,7400000,سوپرمارکت آفتاب',
        '۱۴۰۳/۰۱/۱۶,SKU00003,شکر سفید ۹۰۰ گرمی,عدد,120,42000,35000,5040000,هایپر نیک',
        '1403/01/17,SKU00001,برنج ایرانی هاشمی ۱۰ کیلویی,عدد,8,4500000,3800000,36000000,فروشگاه گلستان',
    ]
    return SAMPLE_CSV_HEADER + '\n' + '\n'.join(rows) + '\n'
