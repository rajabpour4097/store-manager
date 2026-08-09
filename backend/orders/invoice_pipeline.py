"""خط لوله پردازش فاکتور:

PaddleOCR → Vision LLM → Validation → Human Confirmation → Inventory
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date

from core.jalali import parse_flexible_date

from .invoice_parser import (
    ParsedInvoice,
    _extract_invoice_number,
    _extract_party_name,
    _finalize_result,
    _parse_date_from_text,
    _parse_line_items_from_text,
)
from .invoice_validator import apply_validation_to_invoice, validate_structured
from .paddle_ocr import paddle_available, run_paddle_ocr
from .vision_llm import run_vision_llm, vision_llm_available

logger = logging.getLogger(__name__)


@dataclass
class PipelineStage:
    name: str
    label: str
    status: str  # pending, running, done, failed, skipped, review
    detail: str = ''


@dataclass
class PipelineTrace:
    stages: list[PipelineStage] = field(default_factory=list)
    engine: str = 'pipeline'

    def to_dict(self) -> list[dict]:
        return [
            {'name': s.name, 'label': s.label, 'status': s.status, 'detail': s.detail}
            for s in self.stages
        ]


def pipeline_capabilities() -> dict:
    paddle = paddle_available()
    vision = vision_llm_available()
    return {
        'pipeline': 'paddleocr → vision_llm → validation → human → inventory',
        'paddleocr': paddle,
        'vision_llm': vision,
        'configured': paddle or vision,
        'recommended': 'OPENAI_API_KEY + paddleocr' if vision else ('paddleocr only' if paddle else 'install dependencies'),
        'engines': [e for e in ('paddleocr', 'vision_llm') if (e == 'paddleocr' and paddle) or (e == 'vision_llm' and vision)],
    }


def _apply_structured_meta(invoice: ParsedInvoice, data: dict) -> None:
    invoice.party_name = (data.get('party_name') or invoice.party_name or '').strip()
    invoice.invoice_number = (data.get('invoice_number') or invoice.invoice_number or '').strip()
    raw_date = data.get('order_date')
    if raw_date:
        try:
            invoice.order_date = parse_flexible_date(str(raw_date))
        except (ValueError, TypeError):
            pass
    total = data.get('total_amount')
    if total is not None:
        from .invoice_parser import _parse_amount
        invoice.total_amount = _parse_amount(total)


def run_invoice_pipeline(
    image_bytes: bytes,
    *,
    order_type: str = 'purchase',
    party_id: int | None = None,
) -> tuple[ParsedInvoice, PipelineTrace]:
    trace = PipelineTrace()
    invoice = ParsedInvoice(order_date=date.today())
    structured: dict | None = None
    ocr_text = ''
    ocr_quality = 0

    # ── Stage 1: PaddleOCR ──────────────────────────────────────────
    paddle_stage = PipelineStage(name='paddleocr', label='PaddleOCR', status='running')
    trace.stages.append(paddle_stage)

    paddle_result = run_paddle_ocr(image_bytes)
    if paddle_result.success:
        ocr_text = paddle_result.raw_text
        ocr_quality = paddle_result.quality_score
        invoice.raw_text = ocr_text
        paddle_stage.status = 'done'
        paddle_stage.detail = f'{len(paddle_result.lines)} خط · امتیاز {paddle_result.quality_score}'
    else:
        paddle_stage.status = 'failed' if paddle_available() else 'skipped'
        paddle_stage.detail = paddle_result.error or 'PaddleOCR در دسترس نیست'

    # ── Stage 2: Vision LLM ─────────────────────────────────────────
    llm_stage = PipelineStage(name='vision_llm', label='Vision LLM', status='running')
    trace.stages.append(llm_stage)

    llm_result = run_vision_llm(
        image_bytes,
        ocr_text=ocr_text,
        table_text=paddle_result.table_text if paddle_result.success else '',
        order_type=order_type,
    )

    if llm_result.get('success') and llm_result.get('structured'):
        structured = llm_result['structured']
        llm_stage.status = 'done'
        item_count = len(structured.get('items') or [])
        llm_stage.detail = f'{item_count} ردیف ساخت‌یافته'
        trace.engine = 'paddleocr+vision_llm'
        _apply_structured_meta(invoice, structured)
        invoice.raw_text = llm_result.get('raw', invoice.raw_text)
    elif vision_llm_available():
        llm_stage.status = 'failed'
        llm_stage.detail = llm_result.get('error', 'خطای Vision LLM')
    else:
        llm_stage.status = 'skipped'
        llm_stage.detail = 'OPENAI_API_KEY تنظیم نشده'

    # fallback: parse OCR text without LLM
    if not structured and ocr_text:
        invoice.order_date = _parse_date_from_text(ocr_text) or date.today()
        invoice.party_name = _extract_party_name(ocr_text)
        invoice.invoice_number = _extract_invoice_number(ocr_text)
        invoice.items = _parse_line_items_from_text(ocr_text)
        trace.engine = 'paddleocr'

    # ── Stage 3: Validation ─────────────────────────────────────────
    val_stage = PipelineStage(name='validation', label='اعتبارسنجی', status='running')
    trace.stages.append(val_stage)

    if structured:
        validation = validate_structured(
            structured,
            order_type=order_type,
            ocr_quality=ocr_quality,
            engine='vision_llm' if llm_result.get('success') else 'paddleocr',
        )
        _apply_structured_meta(invoice, structured)
        apply_validation_to_invoice(invoice, validation)
        val_stage.status = 'review' if validation.issues else 'done'
        val_stage.detail = f'اطمینان {validation.confidence}% · {len(invoice.items)} ردیف'
    elif invoice.items:
        from .invoice_validator import ValidationResult
        validation = ValidationResult(
            valid=True,
            confidence=min(60, 20 + ocr_quality // 20),
            items=invoice.items,
        )
        apply_validation_to_invoice(invoice, validation)
        val_stage.status = 'review'
        val_stage.detail = f'فقط OCR · {len(invoice.items)} ردیف — نیاز به بررسی'
    else:
        val_stage.status = 'failed'
        val_stage.detail = 'داده معتبری یافت نشد'
        invoice.confidence = 5
        invoice.warnings.append(
            'خط لوله نتوانست فاکتور را بخواند. OPENAI_API_KEY و paddleocr را نصب کنید '
            'یا ردیف‌ها را دستی وارد کنید.'
        )

    # ── Stage 4: Human Confirmation (pending) ───────────────────────
    human_stage = PipelineStage(
        name='human_confirmation',
        label='تأیید کاربر',
        status='review' if invoice.items else 'pending',
        detail='ردیف‌ها را بررسی و تأیید کنید',
    )
    trace.stages.append(human_stage)

    # ── Stage 5: Inventory (pending until order confirmed) ─────────
    inv_stage = PipelineStage(
        name='inventory',
        label='موجودی انبار',
        status='pending',
        detail='پس از تأیید سفارش، موجودی به‌روز می‌شود',
    )
    trace.stages.append(inv_stage)

    invoice.ocr_engine = trace.engine

    # reuse finalize for party matching
    from .ocr_providers import OcrResult
    ocr_stub = OcrResult(engine=trace.engine, raw_text=ocr_text, quality_score=ocr_quality)
    if llm_result.get('success'):
        ocr_stub.structured = structured

    invoice = _finalize_result(invoice, order_type=order_type, party_id=party_id, ocr=ocr_stub)

    if not vision_llm_available() and paddle_result.success:
        invoice.warnings.insert(0,
            'Vision LLM فعال نیست. برای دقت بالا OPENAI_API_KEY را در .env تنظیم کنید.'
        )

    return invoice, trace
