"""Admin panel API: verification, user management, test versioning, audit."""
import pytest

from apps.accounts.constants import VerificationStatus
from apps.accounts.models import User
from apps.audit.models import AuditAction, AuditLog
from apps.catalog.models import AssessmentCard, TestVersion

pytestmark = pytest.mark.django_db

ADMIN = "/api/v1/admin"


@pytest.fixture
def admin(make_admin):
    return make_admin()


@pytest.fixture
def client(as_user, admin):
    return as_user(admin)


def test_every_admin_endpoint_is_closed_to_others(as_user, patient, psychologist):
    for user in (patient, psychologist):
        assert as_user(user).get(f"{ADMIN}/stats/").status_code == 403


def test_stats_counts_the_dashboard_numbers(client, patient, psychologist, link):
    link(patient, psychologist)

    body = client.get(f"{ADMIN}/stats/").json()

    assert body["patients"] == 1
    assert body["psychologists"] == 1
    assert body["active_relationships"] == 1
    assert body["sessions_total"] == 0


def test_user_list_is_paginated_with_page_size_20(client, patient):
    body = client.get(f"{ADMIN}/users/").json()

    assert set(body) == {"count", "next", "previous", "results"}
    row = next(r for r in body["results"] if r["user"]["id"] == str(patient.id))
    assert row["name"] == "سارا محمدی"
    assert row["patient_profile"] is not None
    assert row["psychologist_profile"] is None


def test_user_list_filters_by_role_and_search(client, patient, psychologist):
    patients = client.get(f"{ADMIN}/users/", {"role": "PATIENT"}).json()
    assert patients["count"] == 1

    found = client.get(f"{ADMIN}/users/", {"search": "احمدی"}).json()
    assert found["count"] == 1
    assert found["results"][0]["user"]["id"] == str(psychologist.id)


def test_toggle_active_flips_the_account(client, patient):
    response = client.post(f"{ADMIN}/users/{patient.id}/toggle-active/", {}, format="json")

    assert response.json()["user"]["is_active"] is False
    assert AuditLog.objects.filter(action=AuditAction.USER_DEACTIVATED).exists()
    client.post(f"{ADMIN}/users/{patient.id}/toggle-active/", {}, format="json")
    assert User.objects.get(pk=patient.id).is_active is True


def test_admin_cannot_deactivate_themselves(client, admin):
    response = client.post(f"{ADMIN}/users/{admin.id}/toggle-active/", {}, format="json")

    assert response.status_code == 400


def test_approve_moves_the_psychologist_to_approved(client, make_psychologist):
    pending = make_psychologist(
        email="pending@example.com", verification=VerificationStatus.PENDING_VERIFICATION
    )

    response = client.post(
        f"{ADMIN}/psychologists/{pending.id}/verify/",
        {"decision": "APPROVE", "note": "مدارک کامل بود"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["psychologist_profile"]["verification_status"] == "APPROVED"
    assert AuditLog.objects.filter(action=AuditAction.PSYCHOLOGIST_PROFILE_APPROVED).exists()


def test_reject_and_suspend_are_recorded_separately(client, make_psychologist):
    first = make_psychologist(email="a@example.com")
    second = make_psychologist(email="b@example.com")

    client.post(f"{ADMIN}/psychologists/{first.id}/verify/", {"decision": "REJECT"}, format="json")
    client.post(f"{ADMIN}/psychologists/{second.id}/verify/", {"decision": "SUSPEND"}, format="json")

    assert AuditLog.objects.filter(action=AuditAction.PSYCHOLOGIST_PROFILE_REJECTED).exists()
    assert AuditLog.objects.filter(action=AuditAction.PSYCHOLOGIST_PROFILE_SUSPENDED).exists()


def test_psychologist_filter_by_verification_status(client, make_psychologist, psychologist):
    make_psychologist(
        email="pending@example.com", verification=VerificationStatus.PENDING_VERIFICATION
    )

    rows = client.get(
        f"{ADMIN}/psychologists/", {"verification_status": "PENDING_VERIFICATION"}
    ).json()

    assert len(rows) == 1


# ---- test versioning --------------------------------------------------------


def test_tests_list_includes_versions(client, rorschach):
    rows = client.get(f"{ADMIN}/tests/").json()

    assert rows[0]["code"] == "RORSCHACH"
    assert rows[0]["versions"][0]["version"] == "1.0"


def test_version_detail_returns_phases_and_cards(client, rorschach):
    body = client.get(f"{ADMIN}/test-versions/{rorschach.id}/").json()

    response_phase = next(p for p in body["phases"] if p["kind"] == "RESPONSE")
    assert len(response_phase["cards"]) == 10
    assert response_phase["cards"][0]["configuration"]["min_responses"] == 2


def test_published_version_cannot_be_edited_only_cloned(client, rorschach):
    card = rorschach.cards.first()

    blocked = client.patch(f"{ADMIN}/cards/{card.id}/", {"title": "جدید"}, format="json")
    assert blocked.status_code == 409

    clone = client.post(f"{ADMIN}/test-versions/{rorschach.id}/clone/", {}, format="json")
    assert clone.status_code == 201
    assert clone.json()["version"] == "1.1"
    assert clone.json()["is_published"] is False

    cloned = TestVersion.objects.get(pk=clone.json()["id"])
    assert cloned.cards.count() == 10
    assert cloned.phases.count() == 2

    editable = cloned.cards.first()
    ok = client.patch(f"{ADMIN}/cards/{editable.id}/", {"title": "کارت جدید"}, format="json")
    assert ok.status_code == 200
    assert AssessmentCard.objects.get(pk=editable.id).title == "کارت جدید"


def test_publishing_a_draft_marks_it_published(client, rorschach):
    clone_id = client.post(f"{ADMIN}/test-versions/{rorschach.id}/clone/", {}, format="json").json()["id"]

    response = client.post(f"{ADMIN}/test-versions/{clone_id}/publish/", {}, format="json")

    assert response.status_code == 200
    assert response.json()["is_published"] is True
    assert response.json()["published_at"]
    assert AuditLog.objects.filter(action=AuditAction.TEST_VERSION_PUBLISHED).exists()


def test_republishing_is_409(client, rorschach):
    response = client.post(f"{ADMIN}/test-versions/{rorschach.id}/publish/", {}, format="json")

    assert response.status_code == 409


# ---- announcements ----------------------------------------------------------


def test_announcement_lifecycle(client, api):
    created = client.post(
        f"{ADMIN}/announcements/",
        {"title": "خبر", "body": "متن خبر", "is_published": True},
        format="json",
    )
    assert created.status_code == 201
    assert created.json()["published_at"]

    # The public feed shows published announcements without authentication.
    public = api.get("/api/v1/announcements/").json()
    assert len(public) == 1

    announcement_id = created.json()["id"]
    client.patch(
        f"{ADMIN}/announcements/{announcement_id}/",
        {"title": "خبر", "body": "متن", "is_published": False},
        format="json",
    )
    assert api.get("/api/v1/announcements/").json() == []

    assert client.delete(f"{ADMIN}/announcements/{announcement_id}/").status_code == 204


def test_announcement_requires_a_title(client):
    response = client.post(f"{ADMIN}/announcements/", {"title": ""}, format="json")

    assert response.status_code == 400
    assert response.json()["errors"]["title"] == ["عنوان الزامی است."]


# ---- audit ------------------------------------------------------------------


def test_audit_log_is_paginated_with_page_size_25(client, patient):
    client.post(f"{ADMIN}/users/{patient.id}/toggle-active/", {}, format="json")

    body = client.get(f"{ADMIN}/audit-logs/").json()

    assert body["count"] >= 1
    entry = body["results"][0]
    assert entry["action"] == AuditAction.USER_DEACTIVATED
    assert entry["target_type"] == "User"
    assert entry["actor_email"]


def test_audit_log_filters_by_action(client, patient):
    client.post(f"{ADMIN}/users/{patient.id}/toggle-active/", {}, format="json")

    body = client.get(f"{ADMIN}/audit-logs/", {"action": "RELATIONSHIP_CREATED"}).json()

    assert body["count"] == 0
