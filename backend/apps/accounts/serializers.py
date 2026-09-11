"""Identity serializers — shapes defined by `core/models/user.models.ts`."""
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.constants import Role
from apps.accounts.models import User
from apps.profiles.serializers import PatientProfileSerializer, PsychologistProfileSerializer

MIN_PASSWORD_LENGTH = 8


class UserSerializer(serializers.ModelSerializer):
    last_login_at = serializers.DateTimeField(source="last_login", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "phone",
            "role",
            "is_active",
            "is_verified",
            "created_at",
            "last_login_at",
        )
        read_only_fields = fields


class MeSerializer(serializers.Serializer):
    """`GET /auth/me/` — identity plus whichever profile the role has."""

    user = UserSerializer(read_only=True)
    patient_profile = PatientProfileSerializer(read_only=True, allow_null=True)
    psychologist_profile = PsychologistProfileSerializer(read_only=True, allow_null=True)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class RegisterSerializer(serializers.Serializer):
    """Only PATIENT and PSYCHOLOGIST can self-register; ADMIN is created out of band."""

    role = serializers.ChoiceField(choices=[Role.PATIENT, Role.PSYCHOLOGIST])
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)
    phone = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=32)
    first_name = serializers.CharField(max_length=80)
    last_name = serializers.CharField(max_length=80)
    specialty = serializers.CharField(required=False, allow_blank=True, max_length=160)
    professional_code = serializers.CharField(required=False, allow_blank=True, max_length=64)

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("این ایمیل قبلاً ثبت شده است.")
        return email

    def validate_password(self, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise serializers.ValidationError("رمز عبور باید حداقل ۸ کاراکتر باشد.")
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class AuthResponseSerializer(serializers.Serializer):
    """
    The access token travels in the body and lives in memory only; the refresh
    token is set as an HttpOnly cookie and never appears here (docs/04 §2).
    """

    access = serializers.CharField()
    me = MeSerializer()


class AccessSerializer(serializers.Serializer):
    access = serializers.CharField()
