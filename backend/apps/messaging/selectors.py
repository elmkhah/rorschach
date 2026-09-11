"""Read-side queries for conversations."""
from __future__ import annotations

from django.db.models import QuerySet

from apps.messaging.models import Conversation


def conversations_of(user) -> QuerySet[Conversation]:
    return (
        Conversation.objects.filter(participants__user_id=user.id)
        .prefetch_related(
            "messages",
            "participants__user__patient_profile",
            "participants__user__psychologist_profile",
        )
        .order_by("-updated_at")
        .distinct()
    )


def peer_of(conversation: Conversation, user_id):
    """The other participant. Conversations are always one-to-one here."""
    for participant in conversation.participants.all():
        if participant.user_id != user_id:
            return participant.user
    raise LookupError("conversation has no peer")


def peer_ids_of(user_id) -> list:
    from apps.messaging.models import ConversationParticipant

    conversation_ids = ConversationParticipant.objects.filter(user_id=user_id).values(
        "conversation_id"
    )
    return list(
        ConversationParticipant.objects.filter(conversation_id__in=conversation_ids)
        .exclude(user_id=user_id)
        .values_list("user_id", flat=True)
        .distinct()
    )
