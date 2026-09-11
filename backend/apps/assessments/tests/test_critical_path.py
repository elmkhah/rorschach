"""
The critical path (docs/05 §9, docs/06 §6), driven only through the HTTP API:

    register → login → select psychologist → start assessment
    → answer cards → complete → psychologist logs in → views the assessment

Nothing here reaches into the ORM to set up state; if this passes, the whole
contract holds end to end.
"""
import pytest
from rest_framework.test import APIClient

from apps.accounts.constants import VerificationStatus
from apps.profiles.models import PsychologistProfile

pytestmark = pytest.mark.django_db

PASSWORD = "Critical1234!"


def register(client, role, email, **extra):
    response = client.post(
        "/api/v1/auth/register/",
        {
            "role": role,
            "email": email,
            "password": PASSWORD,
            "first_name": extra.pop("first_name", "نام"),
            "last_name": extra.pop("last_name", "خانوادگی"),
            **extra,
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    return response.json()


def login(email):
    client = APIClient()
    response = client.post(
        "/api/v1/auth/login/", {"email": email, "password": PASSWORD}, format="json"
    )
    assert response.status_code == 200, response.json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    return client, response.json()["me"]


def test_critical_path(api, rorschach, make_admin, as_user):
    # 1. Both actors register.
    register(APIClient(), "PATIENT", "sara@example.com", first_name="سارا", last_name="محمدی")
    psychologist = register(
        APIClient(),
        "PSYCHOLOGIST",
        "maryam@example.com",
        first_name="مریم",
        last_name="احمدی",
        specialty="روان‌شناسی بالینی",
        professional_code="PSY-1",
    )
    psychologist_id = psychologist["me"]["user"]["id"]

    # 2. An admin approves the psychologist — nobody can self-approve (BR-01).
    admin_client = as_user(make_admin())
    approved = admin_client.post(
        f"/api/v1/admin/psychologists/{psychologist_id}/verify/",
        {"decision": "APPROVE"},
        format="json",
    )
    assert approved.status_code == 200
    assert PsychologistProfile.objects.get(pk=psychologist_id).verification_status == (
        VerificationStatus.APPROVED
    )

    # 3. The patient logs in and finds them in the directory.
    patient_client, _me = login("sara@example.com")
    directory = patient_client.get("/api/v1/psychologists/").json()
    assert directory["count"] == 1
    assert directory["results"][0]["relationship_status"] is None

    # 4. Request a link; the psychologist approves it.
    relationship = patient_client.post(
        "/api/v1/relationships/", {"psychologist_id": psychologist_id}, format="json"
    ).json()
    assert relationship["status"] == "PENDING"

    psychologist_client, _ = login("maryam@example.com")
    approved_link = psychologist_client.post(
        f"/api/v1/relationships/{relationship['id']}/approve/", {}, format="json"
    ).json()
    assert approved_link["status"] == "ACTIVE"

    # 5. Start the assessment.
    session = patient_client.post(
        "/api/v1/assessments/sessions/", {"psychologist_id": psychologist_id}, format="json"
    ).json()
    base = f"/api/v1/assessments/sessions/{session['id']}"
    state = patient_client.post(f"{base}/start/", {}, format="json").json()
    assert state["stage"] == "RESPONSE"

    # 6. Answer all ten cards, two responses each.
    counter = 0
    for _ in range(10):
        for i in range(2):
            counter += 1
            submitted = patient_client.post(
                f"{base}/responses/",
                {
                    "client_response_id": f"cp-{counter}",
                    "card_id": state["card"]["id"],
                    "response_text": f"پاسخ {i + 1} به کارت {state['card']['card_number']}",
                    "measurements": {"reaction_time_ms": 1500, "card_turns": 0, "final_rotation": 0},
                },
                format="json",
            )
            assert submitted.status_code == 201
            state = submitted.json()["state"]
        state = patient_client.post(f"{base}/next/", {}, format="json").json()["state"]

    # 7. Clarify every response, then complete.
    assert state["stage"] == "CLARIFICATION"
    while state["stage"] == "CLARIFICATION":
        state = patient_client.post(
            f"{base}/clarifications/",
            {
                "response_id": state["target"]["id"],
                "whole": True,
                "location_marks": [],
                "reasons": ["FORM"],
                "text": "",
            },
            format="json",
        ).json()

    assert state["stage"] == "REVIEW"
    state = patient_client.post(f"{base}/complete/", {}, format="json").json()
    assert state["stage"] == "COMPLETED"
    assert state["session"]["status"] == "COMPLETED"

    # 8. The examinee sees no raw data anywhere (BR-14).
    assert patient_client.get(f"{base}/detail/").status_code == 403

    # 9. The psychologist reads the whole protocol.
    detail = psychologist_client.get(f"{base}/detail/").json()
    assert len(detail["responses"]) == 20
    assert all(r["clarification"] is not None for r in detail["responses"])
    assert detail["analysis"]["calculated_data"]["R"] == 20
    assert detail["analysis"]["calculated_data"]["coded"] == 0

    # 10. Coding one response feeds straight into the analysis.
    first_response = detail["responses"][0]["id"]
    psychologist_client.put(
        f"{base}/responses/{first_response}/coding/",
        {
            "location": "W",
            "determinants": ["F"],
            "form_quality": "o",
            "content": ["A"],
            "popular": True,
        },
        format="json",
    )
    analysis = psychologist_client.post(f"{base}/analysis/", {}, format="json").json()
    assert analysis["status"] == "DONE"
    assert analysis["calculated_data"]["coded"] == 1
    assert analysis["calculated_data"]["caveats"]
