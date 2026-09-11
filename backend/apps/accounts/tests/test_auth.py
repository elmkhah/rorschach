"""Auth contract: what `core/auth/auth.service.ts` expects on every call."""
import pytest
from django.conf import settings

from apps.accounts.constants import Role, VerificationStatus
from apps.accounts.models import User

pytestmark = pytest.mark.django_db

REGISTER = "/api/v1/auth/register/"
LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/auth/me/"


def patient_payload(**over):
    return {
        "role": "PATIENT",
        "email": "new@example.com",
        "password": "Test1234!x",
        "phone": "09120000000",
        "first_name": "سارا",
        "last_name": "محمدی",
        **over,
    }


def test_register_patient_returns_access_and_me(api):
    response = api.post(REGISTER, patient_payload(), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["access"]
    assert body["me"]["user"]["role"] == "PATIENT"
    assert body["me"]["patient_profile"]["first_name"] == "سارا"
    assert body["me"]["psychologist_profile"] is None
    # The refresh token is a cookie the browser never exposes to JavaScript.
    cookie = response.cookies[settings.REFRESH_COOKIE_NAME]
    assert cookie["httponly"]
    assert cookie["path"] == "/api/v1/auth/"


def test_register_psychologist_starts_unverified(api):
    response = api.post(
        REGISTER,
        patient_payload(
            role="PSYCHOLOGIST",
            email="psy@example.com",
            specialty="بالینی",
            professional_code="PSY-1",
        ),
        format="json",
    )

    assert response.status_code == 201
    profile = response.json()["me"]["psychologist_profile"]
    # BR-01: nobody approves themselves.
    assert profile["verification_status"] == VerificationStatus.REGISTERED


def test_duplicate_email_is_a_field_error(api, patient):
    response = api.post(REGISTER, patient_payload(email=patient.email), format="json")

    assert response.status_code == 400
    body = response.json()
    assert body["errors"]["email"] == ["این ایمیل قبلاً ثبت شده است."]
    assert body["detail"]


def test_short_password_is_rejected(api):
    response = api.post(REGISTER, patient_payload(password="short"), format="json")

    assert response.status_code == 400
    assert response.json()["errors"]["password"][0] == "رمز عبور باید حداقل ۸ کاراکتر باشد."


def test_login_with_wrong_password_is_401(api, patient):
    response = api.post(LOGIN, {"email": patient.email, "password": "nope"}, format="json")

    assert response.status_code == 401
    assert response.json()["detail"] == "ایمیل یا رمز عبور اشتباه است."


def test_login_to_deactivated_account_is_403(api, patient):
    User.objects.filter(pk=patient.pk).update(is_active=False)

    response = api.post(LOGIN, {"email": patient.email, "password": "Test1234!x"}, format="json")

    assert response.status_code == 403
    assert response.json()["detail"] == "حساب کاربری شما غیرفعال شده است."


def test_refresh_exchanges_the_cookie_for_a_new_access_token(api, patient):
    api.post(LOGIN, {"email": patient.email, "password": "Test1234!x"}, format="json")

    response = api.post(REFRESH, {}, format="json")

    assert response.status_code == 200
    assert response.json()["access"]
    # Rotated: a fresh cookie comes back.
    assert settings.REFRESH_COOKIE_NAME in response.cookies


def test_refresh_without_cookie_is_401(api):
    response = api.post(REFRESH, {}, format="json")

    assert response.status_code == 401
    assert response.json()["detail"] == "نشست منقضی شده است."


def test_logout_invalidates_the_refresh_token(api, patient):
    api.post(LOGIN, {"email": patient.email, "password": "Test1234!x"}, format="json")

    api.post(LOGOUT, {}, format="json")
    api.cookies.pop(settings.REFRESH_COOKIE_NAME, None)
    response = api.post(REFRESH, {}, format="json")

    assert response.status_code == 401


def test_me_requires_authentication(api):
    assert api.get(ME).status_code == 401


def test_patch_me_updates_profile_and_phone(as_user, patient):
    client = as_user(patient)

    response = client.patch(
        "/api/v1/users/me/",
        {"first_name": "نسرین", "phone": "09121111111", "specialty": "ignored"},
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["patient_profile"]["first_name"] == "نسرین"
    assert body["user"]["phone"] == "09121111111"


def test_admin_cannot_be_self_registered(api):
    response = api.post(REGISTER, patient_payload(role=Role.ADMIN), format="json")

    assert response.status_code == 400
    assert "role" in response.json()["errors"]
