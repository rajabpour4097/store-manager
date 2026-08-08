"""موتورهای OCR/Vision برای استخراج متن یا JSON ساخت‌یافته از تصویر فاکتور."""

from __future__ import annotations

import base64
import io
import json
import logging
import re
import shutil
import urllib.error
import urllib.request
from dataclasses import dataclass

from django.conf import settings
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

logger = logging.getLogger(__name__)

VISION_PROMPT = """You are an expert at reading Persian (Farsi) retail invoices, purchase orders, and delivery notes (حواله).
The image may be a photo of a printed invoice with blue/purple ink, dot-matrix print, or slightly blurry.

Extract ALL product line items accurately.

Return ONLY valid JSON:
{
  "party_name": "supplier or customer name",
  "invoice_number": "invoice or حواله number",
  "order_date": "1403/12/01",
  "total_amount": 0,
  "items": [
    {
      "product_name": "full Persian product name with brand and model",
      "product_code": "product code if visible",
      "quantity": 1,
      "unit_price": 0,
      "total_price": 0
    }
  ]
}

Rules:
- Read Persian text carefully; convert ۰-۹ to 0-9 in numbers.
- unit_price and total_price are in Rials (no commas in JSON numbers).
- quantity is usually small (1-1000); unit_price is usually millions of Rials.
- Include every product row from the table, not headers or totals.
- product_name must be in Persian when the invoice is Persian.
"""


@dataclass
class OcrResult:
    engine: str
    raw_text: str = ''
    structured: dict | None = None
    error: str = ''
    quality_score: int = 0


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
    recommended = 'openai' if openai_available() else (engines[0] if engines else None)
    return {
        'engines': engines,
        'recommended': recommended,
        'configured': bool(engines),
        'openai': openai_available(),
        'tesseract': tesseract_available(),
    }


def _score_text_quality(text: str) -> int:
    if not text:
        return 0
    persian = len(re.findall(r'[\u0600-\u06FF]', text))
    digits = len(re.findall(r'\d', text))
    words = len(re.findall(r'[\u0600-\u06FF]{2,}', text))
    garbage = len(re.findall(r'[\\|{}~`^]', text))
    return persian * 4 + words * 8 + digits - garbage * 10


def _resize(image: Image.Image, min_size: int = 2200) -> Image.Image:
    w, h = image.size
    if max(w, h) >= min_size:
        return image
    scale = min_size / max(w, h)
    return image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)


def _preprocess_variants(image_bytes: bytes) -> list[tuple[str, Image.Image]]:
    """چند نسخه پیش‌پردازش‌شده برای OCR فاکتورهای آبی/بنفش."""
    base = Image.open(io.BytesIO(image_bytes))
    if base.mode not in ('RGB', 'L'):
        base = base.convert('RGB')
    base = _resize(base)

    variants: list[tuple[str, Image.Image]] = []

    gray = ImageOps.autocontrast(base.convert('L'))
    variants.append(('contrast', ImageEnhance.Contrast(gray).enhance(2.2).filter(ImageFilter.SHARPEN)))

    r, g, b = base.split()
    blue_ink = ImageOps.autocontrast(b.point(lambda x: 255 - x))
    variants.append(('blue_inv', blue_ink.filter(ImageFilter.SHARPEN)))

    red_ink = ImageOps.autocontrast(r.point(lambda x: 255 - x if x < 200 else 255))
    variants.append(('red_inv', red_ink))

    binary = gray.point(lambda x: 0 if x < 155 else 255, mode='1').convert('L')
    variants.append(('binary', binary))

    return variants


def extract_with_tesseract(image_bytes: bytes) -> OcrResult:
    try:
        import pytesseract

        best_text = ''
        best_score = 0
        psm_modes = ('4', '6', '3', '11')

        for _name, image in _preprocess_variants(image_bytes):
            for psm in psm_modes:
                config = f'--psm {psm} -c preserve_interword_spaces=1'
                try:
                    text = pytesseract.image_to_string(image, lang='fas+eng', config=config)
                except Exception:
                    continue
                text = text or ''
                score = _score_text_quality(text)
                if score > best_score:
                    best_score = score
                    best_text = text

        if not best_text.strip():
            return OcrResult(
                engine='tesseract',
                error='Tesseract نتوانست متن قابل‌خواندن استخراج کند. OpenAI Vision دقیق‌تر است.',
                quality_score=0,
            )

        return OcrResult(engine='tesseract', raw_text=best_text, quality_score=best_score)
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
                {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{b64}', 'detail': 'high'}},
            ],
        }],
        'response_format': {'type': 'json_object'},
        'max_tokens': 4096,
        'temperature': 0.1,
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
        with urllib.request.urlopen(request, timeout=120) as response:
            body = json.loads(response.read().decode('utf-8'))
        content = body['choices'][0]['message']['content']
        structured = json.loads(content)
        item_count = len(structured.get('items') or [])
        return OcrResult(
            engine='openai',
            structured=structured,
            raw_text=content,
            quality_score=80 + item_count * 5,
        )
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
            error='Tesseract نصب نیست.',
        )

    # auto — OpenAI first
    if openai_available():
        result = extract_with_openai(image_bytes)
        if result.structured and result.structured.get('items'):
            return result
        if result.error and '401' in result.error:
            return result

    if tesseract_available():
        return extract_with_tesseract(image_bytes)

    if not ocr_capabilities()['configured']:
        return OcrResult(
            engine='none',
            error='هیچ موتور OCR فعال نیست. OPENAI_API_KEY را در .env تنظیم کنید.',
        )

    return OcrResult(engine='none', error='متن فاکتور استخراج نشد.')
