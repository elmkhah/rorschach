"""Admin panel serializers — shapes from `core/models/admin.models.ts`."""
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer
from apps.media.models import MediaAsset
from apps.profiles.serializers import PatientProfileSerializer, PsychologistProfileSerializer


class AdminUserRowSerializer(serializers.Serializer):
    """
    One row of the admin user table: identity plus whichever profile exists.

    Takes a `User` instance directly so the list view stays a plain ListAPIView.
    The profiles are method fields because a missing reverse one-to-one raises
    rather than returning None.
    """

    user = UserSerializer(source="*")
    name = serializers.SerializerMethodField()
    patient_profile = serializers.SerializerMethodField()
    psychologist_profile = serializers.SerializerMethodField()

    def get_name(self, user) -> str:
        profile = _profile_of(user)
        return profile.full_name if profile else user.email

    @extend_schema_field(PatientProfileSerializer(allow_null=True))
    def get_patient_profile(self, user):
        profile = getattr(user, "patient_profile", None)
        return PatientProfileSerializer(profile, context=self.context).data if profile else None

    @extend_schema_field(PsychologistProfileSerializer(allow_null=True))
    def get_psychologist_profile(self, user):
        profile = getattr(user, "psychologist_profile", None)
        return PsychologistProfileSerializer(profile, context=self.context).data if profile else None


def _profile_of(user):
    return getattr(user, "patient_profile", None) or getattr(user, "psychologist_profile", None)


class AdminStatsSerializer(serializers.Serializer):
    users = serializers.IntegerField()
    patients = serializers.IntegerField()
    psychologists = serializers.IntegerField()
    pending_verifications = serializers.IntegerField()
    active_relationships = serializers.IntegerField()
    sessions_total = serializers.IntegerField()
    sessions_completed = serializers.IntegerField()


class VerifySerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["APPROVE", "REJECT", "SUSPEND"])
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=1000)


class AnnouncementInputSerializer(serializers.Serializer):
    title = serializers.CharField(
        max_length=200,
        error_messages={"blank": "عنوان الزامی است.", "required": "عنوان الزامی است."},
    )
    body = serializers.CharField(allow_blank=True, required=False, default="")
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    is_published = serializers.BooleanField(required=False, default=False)


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = ("id", "storage_key", "mime_type", "size", "checksum", "url", "created_at")

    def get_url(self, obj) -> str | None:
        url = obj.url
        if not url:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url
