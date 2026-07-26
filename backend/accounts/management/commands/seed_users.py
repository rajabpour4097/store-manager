"""ساخت کاربران پیش‌فرض سیستم: دو مدیر و یک حسابدار."""

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Role, User

DEFAULT_USERS = [
    {
        'username': 'manager1',
        'password': 'Manager@1234',
        'first_name': 'محمد',
        'last_name': 'رجب‌پور',
        'role': Role.MANAGER,
        'phone_number': '09120000001',
        'email': 'manager1@store.local',
        'is_staff': True,
        'is_superuser': True,
    },
    {
        'username': 'manager2',
        'password': 'Manager@2345',
        'first_name': 'زهرا',
        'last_name': 'کریمی',
        'role': Role.MANAGER,
        'phone_number': '09120000002',
        'email': 'manager2@store.local',
        'is_staff': True,
        'is_superuser': False,
    },
    {
        'username': 'accountant',
        'password': 'Hesab@1234',
        'first_name': 'علی',
        'last_name': 'مرادی',
        'role': Role.ACCOUNTANT,
        'phone_number': '09120000003',
        'email': 'accountant@store.local',
        'is_staff': False,
        'is_superuser': False,
    },
]


class Command(BaseCommand):
    help = 'ساخت یا بازنشانی کاربران پیش‌فرض (دو مدیر و یک حسابدار)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset-passwords',
            action='store_true',
            help='رمز عبور کاربران موجود را هم بازنشانی کن',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        reset = options['reset_passwords']
        created_count = 0
        updated_count = 0

        for spec in DEFAULT_USERS:
            password = spec.pop('password')
            username = spec['username']
            user, created = User.objects.get_or_create(username=username, defaults=spec)

            if created:
                user.set_password(password)
                user.save()
                created_count += 1
                self.stdout.write(self.style.SUCCESS(
                    f'کاربر ساخته شد: {username} / {password} ({user.get_role_display()})'))
            else:
                for key, value in spec.items():
                    setattr(user, key, value)
                if reset:
                    user.set_password(password)
                user.save()
                updated_count += 1
                self.stdout.write(self.style.WARNING(
                    f'کاربر از قبل وجود داشت و به‌روزرسانی شد: {username}'
                    + (f' / رمز بازنشانی شد: {password}' if reset else '')))
            spec['password'] = password

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'پایان: {created_count} کاربر جدید، {updated_count} کاربر به‌روزرسانی‌شده.'))
        self.stdout.write('')
        self.stdout.write('اطلاعات ورود:')
        for spec in DEFAULT_USERS:
            self.stdout.write(f"  {spec['username']:<12} | {spec['password']:<14} | "
                              f"{'مدیر' if spec['role'] == Role.MANAGER else 'حسابدار'}")
