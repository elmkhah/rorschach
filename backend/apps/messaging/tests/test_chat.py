"""Chat REST surface (docs/04 §6). Realtime delivery rides on top of these writes."""
import pytest

from apps.messaging.models import Conversation, Message
from apps.relationships.models import RelationshipStatus

pytestmark = pytest.mark.django_db

CONVERSATIONS = "/api/v1/conversations/"


@pytest.fixture
def conversation(as_user, patient, psychologist, link):
    """Approving a request is what opens the channel."""
    relationship = link(patient, psychologist, RelationshipStatus.PENDING)
    as_user(psychologist).post(
        f"/api/v1/relationships/{relationship.id}/approve/", {}, format="json"
    )
    return Conversation.objects.get()


def test_conversation_list_shows_the_peer(as_user, patient, conversation):
    rows = as_user(patient).get(CONVERSATIONS).json()

    assert len(rows) == 1
    peer = rows[0]["peer"]
    assert peer["name"] == "مریم احمدی"
    assert peer["role"] == "PSYCHOLOGIST"
    assert peer["is_online"] is False
    assert rows[0]["unread_count"] == 0


def test_sending_a_message_and_reading_it_back(as_user, patient, psychologist, conversation):
    sent = as_user(patient).post(
        f"{CONVERSATIONS}{conversation.id}/messages/", {"content": "سلام"}, format="json"
    )

    assert sent.status_code == 201
    assert sent.json()["content"] == "سلام"
    assert sent.json()["message_type"] == "TEXT"
    assert sent.json()["read_at"] is None

    messages = as_user(psychologist).get(f"{CONVERSATIONS}{conversation.id}/messages/").json()
    assert [m["content"] for m in messages] == ["سلام"]


def test_empty_message_is_rejected(as_user, patient, conversation):
    response = as_user(patient).post(
        f"{CONVERSATIONS}{conversation.id}/messages/", {"content": "   "}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["errors"]["content"] == ["متن پیام خالی است."]


def test_unread_count_is_per_reader(as_user, patient, psychologist, conversation):
    as_user(patient).post(
        f"{CONVERSATIONS}{conversation.id}/messages/", {"content": "سلام"}, format="json"
    )

    assert as_user(psychologist).get(CONVERSATIONS).json()[0]["unread_count"] == 1
    # The sender never has unread messages of their own.
    assert as_user(patient).get(CONVERSATIONS).json()[0]["unread_count"] == 0


def test_marking_read_clears_only_the_peers_messages(as_user, patient, psychologist, conversation):
    client = as_user(psychologist)
    as_user(patient).post(
        f"{CONVERSATIONS}{conversation.id}/messages/", {"content": "سلام"}, format="json"
    )
    client.post(f"{CONVERSATIONS}{conversation.id}/messages/", {"content": "سلام، بفرمایید"}, format="json")

    client.post(f"{CONVERSATIONS}{conversation.id}/read/", {}, format="json")

    assert Message.objects.get(content="سلام").read_at is not None
    assert Message.objects.get(content="سلام، بفرمایید").read_at is None


def test_outsiders_cannot_read_or_write(as_user, make_patient, conversation):
    outsider = make_patient(email="outsider@example.com")
    client = as_user(outsider)

    assert client.get(f"{CONVERSATIONS}{conversation.id}/messages/").status_code == 403
    assert (
        client.post(
            f"{CONVERSATIONS}{conversation.id}/messages/", {"content": "نفوذ"}, format="json"
        ).status_code
        == 403
    )
    assert client.get(CONVERSATIONS).json() == []


def test_conversation_ordering_follows_the_latest_message(
    as_user, patient, psychologist, make_psychologist, link, conversation
):
    second_psychologist = make_psychologist(email="second@example.com")
    second = link(patient, second_psychologist, RelationshipStatus.PENDING)
    as_user(second_psychologist).post(f"/api/v1/relationships/{second.id}/approve/", {}, format="json")
    newest = Conversation.objects.exclude(pk=conversation.pk).get()

    client = as_user(patient)
    client.post(f"{CONVERSATIONS}{newest.id}/messages/", {"content": "تازه‌ترین"}, format="json")

    rows = client.get(CONVERSATIONS).json()
    assert rows[0]["id"] == str(newest.id)
    assert rows[0]["last_message"]["content"] == "تازه‌ترین"
