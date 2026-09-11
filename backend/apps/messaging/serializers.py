"""Chat serializers — shapes from `core/models/communication.models.ts`."""
from rest_framework import serializers

from apps.messaging.models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    conversation_id = serializers.UUIDField(read_only=True)
    sender_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Message
        fields = (
            "id",
            "conversation_id",
            "sender_id",
            "message_type",
            "content",
            "created_at",
            "read_at",
        )


class ConversationPeerSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    name = serializers.CharField()
    avatar = serializers.CharField(allow_null=True)
    role = serializers.CharField()
    is_online = serializers.BooleanField()


class ConversationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    peer = ConversationPeerSerializer()
    last_message = MessageSerializer(allow_null=True)
    unread_count = serializers.IntegerField()


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(
        max_length=4000,
        error_messages={"blank": "متن پیام خالی است.", "required": "متن پیام خالی است."},
    )

    def validate_content(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("متن پیام خالی است.")
        return text


def conversation_payload(conversation: Conversation, user, request=None) -> dict:
    """Builds the caller's view of a conversation (peer, last message, unread)."""
    from apps.messaging.realtime import is_online
    from apps.messaging.selectors import peer_of

    peer = peer_of(conversation, user.id)
    messages = list(conversation.messages.all())
    avatar = None
    profile = getattr(peer, "patient_profile", None) or getattr(peer, "psychologist_profile", None)
    if profile is not None and profile.avatar:
        avatar = request.build_absolute_uri(profile.avatar.url) if request else profile.avatar.url
    return {
        "id": conversation.id,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "peer": {
            "user_id": peer.id,
            "name": profile.full_name if profile else peer.email,
            "avatar": avatar,
            "role": peer.role,
            "is_online": is_online(peer.id),
        },
        "last_message": messages[-1] if messages else None,
        "unread_count": sum(1 for m in messages if m.sender_id != user.id and m.read_at is None),
    }
