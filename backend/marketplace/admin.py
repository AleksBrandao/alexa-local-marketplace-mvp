from django.contrib import admin
from .models import MerchantLead, MenuItem, Order, OrderItem, Restaurant

admin.site.register(Restaurant)
admin.site.register(MenuItem)
admin.site.register(MerchantLead)
admin.site.register(Order)
admin.site.register(OrderItem)
