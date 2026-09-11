"""
Profile serializers.

Field names and nullability mirror `core/models/user.models.ts` one for one —
the frontend consumes these objects directly, so an added or renamed field is a
contract change, not an implementation detail.
"""
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.profiles.models import (
    PatientProfile,
    PsychologistAchievement,
    PsychologistProfile,
    VerificationDocument,
)


@extend_schema_field({"type": "string", "format": "uri", "nullable": True})
class FileUrlField(serializers.Field):
    """Serialises a FileField as an absolute URL, or null when unset."""

    def __init__(self, **kwargs):
        kwargs.setdefault("read_only", True)
        super().__init__(**kwargs)

    def to_representation(self, value):
        if not value:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(value.url) if request else value.url


class VerificationDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerificationDocument
        fields = ("id", "name", "uploaded_at")


class PatientProfileSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    avatar = FileUrlField()

    class Meta:
        model = PatientProfile
        fields = (
            "user_id",
            "first_name",
            "last_name",
            "birth_date",
            "gender",
            "avatar",
            "bio",
        )


class PsychologistProfileSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    avatar = FileUrlField()
    documents = VerificationDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = PsychologistProfile
        fields = (
            "user_id",
            "first_name",
            "last_name",
            "avatar",
            "bio",
            "specialty",
            "professional_code",
            "verification_status",
            "city",
            "years_of_experience",
            "documents",
        )


class PsychologistSummarySerializer(PsychologistProfileSerializer):
    """
    A psychologist as listed to a patient: the same profile plus the caller's
    own relationship with them (`relationship_id` / `relationship_status`),
    annotated by the selector.
    """

    relationship_id = serializers.SerializerMethodField()
    relationship_status = serializers.SerializerMethodField()

    class Meta(PsychologistProfileSerializer.Meta):
        fields = (*PsychologistProfileSerializer.Meta.fields, "relationship_id", "relationship_status")

    def get_relationship_id(self, obj) -> str | None:
        value = getattr(obj, "relationship_id", None)
        return str(value) if value else None

    def get_relationship_status(self, obj) -> str | None:
        return getattr(obj, "relationship_status", None)


class PsychologistAchievementSerializer(serializers.ModelSerializer):
    psychologist_id = serializers.UUIDField(source="psychologist.user_id", read_only=True)

    class Meta:
        model = PsychologistAchievement
        fields = ("id", "psychologist_id", "title", "issuer", "year", "description")
        extra_kwargs = {
            "title": {"error_messages": {"blank": "عنوان الزامی است.", "required": "عنوان الزامی است."}},
            "issuer": {"required": False},
            "year": {"required": False},
            "description": {"required": False},
        }

    def validate_year(self, value: int) -> int:
        if value and not (1300 <= value <= 2200):
            raise serializers.ValidationError("سال نامعتبر است.")
        return value

    def validate(self, attrs):
        # The client may omit the year; the mock falls back to the current one.
        if not attrs.get("year"):
            attrs["year"] = timezone.now().year
        return attrs


class ProfilePatchSerializer(serializers.Serializer):
    """
    `PATCH /users/me/` — the union of editable patient and psychologist fields
    plus `phone` on the user (`core/api/profile-api.service.ts`). Fields that do
    not belong to the caller's role are ignored, exactly as the mock does.
    """

    phone = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=32)
    first_name = serializers.CharField(required=False, max_length=80)
    last_name = serializers.CharField(required=False, max_length=80)
    bio = serializers.CharField(required=False, allow_blank=True)
    birth_date = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(required=False, allow_null=True)
    specialty = serializers.CharField(required=False, allow_blank=True, max_length=160)
    city = serializers.CharField(required=False, allow_blank=True, max_length=80)
    years_of_experience = serializers.IntegerField(required=False, min_value=0, max_value=80)
