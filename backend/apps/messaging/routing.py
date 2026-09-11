from django.urls import path

from apps.messaging.consumers import RealtimeConsumer

# The frontend connects to `${wsBaseUrl}/` — environment.wsBaseUrl is `/ws`.
websocket_urlpatterns = [
    path("ws/", RealtimeConsumer.as_asgi()),
]
