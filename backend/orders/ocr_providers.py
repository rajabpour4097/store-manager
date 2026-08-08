"""موتورهای OCR/Vision برای استخراج متن یا JSON ساخت‌یافته از تصویر فاکتور."""

from __future__ import annotations

import base64
import io
import json
import logging
import shutil
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings
from PIL import Image, ImageEnhance, ImageFilter

logger = logging.getLogger(__name__)

VISION_PROMPT = """You are an expert at reading Persian (Farsi) retail invoices and delivery notes.
Extract ALL line items from this invoice image.

Return ONLY valid JSON with this exact schema:
{
  "party_name": "customer or supplier name",
  "invoice_number": "invoice number if visible",
  "order_date": "date in YYYY/MM/DD jalali or gregorian format",
  "total_amount": 0,
  "items": [
    {
      "product_name": "full product description in Persian",
      "product_code": "SKU/code if visible or empty string",
      "quantity": 1,
      "unit_price": 0,
      "total_price": 0
    }
  ]
}

Rules:
- product_name must be the full Persian description (brand, model, size, color).
- quantity is numeric (convert Persian digits to Western).
- unit_price and total_price are in Rials without commas.
- Skip header/footer/total rows; only real product lines.
- If a field is missing, use empty string or 0.
- order_date: prefer jalali format like 1403/10/19 if shown.
"""


@dataclass
class OcrResult:
    engine: str
    raw_text: str = ''
    structured: dict | None = None
    error: str = ''


def tesseract_available() -> bool:
    if not shutil.which('tesseract'):
        return False
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        return False
    return True


def openai_available() -> bool:
    return bool(getattr(settings, 'OPENAI_API_KEY', ''))


def ocr_capabilities() -> dict:
    engines = []
    if openai_available():
        engines.append('openai')
    if tesseract_available():
        engines.append('tesseract')
    recommended = engines[0] if engines else None
    return {
        'engines': engines,
        'recommended': recommended,
        'configured': bool(engines),
        'openai': openai_available(),
        'tesseract': tesseract_available(),
    }


def _preprocess_image(image_bytes: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    w, h = image.size
    if max(w, h) < 1800:
        scale = 1800 / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    gray = image.convert('L')
    enhanced = ImageEnhance.Contrast(gray).enhance(1.8)
    return enhanced.filter(ImageFilter.SHARPEN)


def extract_with_tesseract(image_bytes: bytes) -> OcrResult:
    try:
        import pytesseract

        image = _preprocess_image(image_bytes)
        text = pytesseract.image_to_string(image, lang='fas+eng', config='--psm 6')
        return OcrResult(engine='tesseract', raw_text=text or '')
    except Exception as exc:
        logger.warning('Tesseract OCR failed: %s', exc)
        return OcrResult(engine='tesseract', error=str(exc))


def extract_with_openai(image_bytes: bytes) -> OcrResult:
    api_key = getattr(settings, 'OPENAI_API_KEY', '')
    model = getattr(settings, 'OPENAI_VISION_MODEL', 'gpt-4o-mini')
    if not api_key:
        return OcrResult(engine='openai', error='OPENAI_API_KEY تنظیم نشده است.')

    b64 = base64.b64encode(image_bytes).decode('ascii')
    mime = 'image/jpeg'
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        mime = 'image/png'

    payload = {
        'model': model,
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': VISION_PROMPT},
                {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{b64}'}},
            ],
        }],
        'response_format': {'type': 'json_object'},
        'max_tokens': 4096,
    }

    request = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.loads(response.read().decode('utf-8'))
        content = body['choices'][0]['message']['content']
        structured = json.loads(content)
        return OcrResult(engine='openai', structured=structured, raw_text=content)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:500]
        logger.warning('OpenAI Vision HTTP error: %s %s', exc.code, detail)
        return OcrResult(engine='openai', error=f'خطای OpenAI ({exc.code}): {detail}')
    except Exception as exc:
        logger.warning('OpenAI Vision failed: %s', exc)
        return OcrResult(engine='openai', error=str(exc))


def run_ocr(image_bytes: bytes) -> OcrResult:
    """اجرای OCR با اولویت: OpenAI Vision → Tesseract."""
    provider = getattr(settings, 'INVOICE_OCR_PROVIDER', 'auto').lower()

    if provider == 'openai':
        if openai_available():
            return extract_with_openai(image_bytes)
        return OcrResult(engine='none', error='OpenAI API Key تنظیم نشده است.')

    if provider == 'tesseract':
        if tesseract_available():
            return extract_with_tesseract(image_bytes)
        return OcrResult(
            engine='none',
            error='Tesseract نصب نیست. دستور: sudo apt install tesseract-ocr tesseract-ocr-fas && pip install pytesseract',
        )

    # auto
    if openai_available():
        result = extract_with_openai(image_bytes)
        if result.structured and result.structured.get('items'):
            return result

    if tesseract_available():
        result = extract_with_tesseract(image_bytes)
        if result.raw_text.strip():
            return result

    caps = ocr_capabilities()
    if not caps['configured']:
        return OcrResult(
            engine='none',
            error=(
                'هیچ موتور OCR فعال نیست. یکی از این دو را راه‌اندازی کنید:\n'
                '1) OpenAI: OPENAI_API_KEY در فایل .env\n'
                '2) Tesseract: sudo apt install tesseract-ocr tesseract-ocr-fas && pip install pytesseract'
            ),
        )

    return OcrResult(engine='none', error='متن فاکتور از تصویر استخراج نشد.')
