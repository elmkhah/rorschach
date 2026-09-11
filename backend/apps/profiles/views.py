"""
Psychologist directory, achievements and verification documents.

`GET /psychologists/` is the only paginated list here (page_size 12) — see
`common/pagination.py` for why the page sizes are fixed per endpoint.
"""
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Role, VerificationStatus
from apps.accounts.serializers import MeSerializer
from apps.accounts.services import me_payload
from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.profiles.models import PsychologistAchievement, PsychologistProfile, VerificationDocument
from apps.profiles.selectors import approved_psychologists, with_relationship_for
from apps.profiles.serializers import (
    PsychologistAchievementSerializer,
    PsychologistSummarySerializer,
)
from common.exceptions import ApiError
from common.pagination import PsychologistPagination
from common.permissions import IsPsychologist

MAX_DOCUMENTS = 10
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


def _relationship_scope(request):
    """Only a patient sees their own relationship status on the list."""
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated or user.role != Role.PATIENT:
        return None
    return user.id


class PsychologistListView(ListAPIView):
    serializer_class = PsychologistSummarySerializer
    pagination_class = PsychologistPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation
            return PsychologistProfile.objects.none()
        qs = approved_psychologists(self.request.query_params.get("search"))
        return with_relationship_for(qs, _relationship_scope(self.request))


class PsychologistDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PsychologistSummarySerializer)
    def get(self, request, pk):
        qs = with_relationship_for(approved_psychologists(), _relationship_scope(request))
        profile = qs.filter(pk=pk).first()
        if profile is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "روان‌شناس یافت نشد.")
        return Response(
            {
                "psychologist": PsychologistSummarySerializer(profile, context={"request": request}).data,
                "achievements": PsychologistAchievementSerializer(
                    profile.achievements.all(), many=True
                ).data,
            }
        )


class MyAchievementsView(APIView):
    permission_classes = [IsPsychologist]
    throttle_scope = "write"

    @extend_schema(responses=PsychologistAchievementSerializer(many=True))
    def get(self, request):
        achievements = PsychologistAchievement.objects.filter(psychologist_id=request.user.id)
        return Response(PsychologistAchievementSerializer(achievements, many=True).data)

    @extend_schema(request=PsychologistAchievementSerializer, responses=PsychologistAchievementSerializer)
    def post(self, request):
        data = PsychologistAchievementSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        achievement = data.save(psychologist=request.user.psychologist_profile)
        return Response(
            PsychologistAchievementSerializer(achievement).data,
            status=status.HTTP_201_CREATED,
        )


class MyAchievementDetailView(APIView):
    permission_classes = [IsPsychologist]
    throttle_scope = "write"

    @extend_schema(responses=None)
    def delete(self, request, pk):
        PsychologistAchievement.objects.filter(pk=pk, psychologist_id=request.user.id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyDocumentsView(APIView):
    """
    `POST /psychologists/me/documents/` — multipart upload of licence documents.

    Uploading moves REGISTERED / REJECTED to PENDING_VERIFICATION; an already
    approved or suspended profile keeps its status (only an admin changes that).
    """

    permission_classes = [IsPsychologist]
    throttle_scope = "write"

    @extend_schema(request=None, responses=MeSerializer)
    @transaction.atomic
    def post(self, request):
        files = request.FILES.getlist("documents")
        if not files:
            raise ApiError(status.HTTP_400_BAD_REQUEST, "حداقل یک فایل انتخاب کنید.")
        profile: PsychologistProfile = request.user.psychologist_profile
        if profile.documents.count() + len(files) > MAX_DOCUMENTS:
            raise ApiError(status.HTTP_400_BAD_REQUEST, "حداکثر ۱۰ مدرک می‌توانید بارگذاری کنید.")

        for upload in files:
            if upload.size > MAX_DOCUMENT_BYTES:
                raise ApiError(
                    status.HTTP_400_BAD_REQUEST,
                    f"حجم فایل «{upload.name}» بیش از ۱۰ مگابایت است.",
                )
            if upload.content_type not in ALLOWED_DOCUMENT_TYPES:
                raise ApiError(
                    status.HTTP_400_BAD_REQUEST,
                    f"نوع فایل «{upload.name}» پشتیبانی نمی‌شود (PDF یا تصویر).",
                )

        for upload in files:
            VerificationDocument.objects.create(profile=profile, name=upload.name, file=upload)
        if profile.verification_status in (
            VerificationStatus.REGISTERED,
            VerificationStatus.REJECTED,
        ):
            profile.verification_status = VerificationStatus.PENDING_VERIFICATION
            profile.save(update_fields=["verification_status", "updated_at"])

        record(
            request.user,
            AuditAction.PSYCHOLOGIST_DOCUMENTS_UPLOADED,
            "PsychologistProfile",
            profile.pk,
            {"count": len(files)},
        )
        request.user.refresh_from_db()
        return Response(MeSerializer(me_payload(request.user), context={"request": request}).data)
