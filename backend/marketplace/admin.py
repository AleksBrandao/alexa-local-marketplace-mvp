from django.contrib import admin

from .models import (
    MerchantLead,
    MenuItem,
    Order,
    OrderItem,
    Restaurant,
)


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'name',
        'owner',
        'registered',
        'active',
        'city',
    )
    list_filter = (
        'registered',
        'active',
        'city',
        'category',
    )
    search_fields = (
        'name',
        'owner__username',
        'owner__email',
    )


admin.site.register(MenuItem)
admin.site.register(MerchantLead)
admin.site.register(Order)
admin.site.register(OrderItem)