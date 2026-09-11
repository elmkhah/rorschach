"""
WebSocket fan-out and presence.

Each user has one channel group (`user.<id>`); REST handlers push events into it
and the consumer relays them to whichever tabs that user has open. Event shapes
come from `RealtimeEvent` in `core/models/communication.models.ts`:

    message.new · typing · message.read · presence
"""
from __future__ import annotations

from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.cache import cache

PRESENCE_TTL_SECONDS = 60
PRESENCE_KEY = "presence:{user_id}"


def group_for(user_id) -> str:
    return f"user.{user_id}"


def send_to_user(user_id, event: dict[str, Any]) -> None:
    """Best effort: a realtime hiccup must never fail the REST request."""
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(group_for(user_id), {"type": "relay", "event": event})
    except Exception:  # pragma: no cover - transport failure
        pass


# ---- presence ---------------------------------------------------------------


def mark_online(user_id) -> None:
    cache.set(PRESENCE_KEY.format(user_id=user_id), True, PRESENCE_TTL_SECONDS)


def touch(user_id) -> None:
    mark_online(user_id)


def mark_offline(user_id) -> None:
    cache.delete(PRESENCE_KEY.format(user_id=user_id))


def is_online(user_id) -> bool:
    return bool(cache.get(PRESENCE_KEY.format(user_id=user_id)))


def broadcast_presence(user_id, online: bool, peer_ids: list) -> None:
    for peer_id in peer_ids:
        send_to_user(peer_id, {"type": "presence", "user_id": str(user_id), "is_online": online})
