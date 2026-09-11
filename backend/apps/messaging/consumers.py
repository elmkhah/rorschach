"""
The single realtime channel (`/ws/`).

Authentication happens over the socket: the client sends `{type:"auth", token}`
as its first frame (`core/services/realtime.service.ts`) rather than putting the
access token in the URL, where it would end up in proxy and server logs.
Anything sent before a successful auth is ignored and the socket is closed.
"""
from __future__ import annotations

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from apps.messaging.realtime import broadcast_presence, group_for, mark_offline, mark_online, touch

logger = logging.getLogger("rorschach.app")

AUTH_TIMEOUT_CLOSE_CODE = 4001


class RealtimeConsumer(AsyncWebsocketConsumer):
    user_id: str | None = None
    peer_ids: list = []

    async def connect(self):
        # Accept first, authenticate on the first frame.
        await self.accept()

    async def disconnect(self, code):
        if self.user_id:
            await self.channel_layer.group_discard(group_for(self.user_id), self.channel_name)
            await database_sync_to_async(mark_offline)(self.user_id)
            await database_sync_to_async(broadcast_presence)(self.user_id, False, self.peer_ids)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            frame = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            return
        kind = frame.get("type")

        if kind == "auth":
            await self._authenticate(frame.get("token"))
            return
        if not self.user_id:
            await self.close(code=AUTH_TIMEOUT_CLOSE_CODE)
            return

        await database_sync_to_async(touch)(self.user_id)
        if kind == "typing":
            await self._relay_typing(frame.get("conversation_id"))

    async def relay(self, message):
        """Channel-layer handler: forwards a server-side event to this socket."""
        await self.send(text_data=json.dumps(message["event"]))

    # ---- internals ----------------------------------------------------------

    async def _authenticate(self, raw_token: str | None):
        if not raw_token:
            await self.close(code=AUTH_TIMEOUT_CLOSE_CODE)
            return
        try:
            token = AccessToken(raw_token)
            user_id = str(token["user_id"])
        except (TokenError, KeyError):
            await self.close(code=AUTH_TIMEOUT_CLOSE_CODE)
            return

        self.user_id = user_id
        self.peer_ids = await database_sync_to_async(_peer_ids)(user_id)
        await self.channel_layer.group_add(group_for(user_id), self.channel_name)
        await database_sync_to_async(mark_online)(user_id)
        await database_sync_to_async(broadcast_presence)(user_id, True, self.peer_ids)

    async def _relay_typing(self, conversation_id):
        if not conversation_id:
            return
        peer_id = await database_sync_to_async(_typing_peer)(conversation_id, self.user_id)
        if peer_id is None:
            return
        await self.channel_layer.group_send(
            group_for(peer_id),
            {
                "type": "relay",
                "event": {
                    "type": "typing",
                    "conversation_id": str(conversation_id),
                    "user_id": str(self.user_id),
                },
            },
        )


def _peer_ids(user_id):
    from apps.messaging.selectors import peer_ids_of

    return peer_ids_of(user_id)


def _typing_peer(conversation_id, user_id):
    from apps.messaging.models import ConversationParticipant

    if not ConversationParticipant.objects.filter(
        conversation_id=conversation_id, user_id=user_id
    ).exists():
        return None
    return (
        ConversationParticipant.objects.filter(conversation_id=conversation_id)
        .exclude(user_id=user_id)
        .values_list("user_id", flat=True)
        .first()
    )
