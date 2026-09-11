"""
Development seed data — the same accounts and demo protocol the frontend mock
ships with (`core/mock/mock-db.ts`), so switching `useMock` to false changes
nothing a tester can see.

Accounts (password `Test1234`):
    patient@test.com · patient2@test.com · patient3@test.com
    psych@test.com · psych2@test.com · psych3@test.com · psych4@test.com
    pending@test.com   (awaiting verification)
    admin@test.com     (admin panel)

Refuses to run with DEBUG off: these are known credentials.
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.constants import Gender, Role, VerificationStatus
from apps.accounts.models import User
from apps.assessments.models import AssessmentSession, SessionStatus, empty_administration
from apps.assessments.services import run_analysis
from apps.audit.models import AuditAction, AuditLog
from apps.catalog.models import PhaseKind, TestDefinition, TestStatus
from apps.catalog.selectors import published_version, response_cards
from apps.messaging.models import Conversation, ConversationParticipant, Message
from apps.notifications.models import SiteAnnouncement
from apps.profiles.models import PatientProfile, PsychologistAchievement, PsychologistProfile
from apps.relationships.models import Relationship, RelationshipStatus

PASSWORD = "Test1234"

PATIENTS = [
    ("patient@test.com", "سارا", "محمدی", "1995-04-12", Gender.FEMALE),
    ("patient2@test.com", "علی", "رضایی", "1990-09-30", Gender.MALE),
    ("patient3@test.com", "نرگس", "کاظمی", "2000-01-05", Gender.FEMALE),
]

PSYCHOLOGISTS = [
    ("psych@test.com", "مریم", "احمدی", "روان‌شناسی بالینی", "تهران", 12, VerificationStatus.APPROVED),
    ("psych2@test.com", "حسین", "کریمی", "اضطراب و افسردگی", "اصفهان", 8, VerificationStatus.APPROVED),
    ("psych3@test.com", "نگار", "صادقی", "روان‌شناسی کودک و نوجوان", "شیراز", 6, VerificationStatus.APPROVED),
    ("psych4@test.com", "رضا", "موسوی", "زوج‌درمانی", "مشهد", 15, VerificationStatus.APPROVED),
    ("pending@test.com", "امید", "نوری", "روان‌شناسی سلامت", "تبریز", 3, VerificationStatus.PENDING_VERIFICATION),
]

ACHIEVEMENTS = [
    ("psych@test.com", "دکترای روان‌شناسی بالینی", "دانشگاه تهران", 2013, ""),
    ("psych@test.com", "دوره‌ی تخصصی آزمون‌های فرافکن", "انجمن روان‌شناسی ایران", 2016, "آموزش اجرای آزمون‌های فرافکن"),
    ("psych2@test.com", "کارشناسی ارشد روان‌شناسی عمومی", "دانشگاه اصفهان", 2015, ""),
]

LINKS = [
    ("patient@test.com", "psych@test.com", RelationshipStatus.ACTIVE, 30),
    ("patient@test.com", "psych2@test.com", RelationshipStatus.PENDING, 2),
    ("patient2@test.com", "psych@test.com", RelationshipStatus.PENDING, 1),
    ("patient3@test.com", "psych@test.com", RelationshipStatus.ACTIVE, 8),
]


def _coding(location, determinants, form_quality, content, **extra):
    from apps.assessments.rpas.codes import empty_coding

    return {
        **empty_coding(),
        "location": location,
        "determinants": determinants,
        "form_quality": form_quality,
        "content": content,
        **extra,
    }


PAIR = [{"x": 0.3, "y": 0.5}, {"x": 0.7, "y": 0.5}]
CENTER = [{"x": 0.5, "y": 0.5}]

#: A complete, coded demo protocol (19 responses over the ten cards).
PROTOCOL = [
    (1, "یک خفاش", "کل لکه؛ بال‌ها این دو طرف‌اند و بدنش وسط.", None, _coding("W", ["F"], "o", ["A"], popular=True), 0),
    (1, "یک ماسک", "این سوراخ‌های سفید چشم‌هایش است.", None, _coding("W", ["F"], "o", ["(Hd)"], space=["SR"]), 0),
    (2, "دو خرس که دست‌هایشان را به هم زده‌اند", "این دو قسمت سیاه خرس‌اند، حالت دست زدن دارند.", PAIR, _coding("D", ["FM"], "o", ["A"], pair=True, popular=True, thematic_codes=["COP"]), 0),
    (2, "خون", "این قسمت‌های قرمز، رنگش شبیه خون است.", [{"x": 0.5, "y": 0.2}], _coding("D", ["C"], "n", ["Bl"]), 0),
    (3, "دو نفر که دارند چیزی را بلند می‌کنند", "این‌ها دو آدم‌اند که خم شده‌اند.", PAIR, _coding("D", ["M"], "o", ["H"], pair=True, popular=True, thematic_codes=["COP", "MAH"]), 0),
    (3, "یک پاپیون قرمز", "این قسمت وسط؛ رنگ قرمز و شکلش.", CENTER, _coding("D", ["FC"], "o", ["Cg"]), 0),
    (4, "یک هیولای بزرگ که از بالا نگاه می‌کند", "پاهایش این پایین است.", None, _coding("W", ["FD"], "o", ["(H)"], popular=True), 0),
    (4, "پوست یک حیوان", "سایه‌ها حالت پرزدار دارند، مثل پوست.", None, _coding("W", ["T"], "o", ["Ad"]), 1),
    (5, "یک پروانه", "کل لکه؛ بال‌ها و شاخک‌ها.", None, _coding("W", ["F"], "o", ["A"], popular=True), 0),
    (6, "پوست حیوانی که روی زمین پهن شده", "پهن شده و سایه‌ها مثل خز است.", None, _coding("W", ["T"], "o", ["Ad"], popular=True), 0),
    (7, "دو دختر که به هم نگاه می‌کنند", "صورت‌ها این بالا هستند.", [{"x": 0.3, "y": 0.3}, {"x": 0.7, "y": 0.3}], _coding("D", ["M"], "o", ["Hd"], pair=True, popular=True, thematic_codes=["MAH"]), 0),
    (8, "دو حیوان که از کوه بالا می‌روند", "این دو قسمت صورتی حیوان‌اند.", PAIR, _coding("D", ["FM"], "o", ["A"], pair=True, popular=True), 0),
    (8, "یک اسکلت", "این قسمت وسط مثل دنده‌هاست.", CENTER, _coding("D", ["F"], "u", ["An"]), 1),
    (9, "آتش و دود", "نارنجی‌اش شعله است و سبزش دودی که بالا می‌رود.", [{"x": 0.5, "y": 0.25}], _coding("D", ["CF", "m"], "u", ["Fi"]), 0),
    (9, "یک صورت عجیب", "دو چشم این‌جاست.", [{"x": 0.45, "y": 0.45}], _coding("Dd", ["F"], "-", ["(Hd)"]), 1),
    (10, "زیر آب، پر از موجودات رنگی", "رنگ‌های مختلف، مثل خرچنگ و ماهی.", None, _coding("W", ["CF"], "u", ["A", "NC"], synthesis=True), 0),
    (10, "دو خرچنگ آبی", "این قسمت‌های آبی؛ پاهای زیادی دارند.", [{"x": 0.2, "y": 0.3}, {"x": 0.8, "y": 0.3}], _coding("D", ["FC"], "o", ["A"], pair=True, popular=True), 0),
    (10, "دو حشره که سر یک چوب دعوا می‌کنند", "هر کدام یک طرف چوب را می‌کشند.", [{"x": 0.5, "y": 0.1}], _coding("D", ["FM"], "o", ["A"], pair=True, thematic_codes=["AGM"]), 0),
]

#: An in-progress session: cards I–III answered, card IV current.
PARTIAL = [
    (1, "یک پرنده با بال‌های باز"),
    (1, "یک ماسک"),
    (2, "دو نفر که با هم می‌رقصند"),
    (3, "دو آدم که روبه‌روی هم ایستاده‌اند"),
    (3, "یک پروانه‌ی قرمز"),
]


class Command(BaseCommand):
    help = "ایجاد داده‌ی نمونه برای توسعه (همان حساب‌های آزمایشی فرانت‌اند)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="اجرا حتی وقتی DEBUG خاموش است (فقط برای محیط staging کنترل‌شده)",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "این دستور حساب‌هایی با رمز عمومی می‌سازد و فقط در حالت DEBUG اجرا می‌شود."
            )
        if not TestDefinition.objects.filter(status=TestStatus.ACTIVE).exists():
            raise CommandError("ابتدا دستور `seed_catalog` را اجرا کنید.")

        users = self._users()
        self._achievements(users)
        links = self._links(users)
        self._announcement()
        self._sessions(users, links)
        self._conversations(links)
        self.stdout.write(self.style.SUCCESS(f"داده‌ی نمونه آماده است. رمز همه‌ی حساب‌ها: {PASSWORD}"))

    # ---- pieces -------------------------------------------------------------

    def _users(self) -> dict[str, User]:
        users: dict[str, User] = {}

        for email, first, last, birth, gender in PATIENTS:
            user = self._user(email, Role.PATIENT)
            PatientProfile.objects.get_or_create(
                user=user,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "birth_date": birth,
                    "gender": gender,
                },
            )
            users[email] = user

        for email, first, last, specialty, city, years, verification in PSYCHOLOGISTS:
            user = self._user(email, Role.PSYCHOLOGIST)
            PsychologistProfile.objects.get_or_create(
                user=user,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "specialty": specialty,
                    "city": city,
                    "years_of_experience": years,
                    "verification_status": verification,
                    "professional_code": f"PSY-{10000 + years * 7}",
                    "bio": f"{first} {last}، روان‌شناس با {years} سال سابقه‌ی کار بالینی در حوزه‌ی {specialty}.",
                },
            )
            users[email] = user

        admin = self._user("admin@test.com", Role.ADMIN, is_staff=True, is_superuser=True)
        users["admin@test.com"] = admin
        return users

    def _user(self, email: str, role: str, **extra) -> User:
        user = User.objects.filter(email=email).first()
        if user:
            return user
        user = User.objects.create_user(email=email, password=PASSWORD, role=role, **extra)
        user.is_verified = True
        user.save(update_fields=["is_verified"])
        self.stdout.write(f"  کاربر {email} ساخته شد")
        return user

    def _achievements(self, users) -> None:
        for email, title, issuer, year, description in ACHIEVEMENTS:
            PsychologistAchievement.objects.get_or_create(
                psychologist_id=users[email].id,
                title=title,
                defaults={"issuer": issuer, "year": year, "description": description},
            )

    def _links(self, users) -> dict[tuple[str, str], Relationship]:
        links = {}
        now = timezone.now()
        for patient_email, psy_email, status, days in LINKS:
            relationship, _ = Relationship.objects.get_or_create(
                patient_id=users[patient_email].id,
                psychologist_id=users[psy_email].id,
                defaults={
                    "status": status,
                    "approved_at": now - timedelta(days=days) if status == RelationshipStatus.ACTIVE else None,
                },
            )
            links[(patient_email, psy_email)] = relationship
        return links

    def _announcement(self) -> None:
        SiteAnnouncement.objects.get_or_create(
            title="به سامانه‌ی رورشاخ خوش آمدید",
            defaults={
                "body": "نسخه‌ی آزمایشی سامانه فعال شد. در صورت مشاهده‌ی مشکل با پشتیبانی تماس بگیرید.",
                "is_published": True,
                "published_at": timezone.now() - timedelta(days=5),
            },
        )

    def _sessions(self, users, links) -> None:
        definition = TestDefinition.objects.filter(status=TestStatus.ACTIVE).order_by("code").first()
        version = published_version(definition.id)
        cards = {c.card_number: c for c in response_cards(version.id)}
        response_phase = version.phases.get(kind=PhaseKind.RESPONSE)
        clarification_phase = version.phases.get(kind=PhaseKind.CLARIFICATION)

        completed = self._session(
            users["patient@test.com"],
            users["psych@test.com"],
            links[("patient@test.com", "psych@test.com")],
            definition,
            version,
            SessionStatus.COMPLETED,
            clarification_phase,
        )
        if completed and not completed.responses.exists():
            self._protocol(completed, cards, response_phase, coded_by=users["psych@test.com"])
            completed.current_step = len(PROTOCOL)
            completed.save(update_fields=["current_step", "updated_at"])
            run_analysis(completed)
            self._audit(users, completed)

        in_progress = self._session(
            users["patient3@test.com"],
            users["psych@test.com"],
            links[("patient3@test.com", "psych@test.com")],
            definition,
            version,
            SessionStatus.IN_PROGRESS,
            response_phase,
            current_card=cards[4],
        )
        if in_progress and not in_progress.responses.exists():
            self._partial(in_progress, cards, response_phase)

    def _session(
        self, patient, psychologist, relationship, definition, version, status, phase, current_card=None
    ) -> AssessmentSession | None:
        existing = AssessmentSession.objects.filter(
            patient_id=patient.id, psychologist_id=psychologist.id
        ).first()
        if existing:
            return existing
        now = timezone.now()
        administration = empty_administration()
        administration["response_phase_started_at"] = (now - timedelta(days=12)).isoformat()
        administration["card_started_at"] = now.isoformat()
        if status == SessionStatus.COMPLETED:
            administration["clarification_phase_started_at"] = (now - timedelta(days=12)).isoformat()
            administration["card_started_at"] = None
            administration["card_turns"] = 3
        return AssessmentSession.objects.create(
            patient=patient.patient_profile,
            psychologist=psychologist.psychologist_profile,
            relationship=relationship,
            test_definition=definition,
            test_version=version,
            status=status,
            current_phase=phase,
            current_card=current_card,
            current_step=0,
            started_at=now - timedelta(days=12),
            completed_at=now - timedelta(days=12) if status == SessionStatus.COMPLETED else None,
            administration=administration,
        )

    def _protocol(self, session, cards, phase, coded_by) -> None:
        from apps.assessments.models import AssessmentResponse
        from apps.assessments.rpas.codes import CLARIFICATION_REASONS

        def reasons_for(coding):
            return [
                reason["code"]
                for reason in CLARIFICATION_REASONS
                if any(d in coding["determinants"] for d in reason["suggests"])
            ]

        base = session.started_at
        per_card_counter: dict[int, int] = {}
        for index, (card_number, text, why, marks, coding, turns) in enumerate(PROTOCOL, start=1):
            per_card_counter[card_number] = per_card_counter.get(card_number, 0) + 1
            submitted = base + timedelta(seconds=index * 45)
            AssessmentResponse.objects.create(
                assessment=session,
                phase=phase,
                card=cards[card_number],
                card_number=card_number,
                client_response_id=f"seed-{session.pk}-{index}",
                sequence=index,
                card_response_number=per_card_counter[card_number],
                response_text=text,
                server_started_at=submitted - timedelta(seconds=30),
                server_submitted_at=submitted,
                duration_ms=30_000,
                measurement_data={
                    "reaction_time_ms": 4_000 + index * 250,
                    "card_turns": turns,
                    "final_rotation": 0,
                },
                clarification={
                    "whole": marks is None,
                    "location_marks": marks or [],
                    "reasons": reasons_for(coding),
                    "text": why,
                    "submitted_at": (submitted + timedelta(minutes=20)).isoformat(),
                },
                coding=coding,
                coded_by=coded_by,
                coded_at=submitted + timedelta(days=1),
            )

    def _partial(self, session, cards, phase) -> None:
        from apps.assessments.models import AssessmentResponse

        base = session.started_at
        per_card_counter: dict[int, int] = {}
        for index, (card_number, text) in enumerate(PARTIAL, start=1):
            per_card_counter[card_number] = per_card_counter.get(card_number, 0) + 1
            submitted = base + timedelta(seconds=index * 40)
            AssessmentResponse.objects.create(
                assessment=session,
                phase=phase,
                card=cards[card_number],
                card_number=card_number,
                client_response_id=f"seed-{session.pk}-{index}",
                sequence=index,
                card_response_number=per_card_counter[card_number],
                response_text=text,
                server_started_at=submitted - timedelta(seconds=25),
                server_submitted_at=submitted,
                duration_ms=25_000,
                measurement_data={"reaction_time_ms": 5_000, "card_turns": 0, "final_rotation": 0},
            )

    def _conversations(self, links) -> None:
        for relationship in links.values():
            if relationship.status != RelationshipStatus.ACTIVE:
                continue
            existing = (
                Conversation.objects.filter(participants__user_id=relationship.patient_id)
                .filter(participants__user_id=relationship.psychologist_id)
                .first()
            )
            if existing:
                continue
            conversation = Conversation.objects.create()
            ConversationParticipant.objects.bulk_create(
                [
                    ConversationParticipant(conversation=conversation, user_id=relationship.patient_id),
                    ConversationParticipant(
                        conversation=conversation, user_id=relationship.psychologist_id
                    ),
                ]
            )
            Message.objects.create(
                conversation=conversation,
                sender_id=relationship.psychologist_id,
                content="سلام، خوش آمدید. هر وقت آماده بودید می‌توانید آزمون را شروع کنید.",
            )

    def _audit(self, users, session) -> None:
        for actor_email, action in [
            ("patient@test.com", AuditAction.PATIENT_STARTED_ASSESSMENT),
            ("patient@test.com", AuditAction.PATIENT_COMPLETED_ASSESSMENT),
            ("psych@test.com", AuditAction.PSYCHOLOGIST_VIEWED_ASSESSMENT),
        ]:
            actor = users[actor_email]
            AuditLog.objects.get_or_create(
                actor=actor,
                action=action,
                target_type="AssessmentSession",
                target_id=str(session.pk),
                defaults={"actor_email": actor.email},
            )
