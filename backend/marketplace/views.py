from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from .models import MerchantLead, MenuItem, Order, Restaurant
from .serializers import (
    MerchantLeadSerializer,
    MenuItemSerializer,
    OrderCreateSerializer,
    OrderSerializer,
    RestaurantSerializer,
)


class RestaurantViewSet(viewsets.ModelViewSet):
    queryset = Restaurant.objects.prefetch_related('menu_items').all()
    serializer_class = RestaurantSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        registered = self.request.query_params.get('registered')
        if registered in {'true', 'false'}:
            queryset = queryset.filter(registered=registered == 'true')
        return queryset

    @action(detail=True, methods=['post'])
    def recommend(self, request, pk=None):
        restaurant = self.get_object()
        lead, _ = MerchantLead.objects.get_or_create(restaurant=restaurant)
        lead.recommendation_count += 1
        lead.source = request.data.get('source', 'alexa')
        lead.save()
        return Response(MerchantLeadSerializer(lead).data)


class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.select_related('restaurant').all()
    serializer_class = MenuItemSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        restaurant_id = self.request.query_params.get('restaurant')
        if restaurant_id:
            queryset = queryset.filter(restaurant_id=restaurant_id)
        return queryset


class MerchantLeadViewSet(viewsets.ModelViewSet):
    queryset = MerchantLead.objects.select_related('restaurant').all()
    serializer_class = MerchantLeadSerializer


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.select_related('restaurant').prefetch_related('items').all()
    serializer_class = OrderSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        restaurant_id = self.request.query_params.get('restaurant')
        status_value = self.request.query_params.get('status')
        if restaurant_id:
            queryset = queryset.filter(restaurant_id=restaurant_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def discovery(request):
    category = request.query_params.get('category', 'pizzaria')
    city = request.query_params.get('city', 'Jundiaí')
    term = request.query_params.get('q', '')

    queryset = Restaurant.objects.prefetch_related('menu_items').filter(
        category__iexact=category,
        active=True,
    ).filter(Q(city__iexact=city) | Q(city__icontains=city))

    if term:
        queryset = queryset.filter(Q(name__icontains=term) | Q(neighborhood__icontains=term))

    return Response(RestaurantSerializer(queryset[:5], many=True).data)


@api_view(['GET'])
def health(request):
    return Response({'status': 'ok', 'service': 'alexa-local-marketplace'})
