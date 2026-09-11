import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

# The HTTP application must be built before importing anything that touches models.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from apps.messaging.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # Authentication happens over the socket itself (first frame), not in the
        # URL, so no auth middleware is wrapped around the router.
        "websocket": URLRouter(websocket_urlpatterns),
    }
)
