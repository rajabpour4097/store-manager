"""همگام‌سازی مجدد اسناد دفتر برای همه‌ی چک‌ها."""

from django.core.management.base import BaseCommand

from cheques.models import Cheque
from cheques.services import sync_cheque_ledger


class Command(BaseCommand):
    help = 'اسناد دفتر طرف‌حساب مربوط به چک‌ها را با منطق فعلی دوباره می‌سازد.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--direction',
            choices=['payable', 'receivable'],
            help='فقط چک‌های پرداختی یا دریافتی',
        )

    def handle(self, *args, **options):
        queryset = Cheque.objects.select_related('party', 'created_by').order_by('id')
        direction = options.get('direction')
        if direction:
            queryset = queryset.filter(direction=direction)

        total = queryset.count()
        if total == 0:
            self.stdout.write('چکی برای همگام‌سازی یافت نشد.')
            return

        for index, cheque in enumerate(queryset.iterator(), start=1):
            sync_cheque_ledger(cheque, user=cheque.created_by)
            self.stdout.write(
                f'[{index}/{total}] {cheque.get_direction_display()} '
                f'{cheque.serial_number} — {cheque.party.name}'
            )

        self.stdout.write(self.style.SUCCESS(f'همگام‌سازی {total} چک انجام شد.'))
