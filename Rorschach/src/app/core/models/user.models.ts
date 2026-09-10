// Field names mirror the API contract (docs/03-data-model-er.md) — snake_case on purpose.

export type Role = 'PATIENT' | 'PSYCHOLOGIST' | 'ADMIN';

export type VerificationStatus =
  | 'REGISTERED'
  | 'PENDING_VERIFICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface PatientProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: Gender | null;
  avatar: string | null;
  bio: string;
}

export interface VerificationDocument {
  id: string;
  name: string;
  uploaded_at: string;
}

export interface PsychologistProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar: string | null;
  bio: string;
  specialty: string;
  professional_code: string;
  verification_status: VerificationStatus;
  city: string;
  years_of_experience: number;
  documents: VerificationDocument[];
}

export interface PsychologistAchievement {
  id: string;
  psychologist_id: string;
  title: string;
  issuer: string;
  year: number;
  description: string;
}

/** Response of `GET /auth/me/`. */
export interface Me {
  user: User;
  patient_profile: PatientProfile | null;
  psychologist_profile: PsychologistProfile | null;
}
