from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import (
    action,
    api_view,
    permission_classes,
)
from rest_framework.permissions import (
    AllowAny,
    IsAuthenticated,
)
from rest_framework.response import Response
from .models import MerchantLead, MenuItem, Order, Restaurant
from .serializers import (
    MerchantLeadSerializer,
    MenuItemSerializer,
    OrderCreateSerializer,
    OrderSerializer,
    RestaurantSerializer,
)
from .services.order_parser import parse_order_text


class RestaurantViewSet(viewsets.ModelViewSet):
    queryset = Restaurant.objects.prefetch_related(
        'menu_items'
    ).all()
    serializer_class = RestaurantSerializer

    def get_permissions(self):
        if self.action == 'recommend':
            return [AllowAny()]

        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()

        if self.action == 'recommend':
            return queryset.filter(active=True)

        if not self.request.user.is_authenticated:
            return queryset.none()

        queryset = queryset.filter(
            owner=self.request.user
        )

        registered = self.request.query_params.get(
            'registered'
        )

        if registered in {'true', 'false'}:
            queryset = queryset.filter(
                registered=registered == 'true'
            )

        return queryset

    def perform_create(self, serializer):
        serializer.save(
            owner=self.request.user,
            registered=True,
        )

    @action(detail=True, methods=['post'])
    def recommend(self, request, pk=None):
        restaurant = self.get_object()

        lead, _ = MerchantLead.objects.get_or_create(
            restaurant=restaurant
        )

        lead.recommendation_count += 1
        lead.source = request.data.get(
            'source',
            'alexa',
        )
        lead.save()

        return Response(
            MerchantLeadSerializer(lead).data
        )


class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.select_related(
        'restaurant'
    ).all()
    serializer_class = MenuItemSerializer

    def get_permissions(self):
        if self.action in {'list', 'retrieve'}:
            return [AllowAny()]

        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()

        if self.request.user.is_authenticated:
            queryset = queryset.filter(
                restaurant__owner=self.request.user
            )
        else:
            queryset = queryset.filter(
                active=True,
                restaurant__active=True,
                restaurant__registered=True,
            )

        restaurant_id = self.request.query_params.get(
            'restaurant'
        )

        if restaurant_id:
            queryset = queryset.filter(
                restaurant_id=restaurant_id
            )

        return queryset


class MerchantLeadViewSet(viewsets.ModelViewSet):
    queryset = MerchantLead.objects.select_related(
        'restaurant'
    ).all()
    serializer_class = MerchantLeadSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()

        if self.request.user.is_staff:
            return queryset

        return queryset.none()


class OrderViewSet(viewsets.ModelViewSet):
    queryset = (
        Order.objects
        .select_related('restaurant')
        .prefetch_related('items')
        .all()
    )
    serializer_class = OrderSerializer
    
    def get_permissions(self):
        if self.action in {
            'create',
            'parse_order',
        }:
            return [AllowAny()]

        return [IsAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()

        if not self.request.user.is_authenticated:
            return queryset.none()

        queryset = queryset.filter(
            restaurant__owner=self.request.user
        )

        restaurant_id = self.request.query_params.get(
            'restaurant'
        )
        status_value = self.request.query_params.get(
            'status'
        )

        if restaurant_id:
            queryset = queryset.filter(
                restaurant_id=restaurant_id
            )

        if status_value:
            queryset = queryset.filter(
                status=status_value
            )

        return queryset

    @action(
        detail=False,
        methods=['post'],
        url_path='parse',
    )
    def parse_order(self, request):
        text = str(
            request.data.get('text', '')
        ).strip()

        restaurant_id = request.data.get(
            'restaurant_id'
        )

        if not text:
            return Response(
                {
                    'detail':
                        'O texto do pedido é obrigatório.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = parse_order_text(
            text=text,
            restaurant_id=restaurant_id,
        )

        return Response(result)

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        order = serializer.save()

        return Response(
            OrderSerializer(order).data,
            status=status.HTTP_201_CREATED,
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def discovery(request):
    category = request.query_params.get(
        'category',
        'pizzaria',
    )
    city = request.query_params.get(
        'city',
        'Jundiaí',
    )
    term = request.query_params.get(
        'q',
        '',
    )

    queryset = (
        Restaurant.objects
        .prefetch_related('menu_items')
        .filter(
            category__iexact=category,
            active=True,
        )
        .filter(
            Q(city__iexact=city)
            | Q(city__icontains=city)
        )
    )

    if term:
        queryset = queryset.filter(
            Q(name__icontains=term)
            | Q(neighborhood__icontains=term)
        )

    return Response(
        RestaurantSerializer(
            queryset[:5],
            many=True,
        ).data
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({
        'status': 'ok',
        'service': 'alexa-local-marketplace',
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    restaurants = Restaurant.objects.filter(
        owner=request.user
    ).values(
        'id',
        'name',
        'registered',
        'active',
    )

    return Response({
        'id': request.user.id,
        'username': request.user.username,
        'email': request.user.email,
        'is_staff': request.user.is_staff,
        'is_superuser': request.user.is_superuser,
        'restaurants': list(restaurants),
    })