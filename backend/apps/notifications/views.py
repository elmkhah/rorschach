"""Public announcements feed — the only notification surface in the product."""
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import SiteAnnouncement


class SiteAnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteAnnouncement
        fields = ("id", "title", "body", "published_at", "expires_at", "is_published")


class AnnouncementListView(APIView):
    """Readable without authentication — the landing page shows it."""

    permission_classes = [AllowAny]

    @extend_schema(responses=SiteAnnouncementSerializer(many=True))
    def get(self, request):
        now = timezone.now()
        announcements = SiteAnnouncement.objects.filter(is_published=True).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        )
        return Response(SiteAnnouncementSerializer(announcements, many=True).data)
