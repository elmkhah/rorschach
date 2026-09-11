"""
Conversations and messages (docs/03 §8).

BR-16: messages are rows, never an array inside the conversation document.
"""
from django.conf import settings
from django.db import models

from common.models import UUIDModel


class MessageType(models.TextChoices):
    TEXT = "TEXT", "متن"
    SYSTEM = "SYSTEM", "سیستمی"


class Conversation(UUIDModel):
    created_at = models.DateTimeField(auto_now_add=True)
    # Bumped on every message so the list can be ordered by recency.
    updated_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "conversations"
        ordering = ["-updated_at"]
        verbose_name = "گفت‌وگو"
        verbose_name_plural = "گفت‌وگوها"

    def __str__(self) -> str:
        return str(self.id)


class ConversationParticipant(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversations"
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "conversation_participants"
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"], name="unique_conversation_participant"
            )
        ]

    def __str__(self) -> str:
        return f"{self.conversation_id}:{self.user_id}"


class Message(UUIDModel):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages", db_index=True
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_messages"
    )
    message_type = models.CharField(
        max_length=16, choices=MessageType.choices, default=MessageType.TEXT
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "messages"
        ordering = ["created_at"]
        verbose_name = "پیام"
        verbose_name_plural = "پیام‌ها"
        indexes = [models.Index(fields=["conversation", "created_at"])]

    def __str__(self) -> str:
        return f"{self.sender_id}: {self.content[:40]}"
