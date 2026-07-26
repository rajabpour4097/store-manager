"""ابزارهای تبدیل تاریخ میلادی و شمسی.

تاریخ‌ها همیشه به صورت میلادی در دیتابیس ذخیره می‌شوند و فقط در لایه‌ی نمایش
(سریالایزر و گزارش‌ها) به شمسی تبدیل می‌شوند.
"""

from __future__ import annotations

import datetime as _dt
import re

import jdatetime

PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

MONTH_NAMES = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

WEEKDAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

_DATE_RE = re.compile(r'^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$')


def normalize_digits(value: str) -> str:
    """تبدیل ارقام فارسی/عربی به ارقام انگلیسی."""
    if not isinstance(value, str):
        return value
    for index, char in enumerate(PERSIAN_DIGITS):
        value = value.replace(char, str(index))
    for index, char in enumerate(ARABIC_DIGITS):
        value = value.replace(char, str(index))
    return value


# فایل‌های تولید‌شده در ویندوز اغلب حروف عربی «ي» و «ك» را به‌جای فارسی دارند
ARABIC_TO_PERSIAN = str.maketrans({
    'ي': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه',
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
    'ؤ': 'و', 'ئ': 'ی',
    '\u200c': ' ', '\u200f': '', '\u200e': '', '\ufeff': '',
})


def normalize_persian(value: str) -> str:
    """یکدست‌سازی حروف فارسی/عربی و ارقام برای مقایسه‌ی متنی."""
    if not isinstance(value, str):
        return value
    return normalize_digits(value.translate(ARABIC_TO_PERSIAN))


def to_jalali(value: _dt.date | _dt.datetime | None) -> str | None:
    """تبدیل تاریخ میلادی به رشته‌ی شمسی مثل ۱۴۰۳/۰۵/۱۲."""
    if value is None:
        return None
    if isinstance(value, _dt.datetime):
        value = value.date()
    jd = jdatetime.date.fromgregorian(date=value)
    return f'{jd.year:04d}/{jd.month:02d}/{jd.day:02d}'


def to_jalali_verbose(value: _dt.date | _dt.datetime | None) -> str | None:
    """تبدیل تاریخ میلادی به رشته‌ی خوانا مثل «۱۲ مرداد ۱۴۰۳»."""
    if value is None:
        return None
    if isinstance(value, _dt.datetime):
        value = value.date()
    jd = jdatetime.date.fromgregorian(date=value)
    return f'{jd.day} {MONTH_NAMES[jd.month - 1]} {jd.year}'


def parse_jalali(value: str | None) -> _dt.date | None:
    """تبدیل رشته‌ی شمسی (۱۴۰۳/۰۵/۱۲ یا 1403-05-12) به تاریخ میلادی."""
    if not value:
        return None
    value = normalize_digits(str(value)).strip()
    match = _DATE_RE.match(value)
    if not match:
        raise ValueError(f'قالب تاریخ شمسی نامعتبر است: {value}')
    year, month, day = (int(part) for part in match.groups())
    return jdatetime.date(year, month, day).togregorian()


def parse_flexible_date(value: str | None) -> _dt.date | None:
    """تاریخ ورودی را می‌پذیرد؛ اگر سال >= ۱۳۰۰ و < ۱۷۰۰ باشد شمسی در نظر گرفته می‌شود."""
    if not value:
        return None
    if isinstance(value, _dt.datetime):
        return value.date()
    if isinstance(value, _dt.date):
        return value
    value = normalize_digits(str(value)).strip()
    match = _DATE_RE.match(value)
    if not match:
        raise ValueError(f'قالب تاریخ نامعتبر است: {value}')
    year, month, day = (int(part) for part in match.groups())
    if 1300 <= year < 1700:
        return jdatetime.date(year, month, day).togregorian()
    return _dt.date(year, month, day)


def jalali_month_range(jyear: int, jmonth: int) -> tuple[_dt.date, _dt.date]:
    """بازه‌ی میلادی متناظر با یک ماه شمسی."""
    start = jdatetime.date(jyear, jmonth, 1)
    if jmonth == 12:
        next_month = jdatetime.date(jyear + 1, 1, 1)
    else:
        next_month = jdatetime.date(jyear, jmonth + 1, 1)
    return start.togregorian(), next_month.togregorian() - _dt.timedelta(days=1)


def jalali_month_label(value: _dt.date) -> str:
    """برچسب ماه شمسی برای گروه‌بندی گزارش‌ها، مثل «۱۴۰۳/۰۵»."""
    jd = jdatetime.date.fromgregorian(date=value)
    return f'{jd.year:04d}/{jd.month:02d}'


def jalali_weekday(value: _dt.date) -> int:
    """شماره‌ی روز هفته به سبک ایرانی: شنبه = ۰ ... جمعه = ۶."""
    return jdatetime.date.fromgregorian(date=value).weekday()


def jalali_weekday_name(value: _dt.date) -> str:
    return WEEKDAY_NAMES[jalali_weekday(value)]


def today_jalali() -> str:
    return to_jalali(_dt.date.today())
