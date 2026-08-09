"""مرحله ۲: ساختاردهی فاکتور با Vision LLM (تصویر + متن OCR)."""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

STRUCTURE_PROMPT = """You structure Persian invoice data for an inventory system.

You receive:
1) The invoice IMAGE
2) OCR text extracted by PaddleOCR (may contain errors — use image to correct)

Return ONLY valid JSON:
{
  "party_name": "",
  "invoice_number": "",
  "order_date": "1403/12/01",
  "total_amount": 0,
  "items": [
    {
      "product_name": "نام کامل کالا به فارسی",
      "product_code": "",
      "quantity": 1,
      "unit_price": 0,
      "total_price": 0
    }
  ]
}

Rules:
- order_type hint: {order_type_hint}
- Use IMAGE as primary source; OCR text is helper only.
- Convert Persian digits to Western in numbers.
- Prices in Rials without commas.
- quantity is usually 1-1000; unit_price often millions.
- Extract ALL product rows from table; skip headers/totals/signatures.
- product_name must be meaningful Persian (brand, model, size, color).
"""


def vision_llm_available() -> bool:
    return bool(getattr(settings, 'OPENAI_API_KEY', ''))


def run_vision_llm(
    image_bytes: bytes,
    *,
    ocr_text: str = '',
    table_text: str = '',
    order_type: str = 'purchase',
) -> dict:
    """برگرداندن dict با کلیدهای success, structured, error, engine."""
    api_key = getattr(settings, 'OPENAI_API_KEY', '')
    model = getattr(settings, 'OPENAI_VISION_MODEL', 'gpt-4o-mini')

    if not api_key:
        return {
            'success': False,
            'engine': 'none',
            'error': 'OPENAI_API_KEY تنظیم نشده — مرحله Vision LLM غیرفعال است.',
        }

    order_hint = 'خرید از تأمین‌کننده' if order_type == 'purchase' else 'فروش به مشتری'
    prompt = STRUCTURE_PROMPT.format(order_type_hint=order_hint)
    ocr_context = ''
    if table_text:
        ocr_context = f'\n\nPaddleOCR table layout:\n{table_text[:4000]}'
    elif ocr_text:
        ocr_context = f'\n\nPaddleOCR raw text:\n{ocr_text[:4000]}'

    b64 = base64.b64encode(image_bytes).decode('ascii')
    mime = 'image/png' if image_bytes[:8] == b'\x89PNG\r\n\x1a\n' else 'image/jpeg'

    payload = {
        'model': model,
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': prompt + ocr_context},
                {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{b64}', 'detail': 'high'}},
            ],
        }],
        'response_format': {'type': 'json_object'},
        'max_tokens': 4096,
        'temperature': 0.05,
    }

    request = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = json.loads(response.read().decode('utf-8'))
        content = body['choices'][0]['message']['content']
        structured = json.loads(content)
        return {
            'success': True,
            'engine': 'vision_llm',
            'structured': structured,
            'raw': content,
        }
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:400]
        logger.warning('Vision LLM HTTP %s: %s', exc.code, detail)
        return {'success': False, 'engine': 'vision_llm', 'error': f'خطای API ({exc.code}): {detail}'}
    except Exception as exc:
        logger.warning('Vision LLM failed: %s', exc)
        return {'success': False, 'engine': 'vision_llm', 'error': str(exc)}
