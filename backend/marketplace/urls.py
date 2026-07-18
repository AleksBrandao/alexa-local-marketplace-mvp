from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    MerchantLeadViewSet,
    MenuItemViewSet,
    OrderViewSet,
    RestaurantViewSet,
    discovery,
    health,
)

router = DefaultRouter()
router.register('restaurants', RestaurantViewSet)
router.register('menu-items', MenuItemViewSet)
router.register('merchant-leads', MerchantLeadViewSet)
router.register('orders', OrderViewSet)

urlpatterns = [
    path('health/', health),
    path('discovery/', discovery),
    path('', include(router.urls)),
]
