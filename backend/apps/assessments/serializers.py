"""
Assessment serializers — shapes from `core/models/assessment.models.ts`.

Denormalised display fields (`test_name`, `patient_name`, `total_cards`, …) are
part of the contract: the list pages render them directly.
"""
from rest_framework import serializers

from apps.assessments.models import (
    AssessmentAnalysis,
    AssessmentReport,
    AssessmentResponse,
    AssessmentSession,
    ContentDetection,
)
from apps.assessments.rpas.codes import CONTENT_LABELS
from apps.catalog.models import AssessmentCard, PhaseKind, TestDefinition, TestPhase, TestVersion


class CardConfigurationSerializer(serializers.Serializer):
    required = serializers.BooleanField(default=True)
    min_responses = serializers.IntegerField(min_value=0, max_value=20, default=2)
    max_responses = serializers.IntegerField(min_value=1, max_value=50, allow_null=True, required=False)
    allow_rotation = serializers.BooleanField(default=True)
    allowed_responses = serializers.ListField(required=False, default=list)
    metadata = serializers.DictField(required=False, default=dict)


class AssessmentCardSerializer(serializers.ModelSerializer):
    test_version_id = serializers.UUIDField(read_only=True)
    phase_id = serializers.UUIDField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = AssessmentCard
        fields = (
            "id",
            "test_version_id",
            "phase_id",
            "card_number",
            "title",
            "image_url",
            "display_order",
            "configuration",
        )

    def get_image_url(self, obj) -> str | None:
        """
        A card image has two possible homes, and they resolve differently.

        `image_asset` is a file Django or object storage serves, so it needs an
        absolute URL. `image_path` points at a file the Angular app ships in
        `public/` — it must stay relative so the browser resolves it against the
        frontend origin; making it absolute would aim it at Django and 404.
        """
        if obj.image_asset and obj.image_asset.url:
            request = self.context.get("request")
            url = obj.image_asset.url
            return request.build_absolute_uri(url) if request else url
        return obj.image_path or None


class TestPhaseSerializer(serializers.ModelSerializer):
    test_version_id = serializers.UUIDField(read_only=True)
    cards = AssessmentCardSerializer(many=True, read_only=True)

    class Meta:
        model = TestPhase
        fields = ("id", "test_version_id", "kind", "name", "description", "display_order", "cards")


class TestVersionSerializer(serializers.ModelSerializer):
    test_definition_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = TestVersion
        fields = ("id", "test_definition_id", "version", "is_published", "published_at", "created_at")


class TestVersionDetailSerializer(TestVersionSerializer):
    phases = TestPhaseSerializer(many=True, read_only=True)

    class Meta(TestVersionSerializer.Meta):
        fields = (*TestVersionSerializer.Meta.fields, "phases")


class TestDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestDefinition
        fields = (
            "id",
            "code",
            "name",
            "description",
            "status",
            "coding_system",
            "methodology_reference",
            "source_document",
            "created_at",
        )


class TestDefinitionWithVersionsSerializer(TestDefinitionSerializer):
    versions = TestVersionSerializer(many=True, read_only=True)

    class Meta(TestDefinitionSerializer.Meta):
        fields = (*TestDefinitionSerializer.Meta.fields, "versions")


class AssessmentSessionSerializer(serializers.ModelSerializer):
    patient_id = serializers.UUIDField(read_only=True)
    psychologist_id = serializers.UUIDField(read_only=True)
    relationship_id = serializers.UUIDField(read_only=True)
    test_definition_id = serializers.UUIDField(read_only=True)
    test_version_id = serializers.UUIDField(read_only=True)
    current_phase = serializers.UUIDField(source="current_phase_id", read_only=True, allow_null=True)
    current_card = serializers.UUIDField(source="current_card_id", read_only=True, allow_null=True)

    test_name = serializers.CharField(source="test_definition.name", read_only=True)
    test_version = serializers.CharField(source="test_version.version", read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    psychologist_name = serializers.CharField(source="psychologist.full_name", read_only=True)
    total_cards = serializers.SerializerMethodField()
    answered_cards = serializers.SerializerMethodField()

    class Meta:
        model = AssessmentSession
        fields = (
            "id",
            "patient_id",
            "psychologist_id",
            "relationship_id",
            "test_definition_id",
            "test_version_id",
            "status",
            "current_phase",
            "current_card",
            "current_step",
            "started_at",
            "paused_at",
            "completed_at",
            "created_at",
            "updated_at",
            "administration",
            "test_name",
            "test_version",
            "patient_name",
            "psychologist_name",
            "total_cards",
            "answered_cards",
        )

    def get_total_cards(self, obj) -> int:
        # Annotated by the selector on list endpoints; computed otherwise.
        value = getattr(obj, "total_cards_count", None)
        if value is not None:
            return value
        from apps.catalog.selectors import response_cards

        return len(response_cards(obj.test_version_id))

    def get_answered_cards(self, obj) -> int:
        value = getattr(obj, "answered_cards_count", None)
        if value is not None:
            return value
        return obj.responses.values("card_id").distinct().count()


class AssessmentResponseSerializer(serializers.ModelSerializer):
    assessment_id = serializers.UUIDField(read_only=True)
    phase_id = serializers.UUIDField(read_only=True)
    card_id = serializers.UUIDField(read_only=True)
    coded_by = serializers.UUIDField(source="coded_by_id", read_only=True, allow_null=True)

    class Meta:
        model = AssessmentResponse
        fields = (
            "id",
            "assessment_id",
            "phase_id",
            "card_id",
            "card_number",
            "client_response_id",
            "sequence",
            "card_response_number",
            "response_text",
            "server_started_at",
            "server_submitted_at",
            "client_started_at",
            "client_submitted_at",
            "duration_ms",
            "client_metadata",
            "measurement_data",
            "clarification",
            "coding",
            "coded_by",
            "coded_at",
        )


class MeasurementsSerializer(serializers.Serializer):
    reaction_time_ms = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    card_turns = serializers.IntegerField(required=False, default=0, min_value=0, max_value=999)
    final_rotation = serializers.ChoiceField(choices=[0, 90, 180, 270], required=False, default=0)


class SubmitResponseSerializer(serializers.Serializer):
    client_response_id = serializers.CharField(max_length=64)
    card_id = serializers.UUIDField()
    response_text = serializers.CharField(
        allow_blank=True,
        trim_whitespace=True,
        error_messages={"blank": "متن پاسخ خالی است.", "required": "متن پاسخ خالی است."},
    )
    client_started_at = serializers.DateTimeField(required=False, allow_null=True)
    client_submitted_at = serializers.DateTimeField(required=False, allow_null=True)
    measurements = MeasurementsSerializer(required=False)

    def validate_response_text(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("متن پاسخ خالی است.")
        return text


class LocationMarkSerializer(serializers.Serializer):
    """
    A selected **area** on the unrotated card, normalised to 0..1: `(x, y)` is
    the top-left corner and `(w, h)` the size.

    An inkblot percept covers a region, not a pixel, so the examinee drags a box
    around what they saw rather than tapping a point. `w` and `h` default to
    zero, which keeps every clarification saved before regions existed — a bare
    `{x, y}` point — valid and readable; it is simply an area with no size.
    """

    x = serializers.FloatField(min_value=0, max_value=1)
    y = serializers.FloatField(min_value=0, max_value=1)
    w = serializers.FloatField(min_value=0, max_value=1, required=False, default=0)
    h = serializers.FloatField(min_value=0, max_value=1, required=False, default=0)

    def validate(self, attrs: dict) -> dict:
        """
        A selection cannot run off the card. Clamped rather than rejected: the
        client clamps the drag too, and a float rounding error at the edge of
        the image must not 400 an examinee in the middle of a test.
        """
        attrs["w"] = min(attrs["w"], 1 - attrs["x"])
        attrs["h"] = min(attrs["h"], 1 - attrs["y"])
        return attrs


class ClarifySerializer(serializers.Serializer):
    response_id = serializers.UUIDField()
    whole = serializers.BooleanField(default=False)
    location_marks = LocationMarkSerializer(many=True, required=False, default=list)
    reasons = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    text = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    client_submitted_at = serializers.DateTimeField(required=False, allow_null=True)


class AdministrationEventSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["INTERRUPTION", "TAB_HIDDEN"])


class ResponseCodingSerializer(serializers.Serializer):
    """
    Loose on purpose: unknown codes are dropped by `normalize_coding` rather than
    rejected, so a newer frontend catalog never 400s an otherwise valid coding.
    """

    location = serializers.CharField(required=False, allow_null=True)
    space = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    content = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    synthesis = serializers.BooleanField(required=False, default=False)
    vague = serializers.BooleanField(required=False, default=False)
    pair = serializers.BooleanField(required=False, default=False)
    form_quality = serializers.CharField(required=False, allow_null=True)
    popular = serializers.BooleanField(required=False, default=False)
    determinants = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    cognitive_codes = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    thematic_codes = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class AssessmentAnalysisSerializer(serializers.ModelSerializer):
    assessment_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = AssessmentAnalysis
        fields = (
            "id",
            "assessment_id",
            "algorithm_version",
            "status",
            "raw_analysis_data",
            "calculated_data",
            "generated_at",
        )


class ContentDetectionSerializer(serializers.ModelSerializer):
    """
    The AI hint layer (docs/14), in three readings of the same run:

    * `items` — the flat word list, ordered by response;
    * `responses` — the same words rolled up onto the answer they came from,
      which is the shape the coder reads: «این پاسخ در کدام دسته می‌افتد؟»;
    * `summary` — how often each content code appears across the protocol.
    """

    assessment_id = serializers.UUIDField(read_only=True)
    responses = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()

    class Meta:
        model = ContentDetection
        fields = (
            "id",
            "assessment_id",
            "status",
            "source",
            "model_name",
            "items",
            "responses",
            "summary",
            "error",
            "generated_at",
        )

    def get_responses(self, obj) -> list:
        """
        Every first-round answer, in order, with the categories it falls into.

        Answers where nothing was recognised are listed too, with an empty
        `contents` — a protocol row the coder must look at is more useful than
        a silently missing one, and inventing `NC` for them would be coding.
        """
        grouped: dict[str, list[dict]] = {}
        for item in obj.items or []:
            grouped.setdefault(str(item.get("response_id")), []).append(item)

        rows = []
        answers = obj.assessment.responses.filter(phase__kind=PhaseKind.RESPONSE).order_by("sequence")
        for answer in answers:
            words = grouped.get(str(answer.id), [])
            contents: list[str] = []
            for word in words:
                if word["content"] not in contents:
                    contents.append(word["content"])
            # The most confident word decides the headline category; ties keep
            # the order the words appear in the sentence.
            primary = max(words, key=lambda word: word.get("confidence") or 0)["content"] if words else None
            rows.append(
                {
                    "response_id": str(answer.id),
                    "sequence": answer.sequence,
                    "card_number": answer.card_number,
                    "response_text": answer.response_text,
                    "contents": contents,
                    "primary_content": primary,
                    "primary_label": CONTENT_LABELS.get(primary, "") if primary else "",
                    "words": words,
                }
            )
        return rows

    def get_summary(self, obj) -> dict:
        counts: dict[str, int] = {}
        for item in obj.items or []:
            code = item.get("content")
            if code:
                counts[code] = counts.get(code, 0) + 1
        return dict(sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])))


class AssessmentReportSerializer(serializers.ModelSerializer):
    assessment_id = serializers.UUIDField(read_only=True)
    generated_by = serializers.UUIDField(source="generated_by_id", read_only=True, allow_null=True)

    class Meta:
        model = AssessmentReport
        fields = (
            "assessment_id",
            "summary",
            "structured_result",
            "generated_at",
            "generated_by",
            "version",
        )


class RunStateSerializer(serializers.Serializer):
    """Backend-authoritative view handed to the examinee on every step."""

    session = AssessmentSessionSerializer()
    stage = serializers.CharField()
    card = AssessmentCardSerializer(allow_null=True)
    card_index = serializers.IntegerField()
    total_cards = serializers.IntegerField()
    card_responses = AssessmentResponseSerializer(many=True)
    prompted = serializers.BooleanField()
    pulled = serializers.BooleanField()
    target = AssessmentResponseSerializer(allow_null=True)
    clarification_index = serializers.IntegerField()
    clarification_total = serializers.IntegerField()
    min_responses = serializers.IntegerField()
    max_responses = serializers.IntegerField(allow_null=True)
