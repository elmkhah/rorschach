"""Verification documents and achievements."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.constants import VerificationStatus
from apps.audit.models import AuditAction, AuditLog
from apps.profiles.models import PsychologistProfile

pytestmark = pytest.mark.django_db

DOCUMENTS = "/api/v1/psychologists/me/documents/"
ACHIEVEMENTS = "/api/v1/psychologists/me/achievements/"


def pdf(name="licence.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


def test_uploading_documents_moves_to_pending_verification(as_user, make_psychologist):
    psychologist = make_psychologist(verification=VerificationStatus.REGISTERED)

    response = as_user(psychologist).post(DOCUMENTS, {"documents": [pdf()]}, format="multipart")

    assert response.status_code == 200
    profile = response.json()["psychologist_profile"]
    assert profile["verification_status"] == VerificationStatus.PENDING_VERIFICATION
    assert profile["documents"][0]["name"] == "licence.pdf"
    assert AuditLog.objects.filter(action=AuditAction.PSYCHOLOGIST_DOCUMENTS_UPLOADED).exists()


def test_uploading_again_after_rejection_reopens_the_review(as_user, make_psychologist):
    psychologist = make_psychologist(verification=VerificationStatus.REJECTED)

    as_user(psychologist).post(DOCUMENTS, {"documents": [pdf()]}, format="multipart")

    assert PsychologistProfile.objects.get(pk=psychologist.id).verification_status == (
        VerificationStatus.PENDING_VERIFICATION
    )


def test_an_approved_profile_keeps_its_status(as_user, psychologist):
    as_user(psychologist).post(DOCUMENTS, {"documents": [pdf()]}, format="multipart")

    # Only an admin changes an approved status (BR-01).
    assert PsychologistProfile.objects.get(pk=psychologist.id).verification_status == (
        VerificationStatus.APPROVED
    )


def test_upload_without_a_file_is_rejected(as_user, psychologist):
    response = as_user(psychologist).post(DOCUMENTS, {}, format="multipart")

    assert response.status_code == 400
    assert response.json()["detail"] == "حداقل یک فایل انتخاب کنید."


def test_unsupported_file_type_is_rejected(as_user, psychologist):
    executable = SimpleUploadedFile("x.exe", b"MZ", content_type="application/x-msdownload")

    response = as_user(psychologist).post(DOCUMENTS, {"documents": [executable]}, format="multipart")

    assert response.status_code == 400
    assert "پشتیبانی نمی‌شود" in response.json()["detail"]


def test_patients_cannot_upload_documents(as_user, patient):
    assert as_user(patient).post(DOCUMENTS, {"documents": [pdf()]}, format="multipart").status_code == 403


def test_achievement_crud(as_user, psychologist):
    client = as_user(psychologist)

    created = client.post(
        ACHIEVEMENTS,
        {"title": "دکترای روان‌شناسی بالینی", "issuer": "دانشگاه تهران", "year": 2013},
        format="json",
    )
    assert created.status_code == 201
    assert created.json()["psychologist_id"] == str(psychologist.id)

    assert len(client.get(ACHIEVEMENTS).json()) == 1
    assert client.delete(f"{ACHIEVEMENTS}{created.json()['id']}/").status_code == 204
    assert client.get(ACHIEVEMENTS).json() == []


def test_achievement_requires_a_title(as_user, psychologist):
    response = as_user(psychologist).post(ACHIEVEMENTS, {"title": ""}, format="json")

    assert response.status_code == 400
    assert response.json()["errors"]["title"] == ["عنوان الزامی است."]


def test_public_profile_shows_achievements(as_user, patient, psychologist):
    as_user(psychologist).post(
        ACHIEVEMENTS, {"title": "دوره‌ی آزمون‌های فرافکن", "year": 2016}, format="json"
    )

    body = as_user(patient).get(f"/api/v1/psychologists/{psychologist.id}/").json()

    assert body["psychologist"]["user_id"] == str(psychologist.id)
    assert body["achievements"][0]["title"] == "دوره‌ی آزمون‌های فرافکن"
