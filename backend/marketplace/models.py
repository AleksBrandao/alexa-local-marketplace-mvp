import uuid
from django.conf import settings
from django.db import models



class Restaurant(models.Model):
    
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='restaurants',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=160)
    category = models.CharField(
        max_length=80,
        default='pizzaria',
    )
    category = models.CharField(max_length=80, default='pizzaria')
    city = models.CharField(max_length=100, default='Jundiaí')
    neighborhood = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=255)
    phone = models.CharField(max_length=30, blank=True)
    registered = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    distance_km = models.DecimalField(max_digits=5, decimal_places=2, default=1)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['distance_km', 'name']

    def __str__(self):
        return self.name


class MenuItem(models.Model):
    restaurant = models.ForeignKey(Restaurant, related_name='menu_items', on_delete=models.CASCADE)
    name = models.CharField(max_length=160)
    description = models.CharField(max_length=255, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.restaurant.name} - {self.name}'


class MerchantLead(models.Model):
    STATUS_CHOICES = [
        ('new', 'Novo'),
        ('contacted', 'Contatado'),
        ('claimed', 'Reivindicado'),
        ('declined', 'Recusado'),
    ]

    restaurant = models.OneToOneField(Restaurant, related_name='merchant_lead', on_delete=models.CASCADE)
    source = models.CharField(max_length=40, default='alexa')
    recommendation_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.restaurant.name} ({self.recommendation_count})'


class Order(models.Model):
    STATUS_CHOICES = [
        ('new', 'Novo'),
        ('accepted', 'Aceito'),
        ('preparing', 'Em preparo'),
        ('ready', 'Pronto'),
        ('completed', 'Concluído'),
        ('cancelled', 'Cancelado'),
    ]

    reference = models.CharField(max_length=20, unique=True, editable=False)
    restaurant = models.ForeignKey(Restaurant, related_name='orders', on_delete=models.PROTECT)
    customer_name = models.CharField(max_length=120, default='Cliente de teste')
    customer_phone = models.CharField(max_length=30, blank=True)
    delivery_address = models.CharField(max_length=255, blank=True)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    source = models.CharField(max_length=40, default='alexa')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f'PED-{uuid.uuid4().hex[:8].upper()}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    menu_item = models.ForeignKey(MenuItem, null=True, blank=True, on_delete=models.SET_NULL)
    item_name = models.CharField(max_length=160)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    @property
    def subtotal(self):
        return self.quantity * self.unit_price
