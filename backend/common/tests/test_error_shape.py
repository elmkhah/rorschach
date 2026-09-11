"""
Every failure must be an `ApiErrorBody` (`core/models/api.models.ts`):

    { detail?: string; code?: string; errors?: Record<string, string[]> }

`shared/utils/forms.ts` reads `errors.<field>` onto controls and shows `detail`
as the banner, so a body in any other shape leaves the user with a silent form.
"""
import pytest

pytestmark = pytest.mark.django_db


def assert_error_body(body):
    assert isinstance(body, dict)
    assert isinstance(body.get("detail"), str) and body["detail"]
    assert isinstance(body.get("code"), str)
    for messages in (body.get("errors") or {}).values():
        assert isinstance(messages, list)
        assert all(isinstance(m, str) for m in messages)


def test_validation_error_is_wrapped_not_raw(api):
    response = api.post("/api/v1/auth/register/", {"email": "not-an-email"}, format="json")

    assert response.status_code == 400
    body = response.json()
    assert_error_body(body)
    # DRF would have returned a bare {field: [...]} dict here.
    assert "email" in body["errors"]
    assert "password" in body["errors"]


def test_missing_credentials_produce_a_persian_message(api):
    body = api.get("/api/v1/auth/me/").json()

    assert_error_body(body)
    assert body["detail"] == "احراز هویت لازم است."
    assert body["code"] == "not_authenticated"


def test_a_malformed_token_does_not_leak_library_internals(api):
    api.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")

    response = api.get("/api/v1/auth/me/")
    body = response.json()

    assert response.status_code == 401
    assert_error_body(body)
    # SimpleJWT's detail is a dict; stringifying it would surface ErrorDetail(...).
    assert "ErrorDetail" not in body["detail"]
    assert body["detail"] == "احراز هویت لازم است."


def test_a_broken_authorization_header_is_handled(api):
    api.credentials(HTTP_AUTHORIZATION="Bearer")

    body = api.get("/api/v1/auth/me/").json()

    assert_error_body(body)
    assert "ErrorDetail" not in body["detail"]


def test_permission_denied_is_persian(as_user, patient):
    body = as_user(patient).get("/api/v1/admin/stats/").json()

    assert_error_body(body)
    assert body["code"] == "permission_denied"


def test_not_found_is_persian(as_user, patient):
    body = as_user(patient).get("/api/v1/psychologists/00000000-0000-0000-0000-000000000000/").json()

    assert_error_body(body)
    assert body["detail"] == "روان‌شناس یافت نشد."


def test_method_not_allowed_is_persian(as_user, patient):
    body = as_user(patient).delete("/api/v1/auth/me/").json()

    assert_error_body(body)
    # DRF's own fa translation is more specific than our fallback; either is fine
    # as long as nothing English reaches the user.
    assert "مجاز نیست" in body["detail"]
    assert body["code"] == "method_not_allowed"


def test_conflict_carries_the_state_machine_message(as_user, patient, psychologist, link, rorschach):
    link(patient, psychologist)
    client = as_user(patient)
    session = client.post(
        "/api/v1/assessments/sessions/", {"psychologist_id": str(psychologist.id)}, format="json"
    ).json()

    # Completing from INTRO is a state violation, not a validation error.
    response = client.post(f"/api/v1/assessments/sessions/{session['id']}/complete/", {}, format="json")

    assert response.status_code == 409
    body = response.json()
    assert_error_body(body)
    assert body["code"] == "conflict"
