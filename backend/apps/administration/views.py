"""
Admin panel API (`/api/v1/admin/…`).

The admin is not a normal site user (docs/01 §1): these endpoints manage other
people's accounts, approve psychologists, version the test and read the audit
trail. Every one of them is admin-only.
"""
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Role, VerificationStatus
from apps.accounts.models import User
from apps.administration.serializers import (
    AdminStatsSerializer,
    AdminUserRowSerializer,
    AnnouncementInputSerializer,
    MediaAssetSerializer,
    VerifySerializer,
)
from apps.assessments.models import AssessmentSession
from apps.assessments.selectors import filter_sessions, with_counts
from apps.assessments.serializers import (
    AssessmentSessionSerializer,
    TestDefinitionWithVersionsSerializer,
    TestVersionDetailSerializer,
    TestVersionSerializer,
)
from apps.audit.models import AuditAction, AuditLog
from apps.audit.services import record
from apps.catalog.models import AssessmentCard, PhaseKind, TestDefinition, TestPhase, TestVersion
from apps.media.models import MediaAsset
from apps.notifications.models import SiteAnnouncement
from apps.notifications.views import SiteAnnouncementSerializer
from apps.profiles.models import PsychologistProfile
from apps.relationships.models import Relationship
from apps.relationships.serializers import RelationshipSerializer
from common.exceptions import ApiError, Conflict
from common.pagination import AdminPagination, AuditLogPagination
from common.permissions import IsAdmin


class AuditLogSerializer(serializers.ModelSerializer):
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor_id",
            "actor_email",
            "action",
            "target_type",
            "target_id",
            "ip_address",
            "user_agent",
            "metadata",
            "created_at",
        )


class AdminView(APIView):
    permission_classes = [IsAdmin]


class StatsView(AdminView):
    @extend_schema(responses=AdminStatsSerializer)
    def get(self, request):
        sessions = AssessmentSession.objects.all()
        return Response(
            AdminStatsSerializer(
                {
                    "users": User.objects.count(),
                    "patients": User.objects.filter(role=Role.PATIENT).count(),
                    "psychologists": User.objects.filter(role=Role.PSYCHOLOGIST).count(),
                    "pending_verifications": PsychologistProfile.objects.filter(
                        verification_status=VerificationStatus.PENDING_VERIFICATION
                    ).count(),
                    "active_relationships": Relationship.objects.filter(status="ACTIVE").count(),
                    "sessions_total": sessions.count(),
                    "sessions_completed": sessions.filter(status="COMPLETED").count(),
                }
            ).data
        )


class UserListView(ListAPIView):
    permission_classes = [IsAdmin]
    pagination_class = AdminPagination
    serializer_class = AdminUserRowSerializer

    def get_queryset(self):
        qs = User.objects.select_related("patient_profile", "psychologist_profile").order_by(
            "-created_at"
        )
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(patient_profile__first_name__icontains=search)
                | Q(patient_profile__last_name__icontains=search)
                | Q(psychologist_profile__first_name__icontains=search)
                | Q(psychologist_profile__last_name__icontains=search)
            )
        return qs


class ToggleActiveView(AdminView):
    throttle_scope = "write"

    @extend_schema(request=None, responses=AdminUserRowSerializer)
    def post(self, request, pk):
        user = User.objects.filter(pk=pk).first()
        if user is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "کاربر یافت نشد.")
        if user.id == request.user.id:
            raise ApiError(status.HTTP_400_BAD_REQUEST, "نمی‌توانید حساب خودتان را غیرفعال کنید.")
        user.is_active = not user.is_active
        user.save(update_fields=["is_active", "updated_at"])
        record(
            request.user,
            AuditAction.USER_ACTIVATED if user.is_active else AuditAction.USER_DEACTIVATED,
            "User",
            user.pk,
        )
        return Response(AdminUserRowSerializer(user, context={"request": request}).data)


class PsychologistListView(AdminView):
    @extend_schema(responses=AdminUserRowSerializer(many=True))
    def get(self, request):
        qs = PsychologistProfile.objects.select_related("user").prefetch_related("documents")
        verification_status = request.query_params.get("verification_status")
        if verification_status:
            qs = qs.filter(verification_status=verification_status)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(professional_code__icontains=search)
            )
        users = [p.user for p in qs]
        return Response(
            AdminUserRowSerializer(users, many=True, context={"request": request}).data
        )


class VerifyView(AdminView):
    """BR-01: only an admin moves a psychologist out of PENDING_VERIFICATION."""

    throttle_scope = "write"
    DECISIONS = {
        "APPROVE": (VerificationStatus.APPROVED, AuditAction.PSYCHOLOGIST_PROFILE_APPROVED),
        "REJECT": (VerificationStatus.REJECTED, AuditAction.PSYCHOLOGIST_PROFILE_REJECTED),
        "SUSPEND": (VerificationStatus.SUSPENDED, AuditAction.PSYCHOLOGIST_PROFILE_SUSPENDED),
    }

    @extend_schema(request=VerifySerializer, responses=AdminUserRowSerializer)
    def post(self, request, pk):
        profile = (
            PsychologistProfile.objects.select_related("user").filter(pk=pk).first()
        )
        if profile is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "روان‌شناس یافت نشد.")
        payload = VerifySerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        new_status, action = self.DECISIONS[payload.validated_data["decision"]]
        profile.verification_status = new_status
        profile.verification_note = payload.validated_data.get("note") or ""
        profile.verified_at = timezone.now()
        profile.save(
            update_fields=["verification_status", "verification_note", "verified_at", "updated_at"]
        )
        record(
            request.user,
            action,
            "PsychologistProfile",
            profile.pk,
            {"note": profile.verification_note},
        )
        return Response(AdminUserRowSerializer(profile.user, context={"request": request}).data)


class RelationshipListView(AdminView):
    @extend_schema(responses=RelationshipSerializer(many=True))
    def get(self, request):
        qs = Relationship.objects.select_related("patient", "psychologist")
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(RelationshipSerializer(qs, many=True, context={"request": request}).data)


class AssessmentListView(AdminView):
    @extend_schema(responses=AssessmentSessionSerializer(many=True))
    def get(self, request):
        qs = with_counts(
            AssessmentSession.objects.select_related(
                "patient", "psychologist", "test_definition", "test_version"
            )
        )
        return Response(
            AssessmentSessionSerializer(
                filter_sessions(qs, request.query_params), many=True, context={"request": request}
            ).data
        )


class TestListView(AdminView):
    @extend_schema(responses=TestDefinitionWithVersionsSerializer(many=True))
    def get(self, request):
        tests = TestDefinition.objects.prefetch_related("versions")
        return Response(TestDefinitionWithVersionsSerializer(tests, many=True).data)


class TestVersionDetailView(AdminView):
    @extend_schema(responses=TestVersionDetailSerializer)
    def get(self, request, pk):
        version = (
            TestVersion.objects.prefetch_related("phases__cards__image_asset").filter(pk=pk).first()
        )
        if version is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "نسخه یافت نشد.")
        return Response(TestVersionDetailSerializer(version, context={"request": request}).data)


class CloneVersionView(AdminView):
    """
    BR-04: a published version is immutable, so editing means cloning it into a
    new draft (phases and cards included) and editing that.
    """

    throttle_scope = "write"

    @extend_schema(request=None, responses=TestVersionSerializer)
    def post(self, request, pk):
        source = TestVersion.objects.filter(pk=pk).first()
        if source is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "نسخه یافت نشد.")

        siblings = list(
            TestVersion.objects.filter(test_definition_id=source.test_definition_id).order_by(
                "created_at"
            )
        )
        major, minor = (*siblings[-1].version.split("."), "0")[:2]
        clone = TestVersion.objects.create(
            test_definition_id=source.test_definition_id,
            version=f"{int(major)}.{int(minor) + 1}",
            is_published=False,
        )
        for phase in source.phases.all():
            new_phase = TestPhase.objects.create(
                test_version=clone,
                kind=phase.kind,
                name=phase.name,
                description=phase.description,
                display_order=phase.display_order,
            )
            for card in phase.cards.all():
                AssessmentCard.objects.create(
                    test_version=clone,
                    phase=new_phase,
                    card_number=card.card_number,
                    title=card.title,
                    image_asset=card.image_asset,
                    image_path=card.image_path,
                    display_order=card.display_order,
                    configuration=dict(card.configuration),
                )
        record(
            request.user,
            AuditAction.TEST_VERSION_CREATED,
            "TestVersion",
            clone.pk,
            {"from": str(source.pk)},
        )
        return Response(TestVersionSerializer(clone).data, status=status.HTTP_201_CREATED)


class PublishVersionView(AdminView):
    throttle_scope = "write"

    @extend_schema(request=None, responses=TestVersionSerializer)
    def post(self, request, pk):
        version = TestVersion.objects.filter(pk=pk).first()
        if version is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "نسخه یافت نشد.")
        if version.is_published:
            raise Conflict("این نسخه قبلاً منتشر شده است.")
        if not version.cards.filter(phase__kind=PhaseKind.RESPONSE).exists():
            raise Conflict("نسخه‌ی بدون کارت قابل انتشار نیست.")
        version.is_published = True
        version.published_at = timezone.now()
        version.save(update_fields=["is_published", "published_at"])
        record(request.user, AuditAction.TEST_VERSION_PUBLISHED, "TestVersion", version.pk)
        return Response(TestVersionSerializer(version).data)


class CardUpdateView(AdminView):
    throttle_scope = "write"

    @extend_schema(request=None, responses=None)
    def patch(self, request, pk):
        from apps.assessments.serializers import AssessmentCardSerializer, CardConfigurationSerializer

        card = AssessmentCard.objects.select_related("test_version").filter(pk=pk).first()
        if card is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "کارت یافت نشد.")
        if card.test_version.is_published:
            raise Conflict("نسخه‌ی منتشرشده قابل ویرایش نیست؛ یک نسخه‌ی جدید بسازید.")

        if "title" in request.data:
            card.title = request.data["title"]
        if request.data.get("configuration"):
            config = CardConfigurationSerializer(data=request.data["configuration"])
            config.is_valid(raise_exception=True)
            card.configuration = {**card.configuration, **config.validated_data}
        card.save(update_fields=["title", "configuration"])
        return Response(AssessmentCardSerializer(card, context={"request": request}).data)


class AnnouncementListView(AdminView):
    throttle_scope = "write"

    @extend_schema(responses=SiteAnnouncementSerializer(many=True))
    def get(self, request):
        return Response(SiteAnnouncementSerializer(SiteAnnouncement.objects.all(), many=True).data)

    @extend_schema(request=AnnouncementInputSerializer, responses=SiteAnnouncementSerializer)
    def post(self, request):
        payload = AnnouncementInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        announcement = SiteAnnouncement.objects.create(
            **data,
            published_at=timezone.now() if data.get("is_published") else None,
        )
        return Response(
            SiteAnnouncementSerializer(announcement).data, status=status.HTTP_201_CREATED
        )


class AnnouncementDetailView(AdminView):
    throttle_scope = "write"

    @extend_schema(request=AnnouncementInputSerializer, responses=SiteAnnouncementSerializer)
    def patch(self, request, pk):
        announcement = SiteAnnouncement.objects.filter(pk=pk).first()
        if announcement is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "یافت نشد.")
        payload = AnnouncementInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        if data.get("is_published") and not announcement.is_published:
            announcement.published_at = timezone.now()
        for field, value in data.items():
            setattr(announcement, field, value)
        announcement.save()
        return Response(SiteAnnouncementSerializer(announcement).data)

    @extend_schema(responses=None)
    def delete(self, request, pk):
        SiteAnnouncement.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MediaListView(AdminView):
    @extend_schema(responses=MediaAssetSerializer(many=True))
    def get(self, request):
        return Response(
            MediaAssetSerializer(
                MediaAsset.objects.all(), many=True, context={"request": request}
            ).data
        )


class AuditLogListView(ListAPIView):
    permission_classes = [IsAdmin]
    pagination_class = AuditLogPagination
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        qs = AuditLog.objects.all()
        action = self.request.query_params.get("action")
        if action:
            qs = qs.filter(action=action)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(actor_email__icontains=search) | Q(target_id__icontains=search))
        return qs
