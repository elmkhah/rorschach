"""Relationship endpoints and the psychologist's view of one linked patient."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Role
from apps.assessments.selectors import sessions_between
from apps.assessments.serializers import AssessmentSessionSerializer
from apps.profiles.models import PatientProfile
from apps.profiles.serializers import PatientProfileSerializer
from apps.relationships import services
from apps.relationships.models import Relationship, RelationshipStatus
from apps.relationships.serializers import RelationshipRequestSerializer, RelationshipSerializer
from common.exceptions import ApiError
from common.permissions import IsPatient, IsPsychologist


def _visible(user):
    qs = Relationship.objects.select_related(
        "patient", "patient__user", "psychologist", "psychologist__user"
    ).prefetch_related("psychologist__documents")
    if user.role == Role.ADMIN:
        return qs
    return qs.filter(patient_id=user.id) | qs.filter(psychologist_id=user.id)


class RelationshipListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=RelationshipSerializer(many=True))
    def get(self, request):
        qs = _visible(request.user)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(
            RelationshipSerializer(
                qs.order_by("-updated_at"), many=True, context={"request": request}
            ).data
        )

    @extend_schema(request=RelationshipRequestSerializer, responses=RelationshipSerializer)
    def post(self, request):
        payload = RelationshipRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        relationship = services.request_relationship(
            request.user, payload.validated_data["psychologist_id"]
        )
        return Response(
            RelationshipSerializer(relationship, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsPatient()]
        return super().get_permissions()


class RelationshipActionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "write"
    action = "approve"

    @extend_schema(request=None, responses=RelationshipSerializer)
    def post(self, request, pk):
        relationship = (
            Relationship.objects.select_related("patient", "psychologist").filter(pk=pk).first()
        )
        if relationship is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "رابطه یافت نشد.")
        relationship = services.transition(request.user, relationship, self.action)
        return Response(RelationshipSerializer(relationship, context={"request": request}).data)


class ApproveView(RelationshipActionView):
    permission_classes = [IsPsychologist]
    action = "approve"


class RejectView(RelationshipActionView):
    permission_classes = [IsPsychologist]
    action = "reject"


class RevokeView(RelationshipActionView):
    """Either party — or an admin — can end an established link."""

    permission_classes = [IsAuthenticated]
    action = "revoke"


class PatientDetailView(APIView):
    """
    `GET /patients/{id}/` — BR-02: reachable only through an ACTIVE relationship,
    regardless of any assessment the psychologist may have seen in the past.
    """

    permission_classes = [IsPsychologist]

    @extend_schema(responses=None)
    def get(self, request, pk):
        relationship = (
            Relationship.objects.select_related("patient", "patient__user")
            .filter(patient_id=pk, psychologist_id=request.user.id)
            .first()
        )
        if relationship is None or relationship.status != RelationshipStatus.ACTIVE:
            raise ApiError(status.HTTP_403_FORBIDDEN, "دسترسی به اطلاعات این بیمار ندارید.")

        patient = PatientProfile.objects.select_related("user").get(pk=pk)
        context = {"request": request}
        return Response(
            {
                "patient": PatientProfileSerializer(patient, context=context).data,
                "email": patient.user.email,
                "relationship": RelationshipSerializer(relationship, context=context).data,
                "sessions": AssessmentSessionSerializer(
                    sessions_between(pk, request.user.id), many=True, context=context
                ).data,
            }
        )
