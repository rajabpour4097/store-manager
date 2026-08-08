"""استخراج اطلاعات فاکتور از تصویر برای ثبت خودکار خرید/فروش."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from catalog.models import Product
from core.jalali import parse_flexible_date
from parties.models import Party, PartyType

from .ocr_providers import OcrResult, ocr_capabilities, run_ocr


@dataclass
class ParsedLineItem:
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    product_id: int | None = None
    match_score: float = 0.0
    product_code: str = ''
    will_create: bool = False


@dataclass
class ParsedInvoice:
    party_name: str = ''
    party_id: int | None = None
    order_date: date | None = None
    invoice_number: str = ''
    total_amount: Decimal | None = None
    items: list[ParsedLineItem] = field(default_factory=list)
    raw_text: str = ''
    confidence: int = 0
    warnings: list[str] = field(default_factory=list)
    ocr_engine: str = ''
    ocr_error: str = ''


class InvoiceParseError(Exception):
    pass


def _normalize_persian(text: str) -> str:
    return (
        text.replace('۰', '0').replace('۱', '1').replace('۲', '2').replace('۳', '3')
        .replace('۴', '4').replace('۵', '5').replace('۶', '6').replace('۷', '7')
        .replace('۸', '8').replace('۹', '9')
        .replace('ي', 'ی').replace('ك', 'ک').replace('‌', ' ')
    )


def _parse_amount(value) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value)).quantize(Decimal('1'))
    cleaned = re.sub(r'[^\d.]', '', _normalize_persian(str(value)).replace(',', ''))
    if not cleaned:
        return None
    try:
        return Decimal(cleaned).quantize(Decimal('1'))
    except InvalidOperation:
        return None


def _parse_quantity(value) -> Decimal:
    parsed = _parse_amount(value)
    if parsed is None or parsed <= 0:
        return Decimal('1')
    return parsed


def _parse_date_from_text(text: str) -> date | None:
    normalized = _normalize_persian(text)
    patterns = [
        r'(?:تاریخ|date)\s*[:\-]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})',
        r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})',
        r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            try:
                return parse_flexible_date(match.group(1))
            except (ValueError, TypeError):
                continue
    return None


def _tokenize_name(name: str) -> set[str]:
    tokens = re.findall(r'[\w\u0600-\u06FF]+', name.lower())
    return {t for t in tokens if len(t) >= 2}


def match_product(name: str, product_code: str = '') -> tuple[int | None, float]:
    """تطبیق نام/کد کالا با موجودی فروشگاه."""
    name = name.strip()
    if len(name) < 2 and not product_code:
        return None, 0.0

    products = list(Product.objects.filter(is_active=True))
    best_id: int | None = None
    best_score = 0.0

    name_tokens = _tokenize_name(name)
    name_lower = name.lower()

    for product in products:
        if product_code and product.sku and product_code.strip() == product.sku.strip():
            return product.id, 1.0
        if product.barcode and product_code and product_code.strip() == product.barcode.strip():
            return product.id, 1.0

        pname = product.name.lower()
        if pname == name_lower:
            return product.id, 1.0

        if pname in name_lower or name_lower in pname:
            score = min(len(pname), len(name_lower)) / max(len(pname), len(name_lower))
            if score > best_score:
                best_score = score
                best_id = product.id
            continue

        product_tokens = _tokenize_name(pname)
        if name_tokens and product_tokens:
            overlap = len(name_tokens & product_tokens) / max(len(name_tokens), len(product_tokens))
            if overlap >= 0.5 and overlap > best_score:
                best_score = overlap
                best_id = product.id

    return best_id, best_score


def resolve_or_create_product(
    name: str,
    unit_price: Decimal,
    *,
    product_code: str = '',
    create_if_missing: bool = False,
) -> tuple[int | None, float, bool]:
    product_id, score = match_product(name, product_code)
    if product_id:
        return product_id, score, False

    if not create_if_missing or len(name.strip()) < 2:
        return None, 0.0, False

    product = Product.objects.create(
        name=name.strip()[:200],
        purchase_price=unit_price,
        sale_price=max(unit_price, Decimal('0')),
        sku=product_code.strip()[:40] if product_code else '',
        description='ایجاد خودکار از فاکتور',
    )
    return product.id, 1.0, True


def _extract_party_name(text: str) -> str:
    normalized = _normalize_persian(text)
    patterns = [
        r'(?:نام\s*(?:خریدار|مشتری)?|خریدار|مشتری|buyer|customer)\s*[:\-]?\s*(.+)',
        r'(?:فروشنده|تأمین|supplier|seller)\s*[:\-]?\s*(.+)',
        r'(?:آقای|خانم)\s+(.+)',
        r'(?:نام)\s*[:\-]?\s*(.+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            candidate = re.split(r'[\d|]', candidate)[0].strip()
            candidate = re.sub(r'\s+', ' ', candidate)
            if len(candidate) >= 2 and not candidate.startswith('کد'):
                return candidate[:200]
    return ''


def _extract_invoice_number(text: str) -> str:
    normalized = _normalize_persian(text)
    patterns = [
        r'(?:شماره|فاکتور|حواله)\s*[:\-]?\s*(\d+)',
        r'(?:invoice\s*no?\.?)\s*[:\-]?\s*(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            return match.group(1)
    return ''


_SKIP_LINE_WORDS = (
    'جمع', 'کل', 'مالیات', 'تخفیف', 'total', 'sum', 'invoice', 'فاکتور',
    'شرح', 'تعداد', 'واحد', 'فی', 'ردیف', 'کد', 'نام کالا', 'مبلغ',
    'تجمع', 'کسر', 'ریال', 'امضاء', 'امضا', 'توضیحات',
)


def _is_skip_line(name_part: str) -> bool:
    lower = name_part.lower()
    return any(word in lower for word in _SKIP_LINE_WORDS) or len(name_part) < 3


def _parse_line_items_from_text(text: str) -> list[ParsedLineItem]:
    """استخراج ردیف‌های کالا از متن OCR."""
    items: list[ParsedLineItem] = []
    normalized = _normalize_persian(text)
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]

    for line in lines:
        numbers = re.findall(r'[\d,]+(?:\.\d+)?', line)
        if len(numbers) < 2:
            continue

        amounts = [_parse_amount(n) for n in numbers]
        amounts = [a for a in amounts if a is not None and a > 0]
        if len(amounts) < 2:
            continue

        name_part = re.sub(r'[\d,.\s|]+', ' ', line)
        name_part = re.sub(r'\s+', ' ', name_part).strip()
        if _is_skip_line(name_part):
            continue

        # الگوی رایج فاکتور فارسی: نام | تعداد | فی | جمع
        if len(amounts) >= 3:
            quantity = amounts[-3]
            unit_price = amounts[-2]
            if amounts[-1] == quantity * unit_price or amounts[-1] > unit_price:
                pass  # keep quantity & unit_price
            else:
                quantity = amounts[0]
                unit_price = amounts[-2]
        else:
            quantity = amounts[0]
            unit_price = amounts[-1]
            if quantity > 10000 and unit_price < quantity:
                quantity, unit_price = unit_price, quantity

        if unit_price < 1000:  # likely not a price in Rials
            continue

        product_id, score = match_product(name_part)
        items.append(ParsedLineItem(
            product_name=name_part,
            quantity=quantity,
            unit_price=unit_price,
            product_id=product_id,
            match_score=score,
        ))

    return _dedupe_items(items)[:50]


def _dedupe_items(items: list[ParsedLineItem]) -> list[ParsedLineItem]:
    seen: set[str] = set()
    result: list[ParsedLineItem] = []
    for item in items:
        key = f'{item.product_name}|{item.quantity}|{item.unit_price}'
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _parse_from_structured(data: dict) -> ParsedInvoice:
    result = ParsedInvoice()
    result.party_name = (data.get('party_name') or '').strip()
    result.invoice_number = (data.get('invoice_number') or '').strip()

    order_date_raw = data.get('order_date')
    if order_date_raw:
        try:
            result.order_date = parse_flexible_date(str(order_date_raw))
        except (ValueError, TypeError):
            result.order_date = None

    result.total_amount = _parse_amount(data.get('total_amount'))

    for row in data.get('items') or []:
        name = (row.get('product_name') or '').strip()
        if not name:
            continue
        quantity = _parse_quantity(row.get('quantity'))
        unit_price = _parse_amount(row.get('unit_price'))
        if unit_price is None:
            total = _parse_amount(row.get('total_price'))
            if total and quantity:
                unit_price = (total / quantity).quantize(Decimal('1'))
            else:
                continue

        code = (row.get('product_code') or '').strip()
        product_id, score = match_product(name, code)
        result.items.append(ParsedLineItem(
            product_name=name,
            quantity=quantity,
            unit_price=unit_price,
            product_id=product_id,
            match_score=score,
            product_code=code,
        ))

    result.items = _dedupe_items(result.items)
    return result


def _find_party(name: str, order_type: str) -> tuple[int | None, str]:
    if not name or len(name.strip()) < 2:
        return None, ''

    name = name.strip()
    party = Party.objects.filter(name__icontains=name, is_active=True).first()
    if party:
        return party.id, party.name

    party_type = PartyType.SUPPLIER if order_type == 'purchase' else PartyType.CUSTOMER
    party = Party.objects.create(
        name=name,
        party_type=party_type,
        notes='ایجاد خودکار از فاکتور',
    )
    return party.id, party.name


def _finalize_result(
    result: ParsedInvoice,
    *,
    order_type: str,
    party_id: int | None,
    ocr: OcrResult,
) -> ParsedInvoice:
    result.ocr_engine = ocr.engine
    result.ocr_error = ocr.error

    if not result.order_date:
        result.order_date = date.today()

    if party_id:
        party = Party.objects.filter(pk=party_id).first()
        if party:
            result.party_id = party.id
            result.party_name = party.name
    elif result.party_name:
        pid, pname = _find_party(result.party_name, order_type)
        result.party_id = pid
        result.party_name = pname

    matched = sum(1 for item in result.items if item.product_id)
    if result.items:
        base = 40 if ocr.engine == 'openai' else 25
        result.confidence = min(95, base + matched * 12 + (15 if result.party_name else 0))
    elif ocr.error:
        result.confidence = 5
        result.warnings.append(ocr.error)
    elif not result.raw_text and not ocr.structured:
        result.confidence = 5
        caps = ocr_capabilities()
        if not caps['configured']:
            result.warnings.append(
                'موتور OCR نصب نیست. OPENAI_API_KEY را در .env تنظیم کنید '
                'یا Tesseract را نصب کنید (sudo apt install tesseract-ocr tesseract-ocr-fas).'
            )
        else:
            result.warnings.append('متن فاکتور استخراج نشد؛ لطفاً تصویر واضح‌تری آپلود کنید.')
    else:
        result.confidence = 15
        result.warnings.append('ردیف کالا شناسایی نشد؛ اطلاعات را دستی تکمیل کنید.')

    if not result.party_id:
        result.warnings.append('طرف حساب شناسایی نشد؛ هنگام ذخیره انتخاب کنید.')

    unmatched = [item for item in result.items if not item.product_id]
    if unmatched:
        result.warnings.append(
            f'{len(unmatched)} کالا در انبار یافت نشد. '
            'با گزینه «ایجاد کالاهای جدید» می‌توانید آن‌ها را بسازید.'
        )

    if result.confidence < 50:
        result.warnings.append('اطمینان استخراج پایین است؛ قبل از تأیید بررسی کنید.')

    return result


def parse_invoice_image(
    image_bytes: bytes,
    *,
    order_type: str = 'sale',
    party_id: int | None = None,
) -> ParsedInvoice:
    """تحلیل تصویر فاکتور و برگرداندن داده‌های ساخت‌یافته."""
    ocr = run_ocr(image_bytes)

    if ocr.structured:
        result = _parse_from_structured(ocr.structured)
        result.raw_text = ocr.raw_text
    else:
        result = ParsedInvoice(order_date=date.today())
        result.raw_text = _normalize_persian(ocr.raw_text)
        if result.raw_text:
            result.order_date = _parse_date_from_text(result.raw_text) or date.today()
            result.party_name = _extract_party_name(result.raw_text)
            result.invoice_number = _extract_invoice_number(result.raw_text)
            result.items = _parse_line_items_from_text(result.raw_text)
            total_match = re.search(
                r'(?:جمع\s*کل|جمع|total)\s*[:\-]?\s*([\d,]+)',
                result.raw_text, re.IGNORECASE,
            )
            if total_match:
                result.total_amount = _parse_amount(total_match.group(1))

    return _finalize_result(result, order_type=order_type, party_id=party_id, ocr=ocr)
