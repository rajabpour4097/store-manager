"""وارد کردن کالاها از CSV — ابتدا دسته‌بندی‌ها، سپس کالاها."""

from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.models import Product, ProductCategory, Unit

DEFAULT_CSV = Path('/root/store-manager/backend/catalog/management/products.csv')


class Command(BaseCommand):
    help = 'وارد کردن دسته‌بندی‌ها و کالاها از فایل CSV'

    def add_arguments(self, parser):
        parser.add_argument(
            '--csv',
            type=str,
            default=str(DEFAULT_CSV),
            help='مسیر فایل CSV (پیش‌فرض: ShopFiles/product-import/products.csv)',
        )
        parser.add_argument(
            '--update',
            action='store_true',
            help='به‌روزرسانی قیمت و دسته کالاهای موجود',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='فقط گزارش بدون ذخیره در دیتابیس',
        )

    def handle(self, *args, **options):
        csv_path = Path(options['csv'])
        if not csv_path.exists():
            raise CommandError(f'فایل CSV یافت نشد: {csv_path}')

        rows = self._read_csv(csv_path)
        if not rows:
            raise CommandError('فایل CSV خالی است')

        categories = sorted({r['category'] for r in rows if r['category']})
        self.stdout.write(f'خواندن {len(rows)} کالا از {csv_path.name}')
        self.stdout.write(f'{len(categories)} دسته‌بندی یکتا')

        if options['dry_run']:
            self._report(rows, categories)
            return

        with transaction.atomic():
            cat_map = self._ensure_categories(categories)
            created, updated, skipped = self._import_products(
                rows, cat_map, update=options['update'],
            )

        self.stdout.write(self.style.SUCCESS(
            f'دسته‌بندی: {len(cat_map)} | '
            f'کالای جدید: {created} | '
            f'به‌روزرسانی: {updated} | '
            f'رد شده: {skipped}',
        ))

    def _read_csv(self, path: Path) -> list[dict]:
        with path.open(encoding='utf-8-sig', newline='') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames or []
            name_col = self._find_column(fieldnames, ['نام کالا', 'name', 'product_name'])
            cat_col = self._find_column(fieldnames, ['دسته', 'category'])
            sale_col = self._find_column(fieldnames, ['نرخ فروش', 'sale_price', 'sale_rate'])
            buy_col = self._find_column(fieldnames, ['نرخ خرید', 'purchase_price', 'buy_rate'])

            if not name_col:
                raise CommandError('ستون «نام کالا» در CSV یافت نشد')

            rows = []
            for i, row in enumerate(reader, start=2):
                name = (row.get(name_col) or '').strip()
                if not name:
                    continue
                rows.append({
                    'name': name,
                    'category': (row.get(cat_col) or '').strip() if cat_col else '',
                    'sale_price': self._parse_price(row.get(sale_col) if sale_col else ''),
                    'purchase_price': self._parse_price(row.get(buy_col) if buy_col else ''),
                    'line': i,
                })
            return rows

    @staticmethod
    def _find_column(fieldnames: list[str], candidates: list[str]) -> str | None:
        normalized = {f.strip(): f for f in fieldnames}
        for c in candidates:
            if c in normalized:
                return normalized[c]
        return None

    @staticmethod
    def _parse_price(value) -> Decimal:
        if value is None:
            return Decimal('0')
        text = str(value).strip().replace(',', '')
        if not text:
            return Decimal('0')
        try:
            return Decimal(text).quantize(Decimal('1'))
        except InvalidOperation:
            return Decimal('0')

    def _ensure_categories(self, names: list[str]) -> dict[str, ProductCategory]:
        cat_map: dict[str, ProductCategory] = {}
        created = 0
        for name in names:
            cat, was_created = ProductCategory.objects.get_or_create(
                name=name,
                defaults={'is_active': True},
            )
            cat_map[name] = cat
            if was_created:
                created += 1
                self.stdout.write(f'  + دسته: {name}')
        if created:
            self.stdout.write(f'  {created} دسته‌بندی جدید ساخته شد')
        return cat_map

    def _import_products(
        self,
        rows: list[dict],
        cat_map: dict[str, ProductCategory],
        *,
        update: bool,
    ) -> tuple[int, int, int]:
        created = updated = skipped = 0
        for row in rows:
            category = cat_map.get(row['category']) if row['category'] else None
            defaults = {
                'category': category,
                'unit': Unit.PIECE,
                'purchase_price': row['purchase_price'],
                'sale_price': row['sale_price'],
                'is_active': True,
            }

            product = Product.objects.filter(name=row['name']).first()
            if product is None:
                Product.objects.create(name=row['name'], **defaults)
                created += 1
                self.stdout.write(f'  + {row["name"]}')
            elif update:
                for key, val in defaults.items():
                    setattr(product, key, val)
                product.save()
                updated += 1
                self.stdout.write(f'  ~ {row["name"]}')
            else:
                skipped += 1
        return created, updated, skipped

    def _report(self, rows: list[dict], categories: list[str]) -> None:
        self.stdout.write(self.style.WARNING('حالت dry-run — بدون تغییر در دیتابیس'))
        self.stdout.write('دسته‌بندی‌ها:')
        for c in categories:
            self.stdout.write(f'  - {c}')
        self.stdout.write('نمونه کالاها:')
        for row in rows[:5]:
            self.stdout.write(
                f'  {row["name"]} | {row["category"]} | '
                f'فروش: {row["sale_price"]:,} | خرید: {row["purchase_price"]:,}',
            )
        if len(rows) > 5:
            self.stdout.write(f'  ... و {len(rows) - 5} کالای دیگر')
