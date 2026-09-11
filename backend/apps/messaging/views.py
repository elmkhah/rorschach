"""
Chat REST API. Realtime events (new message, typing, read receipt, presence)
travel over the WebSocket in `consumers.py` — REST writes, the socket notifies.
"""
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.messaging.models import Conversation, Message
from apps.messaging.realtime import send_to_user
from apps.messaging.selectors import conversations_of, peer_of
from apps.messaging.serializers import (
    ConversationSerializer,
    MessageSerializer,
    SendMessageSerializer,
    conversation_payload,
)
from common.exceptions import ApiError


def _participant_conversation(request, pk) -> Conversation:
    conversation = (
        Conversation.objects.filter(pk=pk)
        .prefetch_related(
            "messages",
            "participants__user__patient_profile",
            "participants__user__psychologist_profile",
        )
        .first()
    )
    if conversation is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "گفت‌وگو یافت نشد.")
    if not conversation.participants.filter(user_id=request.user.id).exists():
        raise ApiError(status.HTTP_403_FORBIDDEN, "به این گفت‌وگو دسترسی ندارید.")
    return conversation


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationSerializer(many=True))
    def get(self, request):
        payloads = [
            conversation_payload(c, request.user, request) for c in conversations_of(request.user)
        ]
        return Response(ConversationSerializer(payloads, many=True).data)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationSerializer)
    def get(self, request, pk):
        conversation = _participant_conversation(request, pk)
        return Response(
            ConversationSerializer(conversation_payload(conversation, request.user, request)).data
        )


class MessageListView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "write"

    @extend_schema(responses=MessageSerializer(many=True))
    def get(self, request, pk):
        conversation = _participant_conversation(request, pk)
        return Response(MessageSerializer(conversation.messages.all(), many=True).data)

    @extend_schema(request=SendMessageSerializer, responses=MessageSerializer)
    def post(self, request, pk):
        conversation = _participant_conversation(request, pk)
        payload = SendMessageSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            content=payload.validated_data["content"],
        )
        Conversation.objects.filter(pk=conversation.pk).update(updated_at=message.created_at)

        peer = peer_of(conversation, request.user.id)
        send_to_user(peer.id, {"type": "message.new", "message": MessageSerializer(message).data})
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=None)
    def post(self, request, pk):
        conversation = _participant_conversation(request, pk)
        read_at = timezone.now()
        updated = Message.objects.filter(
            conversation=conversation, read_at__isnull=True
        ).exclude(sender_id=request.user.id).update(read_at=read_at)

        if updated:
            peer = peer_of(conversation, request.user.id)
            send_to_user(
                peer.id,
                {
                    "type": "message.read",
                    "conversation_id": str(conversation.id),
                    "user_id": str(request.user.id),
                    "read_at": read_at.isoformat(),
                },
            )
        return Response({})
