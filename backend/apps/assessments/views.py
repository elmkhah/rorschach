"""
Assessment API (docs/04 §5, extended by docs/10 §3).

Assessment execution is not a ModelViewSet: it is a state machine exposed as
explicit actions — start, responses, next, clarifications, complete, events.
Views validate and delegate; the rules live in `services.py`.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Role
from apps.assessments import services
from apps.assessments.models import AssessmentReport
from apps.assessments.permissions import own_session, readable_session
from apps.assessments.selectors import filter_sessions, sessions_for, with_counts
from apps.assessments.serializers import (
    AdministrationEventSerializer,
    AssessmentAnalysisSerializer,
    AssessmentCardSerializer,
    AssessmentReportSerializer,
    AssessmentResponseSerializer,
    AssessmentSessionSerializer,
    ClarifySerializer,
    ResponseCodingSerializer,
    RunStateSerializer,
    SubmitResponseSerializer,
    TestDefinitionSerializer,
)
from apps.assessments.state import build_state, session_responses
from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.catalog.models import TestDefinition, TestStatus
from apps.catalog.selectors import response_cards
from common.permissions import IsPatient, IsPsychologist, IsPsychologistOrAdmin


def _state_response(request, state, code: int = status.HTTP_200_OK) -> Response:
    return Response(RunStateSerializer(state, context={"request": request}).data, status=code)


class TestListView(APIView):
    """`GET /tests/` — active test definitions."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=TestDefinitionSerializer(many=True))
    def get(self, request):
        tests = TestDefinition.objects.filter(status=TestStatus.ACTIVE)
        return Response(TestDefinitionSerializer(tests, many=True).data)


class SessionListView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssessmentSessionSerializer

    @extend_schema(responses=AssessmentSessionSerializer(many=True))
    def get(self, request):
        sessions = filter_sessions(sessions_for(request.user), request.query_params)
        return Response(
            AssessmentSessionSerializer(sessions, many=True, context={"request": request}).data
        )

    @extend_schema(responses=AssessmentSessionSerializer)
    def post(self, request):
        psychologist_id = request.data.get("psychologist_id")
        if not psychologist_id:
            return Response(
                {"detail": "روان‌شناس را انتخاب کنید.", "code": "invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session = services.create_session(request.user, psychologist_id)
        return Response(
            AssessmentSessionSerializer(
                with_counts(type(session).objects.filter(pk=session.pk)).first(),
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsPatient()]
        return super().get_permissions()


class SessionDetailView(APIView):
    """Owner, linked psychologist or admin — checked per object, never by role alone."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=AssessmentSessionSerializer)
    def get(self, request, pk):
        session = readable_session(request.user, pk)
        return Response(
            AssessmentSessionSerializer(session, context={"request": request}).data
        )


# ---- examinee runtime -------------------------------------------------------


class RunStateView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(responses=RunStateSerializer)
    def get(self, request, pk):
        session = own_session(request.user, pk)
        return _state_response(request, build_state(session))


class StartView(APIView):
    permission_classes = [IsPatient]
    throttle_scope = "write"

    @extend_schema(request=None, responses=RunStateSerializer)
    def post(self, request, pk):
        session = own_session(request.user, pk)
        return _state_response(request, services.start(session))


class SubmitResponseView(APIView):
    permission_classes = [IsPatient]
    throttle_scope = "write"

    @extend_schema(request=SubmitResponseSerializer, responses=None)
    def post(self, request, pk):
        session = own_session(request.user, pk)
        payload = SubmitResponseSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        response, state = services.submit_response(session, payload.validated_data)
        return Response(
            {
                "response": AssessmentResponseSerializer(response).data,
                "state": RunStateSerializer(state, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class NextView(APIView):
    permission_classes = [IsPatient]
    throttle_scope = "write"

    @extend_schema(request=None, responses=None)
    def post(self, request, pk):
        session = own_session(request.user, pk)
        prompted, state = services.advance(session)
        return Response(
            {
                "prompt": prompted,
                "state": RunStateSerializer(state, context={"request": request}).data,
            }
        )


class ClarifyView(APIView):
    permission_classes = [IsPatient]
    throttle_scope = "write"

    @extend_schema(request=ClarifySerializer, responses=RunStateSerializer)
    def post(self, request, pk):
        session = own_session(request.user, pk)
        payload = ClarifySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        return _state_response(request, services.clarify(session, payload.validated_data))


class CompleteView(APIView):
    permission_classes = [IsPatient]
    throttle_scope = "write"

    @extend_schema(request=None, responses=RunStateSerializer)
    def post(self, request, pk):
        session = own_session(request.user, pk)
        return _state_response(request, services.complete(session))


class EventsView(APIView):
    """Administration observations — interruptions and leaving the page."""

    permission_classes = [IsPatient]

    @extend_schema(request=AdministrationEventSerializer, responses=None)
    def post(self, request, pk):
        session = own_session(request.user, pk)
        payload = AdministrationEventSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.log_event(session, payload.validated_data["type"])
        return Response({})


# ---- psychologist / admin (BR-14) -------------------------------------------


class SessionDetailFullView(APIView):
    """
    The full protocol: raw responses, measurements, coding and analysis.
    Never shown to the examinee (BR-14).
    """

    permission_classes = [IsPsychologistOrAdmin]

    @extend_schema(responses=None)
    def get(self, request, pk):
        session = readable_session(request.user, pk)
        if request.user.role == Role.PSYCHOLOGIST:
            record(
                request.user,
                AuditAction.PSYCHOLOGIST_VIEWED_ASSESSMENT,
                "AssessmentSession",
                session.pk,
            )
        analysis = services.ensure_analysis(session)
        report = AssessmentReport.objects.filter(assessment=session).first()
        context = {"request": request}
        return Response(
            {
                "session": AssessmentSessionSerializer(session, context=context).data,
                "cards": AssessmentCardSerializer(
                    response_cards(session.test_version_id), many=True, context=context
                ).data,
                "responses": AssessmentResponseSerializer(
                    session_responses(session), many=True
                ).data,
                "analysis": AssessmentAnalysisSerializer(analysis).data if analysis else None,
                "report": AssessmentReportSerializer(report).data if report else None,
            }
        )


class CodingView(APIView):
    permission_classes = [IsPsychologist]
    throttle_scope = "write"

    @extend_schema(request=ResponseCodingSerializer, responses=AssessmentResponseSerializer)
    def put(self, request, pk, response_id):
        session = readable_session(request.user, pk)
        payload = ResponseCodingSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        response = services.save_coding(session, response_id, payload.validated_data, request.user)
        return Response(AssessmentResponseSerializer(response).data)


class AnalysisView(APIView):
    permission_classes = [IsPsychologistOrAdmin]
    throttle_scope = "write"

    @extend_schema(request=None, responses=AssessmentAnalysisSerializer)
    def post(self, request, pk):
        session = readable_session(request.user, pk)
        analysis = services.analyze(session, actor=request.user)
        return Response(AssessmentAnalysisSerializer(analysis).data)
