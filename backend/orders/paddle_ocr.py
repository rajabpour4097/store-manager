"""مرحله ۱: استخراج متن با PaddleOCR (بهینه برای متن فارسی/عربی)."""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

_paddle_instance = None


@dataclass
class OcrLine:
    text: str
    confidence: float
    box: list


@dataclass
class PaddleOcrResult:
    success: bool
    raw_text: str = ''
    lines: list[OcrLine] = field(default_factory=list)
    table_text: str = ''
    error: str = ''
    quality_score: int = 0


def paddle_available() -> bool:
    try:
        from paddleocr import PaddleOCR  # noqa: F401
        return True
    except ImportError:
        return False


def _get_paddle():
    global _paddle_instance
    if _paddle_instance is None:
        from paddleocr import PaddleOCR
        _paddle_instance = PaddleOCR(
            use_angle_cls=True,
            lang='arabic',
            show_log=False,
            use_gpu=False,
        )
    return _paddle_instance


def _normalize(text: str) -> str:
    return (
        text.replace('۰', '0').replace('۱', '1').replace('۲', '2').replace('۳', '3')
        .replace('۴', '4').replace('۵', '5').replace('۶', '6').replace('۷', '7')
        .replace('۸', '8').replace('۹', '9')
        .replace('ي', 'ی').replace('ك', 'ک')
    )


def _score_text(text: str) -> int:
    persian = len(re.findall(r'[\u0600-\u06FF]', text))
    digits = len(re.findall(r'\d', text))
    return persian * 5 + digits * 2


def _preprocess(image_bytes: bytes):
    import numpy as np

    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    w, h = img.size
    if max(w, h) < 1600:
        scale = 1600 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    gray = ImageOps.autocontrast(img.convert('L'))
    return np.array(gray.convert('RGB'))


def _group_lines(ocr_lines: list[OcrLine]) -> str:
    """چیدمان خطوط OCR بر اساس موقعیت عمودی (شبیه جدول)."""
    if not ocr_lines:
        return ''

    sorted_lines = sorted(ocr_lines, key=lambda ln: (ln.box[0][1] if ln.box else 0))
    rows: list[list[OcrLine]] = []
    y_threshold = 25

    for line in sorted_lines:
        y = line.box[0][1] if line.box else 0
        if not rows:
            rows.append([line])
            continue
        last_y = rows[-1][0].box[0][1] if rows[-1][0].box else 0
        if abs(y - last_y) <= y_threshold:
            rows[-1].append(line)
        else:
            rows.append([line])

    table_rows = []
    for row in rows:
        row_sorted = sorted(row, key=lambda ln: ln.box[0][0] if ln.box else 0)
        table_rows.append(' | '.join(ln.text for ln in row_sorted if ln.text.strip()))

    return '\n'.join(table_rows)


def run_paddle_ocr(image_bytes: bytes) -> PaddleOcrResult:
    if not paddle_available():
        return PaddleOcrResult(
            success=False,
            error='PaddleOCR نصب نیست. pip install paddlepaddle paddleocr',
        )

    try:
        ocr = _get_paddle()
        arr = _preprocess(image_bytes)
        raw = ocr.ocr(arr, cls=True)

        lines: list[OcrLine] = []
        if raw:
            for page in raw:
                if not page:
                    continue
                for entry in page:
                    box, (text, conf) = entry
                    text = _normalize(text or '').strip()
                    if text:
                        lines.append(OcrLine(text=text, confidence=float(conf), box=box))

        raw_text = '\n'.join(ln.text for ln in lines)
        table_text = _group_lines(lines)
        quality = _score_text(raw_text)

        if not raw_text.strip():
            return PaddleOcrResult(
                success=False,
                error='PaddleOCR متنی استخراج نکرد.',
                quality_score=0,
            )

        return PaddleOcrResult(
            success=True,
            raw_text=raw_text,
            lines=lines,
            table_text=table_text,
            quality_score=quality,
        )
    except Exception as exc:
        logger.exception('PaddleOCR failed')
        return PaddleOcrResult(success=False, error=str(exc))
