# Generated manually for the MVP scaffold.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Restaurant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160)),
                ('category', models.CharField(default='pizzaria', max_length=80)),
                ('city', models.CharField(default='Jundiaí', max_length=100)),
                ('neighborhood', models.CharField(blank=True, max_length=100)),
                ('address', models.CharField(max_length=255)),
                ('phone', models.CharField(blank=True, max_length=30)),
                ('registered', models.BooleanField(default=False)),
                ('active', models.BooleanField(default=True)),
                ('distance_km', models.DecimalField(decimal_places=2, default=1, max_digits=5)),
                ('notes', models.CharField(blank=True, max_length=255)),
            ],
            options={'ordering': ['distance_km', 'name']},
        ),
        migrations.CreateModel(
            name='MenuItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160)),
                ('description', models.CharField(blank=True, max_length=255)),
                ('price', models.DecimalField(decimal_places=2, max_digits=10)),
                ('active', models.BooleanField(default=True)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='menu_items', to='marketplace.restaurant')),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='MerchantLead',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(default='alexa', max_length=40)),
                ('recommendation_count', models.PositiveIntegerField(default=0)),
                ('status', models.CharField(choices=[('new', 'Novo'), ('contacted', 'Contatado'), ('claimed', 'Reivindicado'), ('declined', 'Recusado')], default='new', max_length=20)),
                ('first_seen_at', models.DateTimeField(auto_now_add=True)),
                ('last_seen_at', models.DateTimeField(auto_now=True)),
                ('restaurant', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='merchant_lead', to='marketplace.restaurant')),
            ],
        ),
        migrations.CreateModel(
            name='Order',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(editable=False, max_length=20, unique=True)),
                ('customer_name', models.CharField(default='Cliente de teste', max_length=120)),
                ('customer_phone', models.CharField(blank=True, max_length=30)),
                ('delivery_address', models.CharField(blank=True, max_length=255)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('status', models.CharField(choices=[('new', 'Novo'), ('accepted', 'Aceito'), ('preparing', 'Em preparo'), ('ready', 'Pronto'), ('completed', 'Concluído'), ('cancelled', 'Cancelado')], default='new', max_length=20)),
                ('source', models.CharField(default='alexa', max_length=40)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('restaurant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='orders', to='marketplace.restaurant')),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='OrderItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('item_name', models.CharField(max_length=160)),
                ('quantity', models.PositiveIntegerField(default=1)),
                ('unit_price', models.DecimalField(decimal_places=2, max_digits=10)),
                ('menu_item', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='marketplace.menuitem')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='marketplace.order')),
            ],
        ),
    ]
