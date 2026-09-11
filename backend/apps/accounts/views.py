"""
Auth endpoints (`/api/v1/auth/…`, `PATCH /api/v1/users/me/`).

Matches `core/auth/auth.service.ts`: login and register return
`{access, me}` and set the refresh cookie; refresh returns `{access}` only.
"""
from django.conf import settings
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import services
from apps.accounts.serializers import (
    AccessSerializer,
    AuthResponseSerializer,
    LoginSerializer,
    MeSerializer,
    RegisterSerializer,
)
from apps.profiles.serializers import ProfilePatchSerializer

PATIENT_FIELDS = {"first_name", "last_name", "bio", "birth_date", "gender"}
PSYCHOLOGIST_FIELDS = {"first_name", "last_name", "bio", "specialty", "city", "years_of_experience"}


def _me_response(request, user, access: str, refresh: str, code: int) -> Response:
    body = AuthResponseSerializer(
        {"access": access, "me": services.me_payload(user)},
        context={"request": request},
    ).data
    response = Response(body, status=code)
    return services.set_refresh_cookie(response, refresh)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"
    serializer_class = LoginSerializer

    @extend_schema(request=LoginSerializer, responses=AuthResponseSerializer)
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.login(**data.validated_data)
        access, refresh = services.issue_tokens(user)
        return _me_response(request, user, access, refresh, status.HTTP_200_OK)


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"
    serializer_class = RegisterSerializer

    @extend_schema(request=RegisterSerializer, responses=AuthResponseSerializer)
    def post(self, request):
        data = RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.register(data.validated_data)
        access, refresh = services.issue_tokens(user)
        return _me_response(request, user, access, refresh, status.HTTP_201_CREATED)


class RefreshView(APIView):
    """Single endpoint the Angular auth interceptor calls on every 401."""

    permission_classes = [AllowAny]
    throttle_scope = "auth"

    @extend_schema(request=None, responses=AccessSerializer)
    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        access, refresh, _user = services.rotate_refresh(raw)
        response = Response({"access": access})
        return services.set_refresh_cookie(response, refresh)


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses=None)
    def post(self, request):
        services.revoke_refresh(request.COOKIES.get(settings.REFRESH_COOKIE_NAME))
        return services.clear_refresh_cookie(Response({}))


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MeSerializer)
    def get(self, request):
        return Response(
            MeSerializer(services.me_payload(request.user), context={"request": request}).data
        )


class UpdateMeView(APIView):
    """
    `PATCH /users/me/` — updates `phone` on the user and the editable fields of
    whichever profile the caller has. Fields belonging to the other role are
    ignored rather than rejected.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "write"

    @extend_schema(request=ProfilePatchSerializer, responses=MeSerializer)
    @transaction.atomic
    def patch(self, request):
        payload = ProfilePatchSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        patch = payload.validated_data

        user = request.user
        if "phone" in patch:
            user.phone = patch["phone"] or None
            user.save(update_fields=["phone", "updated_at"])

        profile = getattr(user, "patient_profile", None) or getattr(user, "psychologist_profile", None)
        if profile is not None:
            editable = PATIENT_FIELDS if hasattr(user, "patient_profile") else PSYCHOLOGIST_FIELDS
            changed = [f for f in editable if f in patch]
            for field in changed:
                value = patch[field]
                setattr(profile, field, value if value is not None else _blank_for(profile, field))
            if changed:
                profile.save(update_fields=[*changed, "updated_at"])

        user.refresh_from_db()
        return Response(
            MeSerializer(services.me_payload(user), context={"request": request}).data
        )


def _blank_for(profile, field: str):
    """Nullable fields accept null; text fields fall back to an empty string."""
    model_field = profile._meta.get_field(field)
    return None if model_field.null else ""
