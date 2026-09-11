"""
Authentication services.

Views stay thin: they validate input, call a service and shape the response
(docs/06 §2). Everything that changes identity state lives here.
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.constants import Role, VerificationStatus
from apps.accounts.models import User
from apps.profiles.models import PatientProfile, PsychologistProfile
from common.exceptions import ApiError

security_logger = logging.getLogger("rorschach.security")


def me_payload(user: User) -> dict[str, Any]:
    """The `Me` object every auth endpoint returns."""
    return {
        "user": user,
        "patient_profile": getattr(user, "patient_profile", None),
        "psychologist_profile": getattr(user, "psychologist_profile", None),
    }


def issue_tokens(user: User) -> tuple[str, str]:
    """Returns (access, refresh) and stamps the login time."""
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return str(refresh.access_token), str(refresh)


@transaction.atomic
def register(data: dict[str, Any]) -> User:
    role = data["role"]
    user = User.objects.create_user(
        email=data["email"],
        password=data["password"],
        role=role,
        phone=(data.get("phone") or None),
    )
    if role == Role.PATIENT:
        PatientProfile.objects.create(
            user=user,
            first_name=data["first_name"],
            last_name=data["last_name"],
        )
    else:
        PsychologistProfile.objects.create(
            user=user,
            first_name=data["first_name"],
            last_name=data["last_name"],
            specialty=data.get("specialty") or "",
            professional_code=data.get("professional_code") or "",
            # BR-01: a psychologist starts unverified and cannot self-approve.
            verification_status=VerificationStatus.REGISTERED,
        )
    return user


def login(email: str, password: str) -> User:
    user = authenticate(username=email.strip().lower(), password=password)
    if user is None:
        # `authenticate` also returns None for an inactive account; tell the two
        # apart so the client can show the right message.
        existing = User.objects.filter(email__iexact=email.strip()).first()
        if existing and not existing.is_active and existing.check_password(password):
            raise ApiError(status.HTTP_403_FORBIDDEN, "حساب کاربری شما غیرفعال شده است.")
        security_logger.warning("Failed login attempt for %s", email)
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "ایمیل یا رمز عبور اشتباه است.")
    if not user.is_active:
        raise ApiError(status.HTTP_403_FORBIDDEN, "حساب کاربری شما غیرفعال شده است.")
    return user


def rotate_refresh(raw_refresh: str | None) -> tuple[str, str, User]:
    """
    Exchanges the refresh cookie for a new access token, rotating the refresh
    token and blacklisting the old one.
    """
    if not raw_refresh:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "نشست منقضی شده است.")
    try:
        token = RefreshToken(raw_refresh)
        user_id = token["user_id"]
        token.blacklist()
    except TokenError as exc:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "نشست منقضی شده است.") from exc

    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "نشست منقضی شده است.")

    new_refresh = RefreshToken.for_user(user)
    new_refresh["role"] = user.role
    return str(new_refresh.access_token), str(new_refresh), user


def revoke_refresh(raw_refresh: str | None) -> None:
    """Logout: best effort — an already-expired token is not an error."""
    if not raw_refresh:
        return
    try:
        RefreshToken(raw_refresh).blacklist()
    except TokenError:
        pass


def set_refresh_cookie(response, raw_refresh: str):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        raw_refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        domain=settings.REFRESH_COOKIE_DOMAIN,
        path=settings.REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        domain=settings.REFRESH_COOKIE_DOMAIN,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )
    return response
