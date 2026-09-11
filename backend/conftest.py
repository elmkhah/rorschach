"""Shared test fixtures."""
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.constants import Role, VerificationStatus
from apps.accounts.models import User
from apps.catalog.models import (
    AssessmentCard,
    PhaseKind,
    TestDefinition,
    TestPhase,
    TestStatus,
    TestVersion,
    default_card_configuration,
)
from apps.profiles.models import PatientProfile, PsychologistProfile
from apps.relationships.models import Relationship, RelationshipStatus

PASSWORD = "Test1234!x"


@pytest.fixture
def api() -> APIClient:
    return APIClient()


def _auth(client: APIClient, user: User) -> APIClient:
    from apps.accounts.services import issue_tokens

    access, _refresh = issue_tokens(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.fixture
def as_user():
    """Returns a client authenticated as the given user."""

    def _factory(user: User) -> APIClient:
        return _auth(APIClient(), user)

    return _factory


@pytest.fixture
def make_patient(db):
    def _factory(email="patient@example.com", first="سارا", last="محمدی") -> User:
        user = User.objects.create_user(email=email, password=PASSWORD, role=Role.PATIENT)
        PatientProfile.objects.create(user=user, first_name=first, last_name=last)
        return user

    return _factory


@pytest.fixture
def make_psychologist(db):
    def _factory(
        email="psych@example.com",
        first="مریم",
        last="احمدی",
        verification=VerificationStatus.APPROVED,
    ) -> User:
        user = User.objects.create_user(email=email, password=PASSWORD, role=Role.PSYCHOLOGIST)
        PsychologistProfile.objects.create(
            user=user,
            first_name=first,
            last_name=last,
            specialty="روان‌شناسی بالینی",
            city="تهران",
            years_of_experience=10,
            verification_status=verification,
        )
        return user

    return _factory


@pytest.fixture
def make_admin(db):
    def _factory(email="admin@example.com") -> User:
        return User.objects.create_superuser(email=email, password=PASSWORD)

    return _factory


@pytest.fixture
def patient(make_patient) -> User:
    return make_patient()


@pytest.fixture
def psychologist(make_psychologist) -> User:
    return make_psychologist()


@pytest.fixture
def link(db):
    def _factory(patient: User, psychologist: User, status=RelationshipStatus.ACTIVE) -> Relationship:
        return Relationship.objects.create(
            patient=patient.patient_profile,
            psychologist=psychologist.psychologist_profile,
            status=status,
            approved_at=timezone.now() if status == RelationshipStatus.ACTIVE else None,
        )

    return _factory


@pytest.fixture
def rorschach(db) -> TestVersion:
    """A published ten-card Rorschach version, the same shape `seed_catalog` builds."""
    definition = TestDefinition.objects.create(
        code="RORSCHACH", name="آزمون رورشاخ", status=TestStatus.ACTIVE, coding_system="R-PAS"
    )
    version = TestVersion.objects.create(
        test_definition=definition, version="1.0", is_published=True, published_at=timezone.now()
    )
    response_phase = TestPhase.objects.create(
        test_version=version, kind=PhaseKind.RESPONSE, name="پاسخ", display_order=1
    )
    TestPhase.objects.create(
        test_version=version, kind=PhaseKind.CLARIFICATION, name="روشن‌سازی", display_order=2
    )
    for number in range(1, 11):
        AssessmentCard.objects.create(
            test_version=version,
            phase=response_phase,
            card_number=number,
            title=f"کارت {number}",
            image_path=f"/images/test/{number}.jpg",
            display_order=number,
            configuration=default_card_configuration(),
        )
    return version
