// Assessment engine contract — Rorschach administered and coded per R-PAS
// (docs/09-Roreshach-analysis.md, docs/10-assessment-rpas.md).

export type TestStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/** PAUSED is kept for API compatibility only — R-PAS administration is never paused by the UI. */
export type SessionStatus =
  | 'CREATED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'CANCELLED';

export interface TestDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  status: TestStatus;
  coding_system: 'R-PAS';
  methodology_reference: string | null;
  source_document: string | null;
  created_at: string;
}

export interface CardConfiguration {
  required: boolean;
  /** R-PAS "prompt for 2": examinee is reminded once if fewer are given. */
  min_responses: number;
  /** Optional cap on responses per card (R-PAS "pull"); null = unlimited. */
  max_responses: number | null;
  allow_rotation: boolean;
  allowed_responses: unknown[];
  metadata: Record<string, unknown>;
}

export interface AssessmentCard {
  id: string;
  test_version_id: string;
  phase_id: string;
  card_number: number;
  title: string;
  image_url: string | null;
  display_order: number;
  configuration: CardConfiguration;
}

export type PhaseKind = 'RESPONSE' | 'CLARIFICATION';

export interface TestPhase {
  id: string;
  test_version_id: string;
  kind: PhaseKind;
  name: string;
  description: string;
  display_order: number;
  cards: AssessmentCard[];
}

export interface TestVersion {
  id: string;
  test_definition_id: string;
  version: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  phases?: TestPhase[];
}

/** Administration-level record (R-PAS administration behaviours + observations). */
export interface AdministrationRecord {
  /** Pr — reminders given because only one response was offered on a card. */
  prompts: number;
  /** Pu — cards withdrawn after the maximum number of responses. */
  pulls: number;
  /** CT — card rotations during the Response Phase. */
  card_turns: number;
  /** Test resumed after the page was left / reloaded. */
  interruptions: number;
  /** Examinee switched away from the page during administration. */
  tab_hidden: number;
  prompted_cards: number[];
  pulled_cards: number[];
  response_phase_started_at: string | null;
  clarification_phase_started_at: string | null;
  /** Server time the current card was presented (server is the timing authority). */
  card_started_at: string | null;
}

export interface AssessmentSession {
  id: string;
  patient_id: string;
  psychologist_id: string;
  relationship_id: string;
  test_definition_id: string;
  test_version_id: string;
  status: SessionStatus;
  current_phase: string | null;
  current_card: string | null;
  /** In the Clarification Phase: index of the response being clarified. */
  current_step: number | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  administration: AdministrationRecord;
  // Denormalised for list views.
  test_name: string;
  test_version: string;
  patient_name: string;
  psychologist_name: string;
  total_cards: number;
  answered_cards: number;
}

export type CardRotation = 0 | 90 | 180 | 270;

/** Point on the (unrotated) card, both axes normalised to 0..1. */
export interface LocationMark {
  x: number;
  y: number;
}

/** Clarification Phase data for one response (inquiry_data). */
export interface Clarification {
  whole: boolean;
  location_marks: LocationMark[];
  /** Codes from CLARIFICATION_REASONS picked by the examinee. */
  reasons: string[];
  text: string;
  submitted_at: string;
}

/** System-measured data for one response. */
export interface ResponseMeasurements {
  /** From card presentation / previous response to first keystroke. */
  reaction_time_ms: number | null;
  card_turns: number;
  final_rotation: CardRotation;
}

/** R-PAS coding of one response — entered by the psychologist, never by the examinee. */
export interface ResponseCoding {
  location: 'W' | 'D' | 'Dd' | null;
  space: ('SR' | 'SI')[];
  content: string[];
  synthesis: boolean;
  vague: boolean;
  pair: boolean;
  form_quality: 'o' | 'u' | '-' | 'n' | null;
  popular: boolean;
  determinants: string[];
  cognitive_codes: string[];
  thematic_codes: string[];
  notes: string;
}

export interface AssessmentResponse {
  id: string;
  assessment_id: string;
  phase_id: string;
  card_id: string;
  card_number: number;
  client_response_id: string;
  /** Response number within the protocol (R sequence). */
  sequence: number;
  card_response_number: number;
  response_text: string;
  server_started_at: string;
  server_submitted_at: string;
  client_started_at: string | null;
  client_submitted_at: string | null;
  duration_ms: number;
  client_metadata: Record<string, unknown>;
  measurement_data: ResponseMeasurements;
  clarification: Clarification | null;
  coding: ResponseCoding | null;
  coded_by: string | null;
  coded_at: string | null;
}

// ---- Runtime (examinee) ------------------------------------------------------

export type RunStage = 'INTRO' | 'RESPONSE' | 'CLARIFICATION' | 'REVIEW' | 'COMPLETED';

/** Backend-authoritative view of where the examinee is (BR-05). */
export interface RunState {
  session: AssessmentSession;
  stage: RunStage;
  card: AssessmentCard | null;
  /** 1-based position of `card` among the 10 cards. */
  card_index: number;
  total_cards: number;
  /** RESPONSE: responses already submitted on the current card (read-only, BR-06). */
  card_responses: AssessmentResponse[];
  prompted: boolean;
  pulled: boolean;
  /** CLARIFICATION: the response being clarified. */
  target: AssessmentResponse | null;
  clarification_index: number;
  clarification_total: number;
  min_responses: number;
  max_responses: number | null;
}

export interface SubmitResponseBody {
  client_response_id: string;
  card_id: string;
  response_text: string;
  client_started_at: string;
  client_submitted_at: string;
  measurements: ResponseMeasurements;
}

export interface NextResult {
  /** true → server gave the R-PAS prompt instead of advancing. */
  prompt: boolean;
  state: RunState;
}

export interface ClarifyBody {
  response_id: string;
  whole: boolean;
  location_marks: LocationMark[];
  reasons: string[];
  text: string;
  client_submitted_at: string;
}

export type AdministrationEvent = 'INTERRUPTION' | 'TAB_HIDDEN';

// ---- Analysis ------------------------------------------------------------------

export type RpasDomain = 'ADMINISTRATION' | 'ENGAGEMENT' | 'PERCEPTION' | 'SELF_OTHER' | 'STRESS';

export interface RpasVariable {
  key: string;
  label: string;
  value: number | null;
  format: 'count' | 'percent' | 'ratio' | 'ms' | 'number';
  hint?: string;
}

export interface RpasFinding {
  domain: RpasDomain;
  text: string;
  basis: string[];
  confidence: 'LOW' | 'MODERATE';
}

export interface RpasResult {
  coding_system: 'R-PAS';
  R: number;
  coded: number;
  variables: Record<RpasDomain, RpasVariable[]>;
  findings: RpasFinding[];
  caveats: string[];
}

export type AnalysisStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export interface AssessmentAnalysis {
  id: string;
  assessment_id: string;
  algorithm_version: string;
  status: AnalysisStatus;
  raw_analysis_data: Record<string, unknown>;
  calculated_data: RpasResult | null;
  generated_at: string | null;
}

export interface AssessmentReport {
  assessment_id: string;
  summary: string;
  structured_result: Record<string, unknown>;
  generated_at: string;
  generated_by: string;
  version: number;
}

/** Psychologist/admin-only view of a session (BR-14). */
export interface AssessmentDetail {
  session: AssessmentSession;
  cards: AssessmentCard[];
  responses: AssessmentResponse[];
  analysis: AssessmentAnalysis | null;
  report: AssessmentReport | null;
}
