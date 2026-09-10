import { PatientProfile, PsychologistProfile, User } from './user.models';

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  ip_address: string;
  user_agent: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  storage_key: string;
  mime_type: string;
  size: number;
  checksum: string;
  url: string | null;
  created_at: string;
}

export interface AdminUserRow {
  user: User;
  name: string;
  patient_profile: PatientProfile | null;
  psychologist_profile: PsychologistProfile | null;
}

export interface AdminStats {
  users: number;
  patients: number;
  psychologists: number;
  pending_verifications: number;
  active_relationships: number;
  sessions_total: number;
  sessions_completed: number;
}

export type VerificationDecision = 'APPROVE' | 'REJECT' | 'SUSPEND';
