"""
Media metadata (BR-15, docs/07 §9).

Rorschach card images, avatars and attachments are stored in object storage
(`tests/rorschach/v1/card-01.jpg`, `avatars/`, `attachments/`); the database only
keeps the pointer and the checksum.
"""
import hashlib

from django.db import models

from common.models import UUIDModel


class MediaAsset(UUIDModel):
    storage_key = models.CharField(max_length=512, unique=True)
    file = models.FileField(upload_to="assets/", null=True, blank=True)
    mime_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField(default=0)
    checksum = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "media_assets"
        ordering = ["storage_key"]
        verbose_name = "فایل رسانه"
        verbose_name_plural = "فایل‌های رسانه"

    def __str__(self) -> str:
        return self.storage_key

    @property
    def url(self) -> str | None:
        if self.file:
            return self.file.url
        return None


def sha256_of(file_obj) -> str:
    digest = hashlib.sha256()
    for chunk in file_obj.chunks():
        digest.update(chunk)
    file_obj.seek(0)
    return digest.hexdigest()
