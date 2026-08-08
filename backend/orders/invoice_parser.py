"""استخراج اطلاعات فاکتور از تصویر برای ثبت خودکار خرید/فروش."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from catalog.models import Product
from core.jalali import parse_flexible_date
from parties.models import Party, PartyType


@dataclass
class ParsedLineItem:
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    product_id: int | None = None
    match_score: float = 0.0


@dataclass
class ParsedInvoice:
    party_name: str = ''
    party_id: int | None = None
    order_date: date | None = None
    total_amount: Decimal | None = None
    items: list[ParsedLineItem] = field(default_factory=list)
    raw_text: str = ''
    confidence: int = 0
    warnings: list[str] = field(default_factory=list)


class InvoiceParseError(Exception):
    pass


def _normalize_persian(text: str) -> str:
    return (
        text.replace('۰', '0').replace('۱', '1').replace('۲', '2').replace('۳', '3')
        .replace('۴', '4').replace('۵', '5').replace('۶', '6').replace('۷', '7')
        .replace('۸', '8').replace('۹', '9')
        .replace('ي', 'ی').replace('ك', 'ک')
    )


def _extract_text(image_bytes: bytes) -> str:
    """تلاش برای استخراج متن از تصویر؛ در صورت نبود OCR خالی برمی‌گردد."""
    try:
        import pytesseract  # type: ignore[import-untyped]
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(image, lang='fas+eng')
        return _normalize_persian(text or '')
    except Exception:
        return ''


def _parse_amount(value: str) -> Decimal | None:
    cleaned = re.sub(r'[^\d.]', '', value.replace(',', ''))
    if not cleaned:
        return None
    try:
        return Decimal(cleaned).quantize(Decimal('1'))
    except InvalidOperation:
        return None


def _parse_date_from_text(text: str) -> date | None:
    patterns = [
        r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})',
        r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})',
        r'(\d{4}/\d{1,2}/\d{1,2})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                return parse_flexible_date(match.group(1))
            except (ValueError, TypeError):
                continue
    return None


def _match_product(name: str) -> tuple[int | None, float]:
    """تطبیق نام کالا با موجودی فروشگاه."""
    name = name.strip()
    if len(name) < 2:
        return None, 0.0

    products = Product.objects.filter(is_active=True)
    best_id: int | None = None
    best_score = 0.0

    name_lower = name.lower()
    for product in products:
        pname = product.name.lower()
        if pname == name_lower:
            return product.id, 1.0
        if pname in name_lower or name_lower in pname:
            score = min(len(pname), len(name_lower)) / max(len(pname), len(name_lower))
            if score > best_score:
                best_score = score
                best_id = product.id
        elif product.sku and product.sku.lower() in name_lower:
            if 0.8 > best_score:
                best_score = 0.8
                best_id = product.id

    return best_id, best_score


def _parse_line_items(text: str) -> list[ParsedLineItem]:
    """استخراج ردیف‌های کالا از متن فاکتور."""
    items: list[ParsedLineItem] = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for line in lines:
        numbers = re.findall(r'[\d,]+(?:\.\d+)?', line)
        if len(numbers) < 2:
            continue

        amounts = [_parse_amount(n) for n in numbers]
        amounts = [a for a in amounts if a is not None and a > 0]
        if len(amounts) < 2:
            continue

        name_part = re.sub(r'[\d,.\s]+', ' ', line).strip()
        name_part = re.sub(r'\s+', ' ', name_part)
        if len(name_part) < 2:
            continue

        skip_words = ('جمع', 'کل', 'مالیات', 'تخفیف', 'total', 'sum', 'invoice', 'فاکتور')
        if any(word in name_part.lower() for word in skip_words):
            continue

        quantity = amounts[0]
        unit_price = amounts[-1] if len(amounts) >= 2 else Decimal('0')
        if quantity > 10000 and unit_price < quantity:
            quantity, unit_price = unit_price, quantity

        product_id, score = _match_product(name_part)
        items.append(ParsedLineItem(
            product_name=name_part,
            quantity=quantity,
            unit_price=unit_price,
            product_id=product_id,
            match_score=score,
        ))

    return items[:50]


def _find_party(name: str, order_type: str) -> tuple[int | None, str]:
    if not name or len(name.strip()) < 2:
        return None, ''

    name = name.strip()
    party = Party.objects.filter(name__icontains=name, is_active=True).first()
    if party:
        return party.id, party.name

    if order_type == 'purchase':
        party_type = PartyType.SUPPLIER
    else:
        party_type = PartyType.CUSTOMER

    party = Party.objects.create(
        name=name,
        party_type=party_type,
        notes='ایجاد خودکار از فاکتور',
    )
    return party.id, party.name


def _extract_party_name(text: str) -> str:
    patterns = [
        r'(?:خریدار|مشتری|buyer|customer)\s*[:\-]?\s*(.+)',
        r'(?:فروشنده|تأمین|supplier|seller)\s*[:\-]?\s*(.+)',
        r'(?:نام)\s*[:\-]?\s*(.+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            candidate = re.split(r'\d', candidate)[0].strip()
            if len(candidate) >= 2:
                return candidate[:200]
    return ''


def parse_invoice_image(
    image_bytes: bytes,
    *,
    order_type: str = 'sale',
    party_id: int | None = None,
) -> ParsedInvoice:
    """تحلیل تصویر فاکتور و برگرداندن داده‌های ساخت‌یافته."""
    result = ParsedInvoice(order_date=date.today())

    raw_text = _extract_text(image_bytes)
    result.raw_text = raw_text

    if raw_text:
        result.order_date = _parse_date_from_text(raw_text) or date.today()
        result.party_name = _extract_party_name(raw_text)
        result.items = _parse_line_items(raw_text)

        total_match = re.search(
            r'(?:جمع\s*کل|مبلغ\s*کل|total)\s*[:\-]?\s*([\d,]+)',
            raw_text, re.IGNORECASE,
        )
        if total_match:
            result.total_amount = _parse_amount(total_match.group(1))

        matched = sum(1 for item in result.items if item.product_id)
        if result.items:
            result.confidence = min(90, 30 + matched * 15 + (20 if result.party_name else 0))
        else:
            result.confidence = 15
            result.warnings.append('ردیف کالا از تصویر شناسایی نشد؛ لطفاً دستی تکمیل کنید.')
    else:
        result.confidence = 10
        result.warnings.append(
            'متن فاکتور استخراج نشد. تصویر ذخیره می‌شود؛ اطلاعات را دستی وارد کنید.'
        )

    if party_id:
        party = Party.objects.filter(pk=party_id).first()
        if party:
            result.party_id = party.id
            result.party_name = party.name
    elif result.party_name:
        pid, pname = _find_party(result.party_name, order_type)
        result.party_id = pid
        result.party_name = pname

    if not result.party_id:
        result.warnings.append('طرف حساب شناسایی نشد؛ هنگام ذخیره انتخاب کنید.')

    unmatched = [item for item in result.items if not item.product_id]
    if unmatched:
        result.warnings.append(
            f'{len(unmatched)} کالا با موجودی تطبیق داده نشد؛ قبل از تأیید بررسی کنید.'
        )

    if result.confidence < 50:
        result.warnings.append('اطمینان استخراج پایین است؛ حتماً قبل از تأیید بررسی کنید.')

    return result
