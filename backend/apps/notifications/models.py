"""
Site announcements.

Personal notifications were removed from the product (docs/08): only the public
site announcement remains. The `Notification` entity from docs/03 §8 is
therefore not implemented — see `documentation/11-backend-notes.md` (D-04).
"""
from django.db import models

from common.models import UUIDModel


class SiteAnnouncement(UUIDModel):
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    published_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "site_announcements"
        ordering = ["-created_at"]
        verbose_name = "اطلاعیه"
        verbose_name_plural = "اطلاعیه‌ها"

    def __str__(self) -> str:
        return self.title
