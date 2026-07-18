from decimal import Decimal
from django.db import transaction
from rest_framework import serializers
from .models import MerchantLead, MenuItem, Order, OrderItem, Restaurant


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ['id', 'restaurant', 'name', 'description', 'price', 'active']


class RestaurantSerializer(serializers.ModelSerializer):
    menu_items = MenuItemSerializer(many=True, read_only=True)
    recommendation_count = serializers.SerializerMethodField()

    class Meta:
        model = Restaurant
        fields = [
            'id', 'name', 'category', 'city', 'neighborhood', 'address', 'phone',
            'registered', 'active', 'distance_km', 'notes', 'recommendation_count',
            'menu_items',
        ]

    def get_recommendation_count(self, obj):
        lead = getattr(obj, 'merchant_lead', None)
        return lead.recommendation_count if lead else 0


class MerchantLeadSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)

    class Meta:
        model = MerchantLead
        fields = [
            'id', 'restaurant', 'restaurant_name', 'source', 'recommendation_count',
            'status', 'first_seen_at', 'last_seen_at',
        ]


class OrderItemReadSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'menu_item', 'item_name', 'quantity', 'unit_price', 'subtotal']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemReadSerializer(many=True, read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.name', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'reference', 'restaurant', 'restaurant_name', 'customer_name',
            'customer_phone', 'delivery_address', 'total', 'status', 'source',
            'created_at', 'updated_at', 'items',
        ]
        read_only_fields = ['reference', 'total', 'created_at', 'updated_at']


class OrderItemInputSerializer(serializers.Serializer):
    menu_item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=20, default=1)


class OrderCreateSerializer(serializers.Serializer):
    restaurant_id = serializers.IntegerField()
    customer_name = serializers.CharField(max_length=120, default='Cliente de teste')
    customer_phone = serializers.CharField(max_length=30, allow_blank=True, required=False)
    delivery_address = serializers.CharField(max_length=255, allow_blank=True, required=False)
    source = serializers.CharField(max_length=40, default='alexa')
    items = OrderItemInputSerializer(many=True)

    def validate(self, attrs):
        try:
            restaurant = Restaurant.objects.get(pk=attrs['restaurant_id'], active=True)
        except Restaurant.DoesNotExist as exc:
            raise serializers.ValidationError('Estabelecimento não encontrado.') from exc
        if not restaurant.registered:
            raise serializers.ValidationError('O estabelecimento ainda não recebe pedidos pela plataforma.')

        menu_ids = [item['menu_item_id'] for item in attrs['items']]
        menu_items = MenuItem.objects.filter(
            id__in=menu_ids,
            restaurant=restaurant,
            active=True,
        )
        if menu_items.count() != len(set(menu_ids)):
            raise serializers.ValidationError('Há item inválido ou indisponível no pedido.')

        attrs['restaurant'] = restaurant
        attrs['menu_items_by_id'] = {item.id: item for item in menu_items}
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items')
        restaurant = validated_data.pop('restaurant')
        menu_items_by_id = validated_data.pop('menu_items_by_id')
        validated_data.pop('restaurant_id', None)

        order = Order.objects.create(restaurant=restaurant, **validated_data)
        total = Decimal('0.00')
        for item_data in items_data:
            menu_item = menu_items_by_id[item_data['menu_item_id']]
            quantity = item_data['quantity']
            OrderItem.objects.create(
                order=order,
                menu_item=menu_item,
                item_name=menu_item.name,
                quantity=quantity,
                unit_price=menu_item.price,
            )
            total += menu_item.price * quantity

        order.total = total
        order.save(update_fields=['total', 'updated_at'])
        return order
