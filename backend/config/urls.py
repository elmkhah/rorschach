"""
Root URL configuration.

Every API route lives under /api/v1/ (docs/04 §1). The path layout mirrors the
frontend contract exactly, so the Angular app can flip `useMock` to false
without touching a single URL.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from common.health import health

api_v1 = [
    path("", include("apps.accounts.urls")),
    path("", include("apps.profiles.urls")),
    path("", include("apps.relationships.urls")),
    path("", include("apps.catalog.urls")),
    path("", include("apps.assessments.urls")),
    path("", include("apps.messaging.urls")),
    path("", include("apps.notifications.urls")),
    path("admin/", include("apps.administration.urls")),
]

urlpatterns = [
    # Infrastructure probe, outside the versioned API on purpose.
    path("health/", health, name="health"),
    path("django-admin/", admin.site.urls),
    path("api/v1/", include((api_v1, "v1"))),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
