from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("admin/", admin.site.urls),

    path(
        "api/auth/login/",
        TokenObtainPairView.as_view(),
        name="auth-login",
    ),
    path(
        "api/auth/refresh/",
        TokenRefreshView.as_view(),
        name="auth-refresh",
    ),
    path(
        "api/auth/logout/",
        TokenBlacklistView.as_view(),
        name="auth-logout",
    ),

    path("api/", include("marketplace.urls")),
]