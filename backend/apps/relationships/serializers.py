"""Relationship serializers — shapes from `core/models/relationship.models.ts`."""
from rest_framework import serializers

from apps.profiles.serializers import PatientProfileSerializer, PsychologistProfileSerializer
from apps.relationships.models import Relationship


class RelationshipSerializer(serializers.ModelSerializer):
    patient_id = serializers.UUIDField(read_only=True)
    psychologist_id = serializers.UUIDField(read_only=True)
    patient = PatientProfileSerializer(read_only=True)
    psychologist = PsychologistProfileSerializer(read_only=True)

    class Meta:
        model = Relationship
        fields = (
            "id",
            "patient_id",
            "psychologist_id",
            "status",
            "requested_at",
            "approved_at",
            "revoked_at",
            "created_at",
            "updated_at",
            "patient",
            "psychologist",
        )


class RelationshipRequestSerializer(serializers.Serializer):
    psychologist_id = serializers.UUIDField()
