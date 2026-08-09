"""مرحله ۳: اعتبارسنجی داده استخراج‌شده فاکتور."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from .invoice_parser import (
    ParsedLineItem,
    ParsedInvoice,
    _dedupe_items,
    _is_valid_line_item,
    _parse_amount,
    _parse_quantity,
    match_product,
)


@dataclass
class ValidationIssue:
    level: str  # error, warning, info
    code: str
    message: str
    field: str = ''


@dataclass
class ValidationResult:
    valid: bool
    confidence: int
    issues: list[ValidationIssue] = field(default_factory=list)
    items: list[ParsedLineItem] = field(default_factory=list)

    def issue_messages(self) -> list[str]:
        return [i.message for i in self.issues if i.level in ('error', 'warning')]


def _parse_from_structured(data: dict) -> list[ParsedLineItem]:
    """Parse structured dict into line items with validation."""
    from .invoice_parser import _is_valid_product_name

    items: list[ParsedLineItem] = []
    for row in data.get('items') or []:
        name = (row.get('product_name') or '').strip()
        if not name or not _is_valid_product_name(name):
            continue
        quantity = _parse_quantity(row.get('quantity'))
        unit_price = _parse_amount(row.get('unit_price'))
        if unit_price is None:
            total = _parse_amount(row.get('total_price'))
            if total and quantity:
                unit_price = (total / quantity).quantize(Decimal('1'))
            else:
                continue
        if not _is_valid_line_item(name, quantity, unit_price):
            continue
        code = (row.get('product_code') or '').strip()
        product_id, score = match_product(name, code)
        items.append(ParsedLineItem(
            product_name=name,
            quantity=quantity,
            unit_price=unit_price,
            product_id=product_id,
            match_score=score,
            product_code=code,
        ))
    return _dedupe_items(items)


def validate_structured(
    data: dict,
    *,
    order_type: str,
    ocr_quality: int = 0,
    engine: str = 'pipeline',
) -> ValidationResult:
    items = _parse_from_structured(data)
    issues: list[ValidationIssue] = []

    if not items:
        issues.append(ValidationIssue(
            level='error', code='no_items',
            message='هیچ ردیف کالای معتبری شناسایی نشد.',
        ))

    total_amount = _parse_amount(data.get('total_amount'))
    if items and total_amount:
        computed = sum((i.quantity * i.unit_price for i in items), Decimal('0'))
        diff = abs(computed - total_amount)
        tolerance = max(total_amount * Decimal('0.05'), Decimal('10000'))
        if diff > tolerance:
            issues.append(ValidationIssue(
                level='warning', code='total_mismatch',
                message=f'جمع ردیف‌ها ({computed:,}) با مبلغ کل ({total_amount:,}) مطابقت ندارد.',
            ))

    unmatched = [i for i in items if not i.product_id]
    if unmatched:
        issues.append(ValidationIssue(
            level='warning', code='unmatched_products',
            message=f'{len(unmatched)} کالا در انبار یافت نشد.',
        ))

    if not (data.get('party_name') or '').strip():
        issues.append(ValidationIssue(
            level='warning', code='no_party',
            message='طرف حساب شناسایی نشد؛ هنگام ثبت انتخاب کنید.',
        ))

    matched = sum(1 for i in items if i.product_id)
    base = 50 if engine == 'vision_llm' else 30
    confidence = min(95, base + len(items) * 8 + matched * 10 + ocr_quality // 30)

    has_errors = any(i.level == 'error' for i in issues)
    return ValidationResult(
        valid=not has_errors and len(items) > 0,
        confidence=confidence if items else 10,
        issues=issues,
        items=items,
    )


def apply_validation_to_invoice(
    invoice: ParsedInvoice,
    validation: ValidationResult,
) -> ParsedInvoice:
    invoice.items = validation.items
    invoice.confidence = validation.confidence
    for msg in validation.issue_messages():
        if msg not in invoice.warnings:
            invoice.warnings.append(msg)
    return invoice
