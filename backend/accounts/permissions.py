"""سیاست دسترسی‌ها.

دو نقش وجود دارد:

* مدیر (manager): دسترسی کامل به همه بخش‌ها، شامل حذف رکوردها، مدیریت کاربران،
  تنظیمات سیستم و تأیید نهایی سفارشات.
* حسابدار (accountant): ثبت و ویرایش چک‌ها، اسناد بدهکار/بستانکار، طرف‌حساب‌ها،
  کالاها و سفارشات + مشاهده تمام گزارش‌ها (از جمله سود و زیان).
  اجازه‌ی حذف رکورد، مدیریت کاربران و تأیید/لغو نهایی سفارش را ندارد.
"""

from rest_framework import permissions

SAFE_METHODS = permissions.SAFE_METHODS

# نقشه‌ی دسترسی‌های نقش حسابدار؛ هر کلید یک قابلیت سیستم است.
ACCOUNTANT_CAPABILITIES = {
    'cheques.view': True,
    'cheques.add': True,
    'cheques.change': True,
    'cheques.delete': False,
    'parties.view': True,
    'parties.add': True,
    'parties.change': True,
    'parties.delete': False,
    'ledger.view': True,
    'ledger.add': True,
    'ledger.change': True,
    'ledger.delete': False,
    'catalog.view': True,
    'catalog.add': True,
    'catalog.change': True,
    'catalog.delete': False,
    'orders.view': True,
    'orders.add': True,
    'orders.change': True,
    'orders.delete': False,
    'orders.confirm': False,
    'orders.import_sales': True,
    'orders.upload_invoice': True,
    'reports.view': True,
    'reports.profit_loss': True,
    'users.manage': False,
    'settings.manage': False,
    'activity.view': False,
}

MANAGER_CAPABILITIES = {key: True for key in ACCOUNTANT_CAPABILITIES}


def capabilities_for(user) -> dict:
    """فهرست دسترسی‌های یک کاربر."""
    if not user or not user.is_authenticated:
        return {key: False for key in ACCOUNTANT_CAPABILITIES}
    if getattr(user, 'is_manager', False):
        return dict(MANAGER_CAPABILITIES)
    return dict(ACCOUNTANT_CAPABILITIES)


def has_capability(user, capability: str) -> bool:
    return capabilities_for(user).get(capability, False)


class IsManager(permissions.BasePermission):
    """فقط مدیر."""

    message = 'این عملیات فقط برای مدیر مجاز است.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_manager)


class IsManagerOrReadOnly(permissions.BasePermission):
    """خواندن برای همه کاربران وارد‌شده، نوشتن فقط برای مدیر."""

    message = 'برای تغییر این بخش دسترسی مدیر لازم است.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_manager


class CapabilityPermission(permissions.BasePermission):
    """دسترسی بر اساس نقشه‌ی قابلیت‌ها.

    ویو باید ویژگی `capability_prefix` را تعیین کند (مثل `cheques`). متد HTTP به
    قابلیت متناظر نگاشت می‌شود.
    """

    method_map = {
        'GET': 'view',
        'HEAD': 'view',
        'OPTIONS': 'view',
        'POST': 'add',
        'PUT': 'change',
        'PATCH': 'change',
        'DELETE': 'delete',
    }

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        prefix = getattr(view, 'capability_prefix', None)
        if not prefix:
            return True
        action = self.method_map.get(request.method, 'view')
        capability = f'{prefix}.{action}'
        allowed = has_capability(request.user, capability)
        if not allowed:
            self.message = (
                'شما دسترسی لازم برای این عملیات را ندارید. '
                f'(قابلیت مورد نیاز: {capability})'
            )
        return allowed
