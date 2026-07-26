from django.db import models


class BaseModel(models.Model):
    """مدل پایه با تاریخ ایجاد و آخرین ویرایش."""

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='تاریخ ایجاد')
    modified_at = models.DateTimeField(auto_now=True, verbose_name='تاریخ ویرایش')

    class Meta:
        abstract = True
