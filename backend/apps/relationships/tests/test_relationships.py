"""Relationship lifecycle and the access it grants (BR-02, BR-03, docs/05 §2)."""
import pytest

from apps.audit.models import AuditAction, AuditLog
from apps.messaging.models import Conversation
from apps.relationships.models import Relationship, RelationshipStatus

pytestmark = pytest.mark.django_db

LIST = "/api/v1/relationships/"


def request_link(client, psychologist):
    return client.post(LIST, {"psychologist_id": str(psychologist.id)}, format="json")


def test_patient_requests_a_link(as_user, patient, psychologist):
    response = request_link(as_user(patient), psychologist)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == RelationshipStatus.PENDING
    assert body["psychologist_id"] == str(psychologist.id)
    assert AuditLog.objects.filter(action=AuditAction.RELATIONSHIP_CREATED).exists()


def test_requesting_twice_is_409_and_creates_one_row(as_user, patient, psychologist):
    client = as_user(patient)
    request_link(client, psychologist)

    second = request_link(client, psychologist)

    # BR-03: unique (patient, psychologist) in the database, not just in Python.
    assert second.status_code == 409
    assert Relationship.objects.count() == 1


def test_cannot_request_an_unapproved_psychologist(as_user, patient, make_psychologist):
    unapproved = make_psychologist(email="pending@example.com", verification="PENDING_VERIFICATION")

    response = request_link(as_user(patient), unapproved)

    assert response.status_code == 400


def test_psychologist_cannot_request_a_link(as_user, psychologist, make_psychologist):
    other = make_psychologist(email="other@example.com")

    response = request_link(as_user(psychologist), other)

    assert response.status_code == 403


def test_approve_activates_and_opens_a_conversation(as_user, patient, psychologist, link):
    relationship = link(patient, psychologist, RelationshipStatus.PENDING)

    response = as_user(psychologist).post(f"{LIST}{relationship.id}/approve/", {}, format="json")

    assert response.status_code == 200
    assert response.json()["status"] == RelationshipStatus.ACTIVE
    assert response.json()["approved_at"]
    assert Conversation.objects.count() == 1
    assert AuditLog.objects.filter(action=AuditAction.RELATIONSHIP_APPROVED).exists()


def test_reject_ends_the_request(as_user, patient, psychologist, link):
    relationship = link(patient, psychologist, RelationshipStatus.PENDING)

    response = as_user(psychologist).post(f"{LIST}{relationship.id}/reject/", {}, format="json")

    assert response.json()["status"] == RelationshipStatus.REJECTED
    assert Conversation.objects.count() == 0


def test_a_decided_request_cannot_be_decided_again(as_user, patient, psychologist, link):
    relationship = link(patient, psychologist, RelationshipStatus.PENDING)
    client = as_user(psychologist)
    client.post(f"{LIST}{relationship.id}/approve/", {}, format="json")

    response = client.post(f"{LIST}{relationship.id}/reject/", {}, format="json")

    assert response.status_code == 409


def test_patient_cannot_approve_their_own_request(as_user, patient, psychologist, link):
    relationship = link(patient, psychologist, RelationshipStatus.PENDING)

    response = as_user(patient).post(f"{LIST}{relationship.id}/approve/", {}, format="json")

    assert response.status_code == 403


def test_either_party_may_revoke(as_user, patient, psychologist, link):
    relationship = link(patient, psychologist)

    response = as_user(patient).post(f"{LIST}{relationship.id}/revoke/", {}, format="json")

    assert response.json()["status"] == RelationshipStatus.REVOKED
    assert response.json()["revoked_at"]


def test_re_requesting_after_rejection_reuses_the_row(as_user, patient, psychologist, link):
    relationship = link(patient, psychologist, RelationshipStatus.REJECTED)

    response = request_link(as_user(patient), psychologist)

    assert response.status_code == 201
    assert response.json()["id"] == str(relationship.id)
    assert Relationship.objects.count() == 1


def test_list_shows_only_the_callers_own_links(as_user, patient, psychologist, make_patient, link):
    link(patient, psychologist)
    outsider = make_patient(email="outsider@example.com")

    assert len(as_user(patient).get(LIST).json()) == 1
    assert as_user(outsider).get(LIST).json() == []


def test_list_filters_by_status(as_user, patient, psychologist, make_psychologist, link):
    link(patient, psychologist)
    link(patient, make_psychologist(email="second@example.com"), RelationshipStatus.PENDING)

    rows = as_user(patient).get(LIST, {"status": "ACTIVE"}).json()

    assert len(rows) == 1
    assert rows[0]["status"] == "ACTIVE"


def test_psychologist_list_embeds_the_profiles(as_user, patient, psychologist, link):
    link(patient, psychologist)

    row = as_user(psychologist).get(LIST).json()[0]

    assert row["patient"]["first_name"] == "سارا"
    assert row["psychologist"]["first_name"] == "مریم"


# ---- the psychologist's patient view ----------------------------------------


def test_patient_detail_needs_an_active_link(as_user, patient, psychologist, link):
    link(patient, psychologist)

    response = as_user(psychologist).get(f"/api/v1/patients/{patient.id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["patient"]["first_name"] == "سارا"
    assert body["email"] == patient.email
    assert body["sessions"] == []


def test_patient_detail_is_denied_without_an_active_link(as_user, patient, psychologist, link):
    link(patient, psychologist, RelationshipStatus.PENDING)

    response = as_user(psychologist).get(f"/api/v1/patients/{patient.id}/")

    assert response.status_code == 403


def test_patient_detail_is_denied_to_a_stranger(as_user, patient, make_psychologist):
    stranger = make_psychologist(email="stranger@example.com")

    response = as_user(stranger).get(f"/api/v1/patients/{patient.id}/")

    assert response.status_code == 403


# ---- the psychologist directory ---------------------------------------------


def test_directory_lists_only_approved_psychologists(as_user, patient, psychologist, make_psychologist):
    make_psychologist(email="pending@example.com", verification="PENDING_VERIFICATION")

    body = as_user(patient).get("/api/v1/psychologists/").json()

    assert body["count"] == 1
    assert body["results"][0]["user_id"] == str(psychologist.id)


def test_directory_shows_the_callers_relationship_status(as_user, patient, psychologist, link):
    relationship = link(patient, psychologist, RelationshipStatus.PENDING)

    row = as_user(patient).get("/api/v1/psychologists/").json()["results"][0]

    assert row["relationship_id"] == str(relationship.id)
    assert row["relationship_status"] == "PENDING"


def test_directory_search_matches_name_and_specialty(as_user, patient, psychologist, make_psychologist):
    make_psychologist(email="second@example.com", first="حسین", last="کریمی")

    rows = as_user(patient).get("/api/v1/psychologists/", {"search": "کریمی"}).json()["results"]

    assert len(rows) == 1
    assert rows[0]["last_name"] == "کریمی"
