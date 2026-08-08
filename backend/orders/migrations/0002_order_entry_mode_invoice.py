from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='entry_mode',
            field=models.CharField(
                choices=[('manual', 'دستی'), ('automatic', 'اتوماتیک')],
                default='manual',
                max_length=15,
                verbose_name='روش ثبت',
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='invoice_image',
            field=models.ImageField(blank=True, null=True, upload_to='invoices/', verbose_name='تصویر فاکتور'),
        ),
        migrations.AddField(
            model_name='order',
            name='ocr_confidence',
            field=models.PositiveSmallIntegerField(default=0, verbose_name='درصد اطمینان OCR'),
        ),
        migrations.AddField(
            model_name='order',
            name='ocr_payload',
            field=models.JSONField(blank=True, default=dict, verbose_name='داده استخراج‌شده'),
        ),
        migrations.AddField(
            model_name='order',
            name='ocr_status',
            field=models.CharField(
                choices=[
                    ('pending', 'در انتظار'),
                    ('processing', 'در حال پردازش'),
                    ('done', 'انجام شده'),
                    ('review', 'نیاز به بررسی'),
                    ('failed', 'ناموفق'),
                ],
                default='pending',
                max_length=15,
                verbose_name='وضعیت استخراج',
            ),
        ),
    ]
