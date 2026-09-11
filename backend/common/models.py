"""Shared model bases."""
import uuid

from django.db import models


class UUIDModel(models.Model):
    """
    UUID primary key.

    The frontend treats every `id` as an opaque string, and UUIDs keep session
    and response identifiers unguessable in URLs the examinee can see.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class BaseModel(UUIDModel, TimestampedModel):
    class Meta:
        abstract = True
