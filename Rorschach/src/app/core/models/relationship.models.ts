import { PatientProfile, PsychologistProfile } from './user.models';

export type RelationshipStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED';

export interface Relationship {
  id: string;
  patient_id: string;
  psychologist_id: string;
  status: RelationshipStatus;
  requested_at: string;
  approved_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  patient?: PatientProfile;
  psychologist?: PsychologistProfile;
}

/** Psychologist as listed to a patient, with the caller's relationship status (if any). */
export interface PsychologistSummary extends PsychologistProfile {
  relationship_id: string | null;
  relationship_status: RelationshipStatus | null;
}
