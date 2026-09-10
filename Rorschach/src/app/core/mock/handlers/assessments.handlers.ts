import {
  AdministrationEvent,
  AssessmentAnalysis,
  AssessmentResponse,
  AssessmentSession,
  ClarifyBody,
  PhaseKind,
  ResponseCoding,
  RunStage,
  RunState,
  SubmitResponseBody,
} from '@core/models';
import { CLARIFICATION_REASONS, emptyCoding } from '@core/rpas/rpas-codes';
import { mockDb, newId, nowIso } from '../mock-db';
import { fail, MockContext, requireUser, route } from '../mock-router';
import { computeRpas, RPAS_ALGORITHM_VERSION } from '../rpas-scoring';

const OPEN: AssessmentSession['status'][] = ['CREATED', 'IN_PROGRESS', 'PAUSED'];

/** Object-level check: owner, linked psychologist (ACTIVE), or admin — never just "authenticated". */
function readableSession(ctx: MockContext): AssessmentSession {
  const u = requireUser(ctx);
  const s = mockDb.sessions.find((x) => x.id === ctx.params['id']) ?? fail(404, 'آزمون یافت نشد.');
  const allowed =
    u.role === 'ADMIN' ||
    s.patient_id === u.id ||
    (s.psychologist_id === u.id && !!mockDb.activeRelationship(s.patient_id, u.id));
  if (!allowed) fail(403, 'به این آزمون دسترسی ندارید.');
  return s;
}

/** Examinee endpoints: only the patient who owns the session. */
function ownSession(ctx: MockContext): AssessmentSession {
  const u = requireUser(ctx);
  const s = mockDb.sessions.find((x) => x.id === ctx.params['id']) ?? fail(404, 'آزمون یافت نشد.');
  if (s.patient_id !== u.id) fail(403, 'به این آزمون دسترسی ندارید.');
  // R-PAS administration is continuous; a legacy PAUSED session simply continues.
  if (s.status === 'PAUSED') s.status = 'IN_PROGRESS';
  return s;
}

function phaseId(s: AssessmentSession, kind: PhaseKind): string {
  return mockDb.phases.find((p) => p.test_version_id === s.test_version_id && p.kind === kind)!.id;
}

function sessionResponses(s: AssessmentSession): AssessmentResponse[] {
  return mockDb.responses.filter((r) => r.assessment_id === s.id).sort((a, b) => a.sequence - b.sequence);
}

/** The single source of truth for where the examinee is (BR-05). */
function stateOf(s: AssessmentSession): RunState {
  const cards = mockDb.responseCards(s.test_version_id);
  const all = sessionResponses(s);
  const base = {
    session: s,
    card: null,
    card_index: 0,
    total_cards: cards.length,
    card_responses: [] as AssessmentResponse[],
    prompted: false,
    pulled: false,
    target: null,
    clarification_index: 0,
    clarification_total: all.length,
    min_responses: 2,
    max_responses: null as number | null,
  };
  const at = (stage: RunStage): RunState => ({ ...base, stage });

  if (s.status === 'CREATED') return at('INTRO');
  if (s.status === 'COMPLETED' || s.status === 'ABANDONED' || s.status === 'CANCELLED') return at('COMPLETED');

  if (s.current_phase === phaseId(s, 'RESPONSE')) {
    const card = cards.find((c) => c.id === s.current_card) ?? cards[0];
    const onCard = all.filter((r) => r.card_id === card.id);
    return {
      ...at('RESPONSE'),
      card,
      card_index: cards.indexOf(card) + 1,
      card_responses: onCard,
      prompted: s.administration.prompted_cards.includes(card.card_number),
      pulled: card.configuration.max_responses !== null && onCard.length >= card.configuration.max_responses,
      min_responses: card.configuration.min_responses,
      max_responses: card.configuration.max_responses,
    };
  }

  const idx = s.current_step ?? 0;
  if (idx >= all.length) return { ...at('REVIEW'), clarification_index: all.length };
  const target = all[idx];
  const card = cards.find((c) => c.id === target.card_id)!;
  return { ...at('CLARIFICATION'), card, card_index: cards.indexOf(card) + 1, target, clarification_index: idx + 1 };
}

function requireStage(s: AssessmentSession, stage: RunStage): RunState {
  const st = stateOf(s);
  if (st.stage !== stage) fail(409, 'وضعیت آزمون تغییر کرده است؛ صفحه را تازه کنید.');
  return st;
}

function touch(s: AssessmentSession): void {
  s.answered_cards = new Set(sessionResponses(s).map((r) => r.card_id)).size;
  s.updated_at = nowIso();
}

/** Recomputes the R-PAS analysis (backend: async job after commit). */
function analyze(s: AssessmentSession): AssessmentAnalysis {
  const calculated_data = computeRpas(sessionResponses(s), s.administration);
  let a = mockDb.analyses.find((x) => x.assessment_id === s.id);
  if (a) {
    Object.assign(a, { calculated_data, algorithm_version: RPAS_ALGORITHM_VERSION, status: 'DONE', generated_at: nowIso() });
  } else {
    a = {
      id: newId('an'),
      assessment_id: s.id,
      algorithm_version: RPAS_ALGORITHM_VERSION,
      status: 'DONE',
      raw_analysis_data: {},
      calculated_data,
      generated_at: nowIso(),
    };
    mockDb.analyses.push(a);
  }
  return a;
}

function normalizeCoding(body: unknown): ResponseCoding {
  const b = (body ?? {}) as Partial<ResponseCoding>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : []);
  return {
    ...emptyCoding(),
    location: b.location ?? null,
    space: list(b.space) as ResponseCoding['space'],
    content: list(b.content),
    synthesis: !!b.synthesis,
    vague: !!b.vague,
    pair: !!b.pair,
    form_quality: b.form_quality ?? null,
    popular: !!b.popular,
    determinants: list(b.determinants),
    cognitive_codes: list(b.cognitive_codes),
    thematic_codes: list(b.thematic_codes),
    notes: typeof b.notes === 'string' ? b.notes.slice(0, 1000) : '',
  };
}

const PATIENT = { roles: ['PATIENT' as const] };

export const assessmentRoutes = [
  route('GET', '/tests/', () => mockDb.testDefinitions.filter((t) => t.status === 'ACTIVE')),

  route('GET', '/assessments/sessions/', (ctx) => {
    const u = requireUser(ctx);
    const status = ctx.query.get('status');
    const patientId = ctx.query.get('patient_id');
    return mockDb.sessions
      .filter((s) => {
        if (u.role === 'PATIENT') return s.patient_id === u.id;
        if (u.role === 'PSYCHOLOGIST') return s.psychologist_id === u.id && !!mockDb.activeRelationship(s.patient_id, u.id);
        return true;
      })
      .filter((s) => !status || s.status === status)
      .filter((s) => !patientId || s.patient_id === patientId);
  }),

  route(
    'POST',
    '/assessments/sessions/',
    (ctx) => {
      const u = requireUser(ctx);
      const { psychologist_id } = ctx.body as { psychologist_id: string };
      const rel = mockDb.activeRelationship(u.id, psychologist_id);
      if (!rel) fail(400, 'برای شروع آزمون باید با یک روان‌شناس ارتباط فعال داشته باشید.');
      const open = mockDb.sessions.find(
        (s) => s.patient_id === u.id && s.psychologist_id === psychologist_id && OPEN.includes(s.status),
      );
      return open ?? mockDb.newSession(u.id, psychologist_id, rel.id);
    },
    { ...PATIENT, status: 201 },
  ),

  route('GET', '/assessments/sessions/:id/', (ctx) => readableSession(ctx)),

  // ---- Examinee runtime -----------------------------------------------------

  route('GET', '/assessments/sessions/:id/state/', (ctx) => stateOf(ownSession(ctx)), PATIENT),

  route(
    'POST',
    '/assessments/sessions/:id/start/',
    (ctx) => {
      const s = ownSession(ctx);
      if (s.status === 'CREATED') {
        const now = nowIso();
        Object.assign(s, {
          status: 'IN_PROGRESS',
          current_phase: phaseId(s, 'RESPONSE'),
          current_card: mockDb.responseCards(s.test_version_id)[0].id,
          current_step: 0,
          started_at: now,
          updated_at: now,
        });
        s.administration.response_phase_started_at = now;
        s.administration.card_started_at = now;
        mockDb.audit(s.patient_id, 'PATIENT_STARTED_ASSESSMENT', 'AssessmentSession', s.id);
      } else if (s.status !== 'IN_PROGRESS') {
        fail(409, 'این آزمون قابل شروع نیست.');
      }
      return stateOf(s);
    },
    PATIENT,
  ),

  route(
    'POST',
    '/assessments/sessions/:id/responses/',
    (ctx) => {
      const s = ownSession(ctx);
      const b = ctx.body as SubmitResponseBody;
      // Idempotent retry (BR-07): same client_response_id → same response, no duplicate.
      const existing = mockDb.responses.find((r) => r.assessment_id === s.id && r.client_response_id === b.client_response_id);
      if (existing) return { response: existing, state: stateOf(s) };

      const st = requireStage(s, 'RESPONSE');
      const card = st.card!;
      if (b.card_id !== card.id) fail(409, 'کارت فعلی تغییر کرده است؛ صفحه را تازه کنید.');
      const text = b.response_text?.trim();
      if (!text) fail(400, 'متن پاسخ خالی است.', { response_text: ['متن پاسخ خالی است.'] });
      if (st.max_responses !== null && st.card_responses.length >= st.max_responses) fail(409, 'برای این کارت پاسخ کافی ثبت شده است.');

      const now = nowIso();
      const started = st.card_responses.at(-1)?.server_submitted_at ?? s.administration.card_started_at ?? now;
      const r: AssessmentResponse = {
        id: newId('resp'),
        assessment_id: s.id,
        phase_id: card.phase_id,
        card_id: card.id,
        card_number: card.card_number,
        client_response_id: b.client_response_id,
        sequence: sessionResponses(s).length + 1,
        card_response_number: st.card_responses.length + 1,
        response_text: text,
        server_started_at: started,
        server_submitted_at: now,
        client_started_at: b.client_started_at ?? null,
        client_submitted_at: b.client_submitted_at ?? null,
        duration_ms: Math.max(0, Date.parse(now) - Date.parse(started)),
        client_metadata: {},
        measurement_data: {
          reaction_time_ms: b.measurements?.reaction_time_ms ?? null,
          card_turns: b.measurements?.card_turns ?? 0,
          final_rotation: b.measurements?.final_rotation ?? 0,
        },
        clarification: null,
        coding: null,
        coded_by: null,
        coded_at: null,
      };
      mockDb.responses.push(r);
      s.administration.card_turns += r.measurement_data.card_turns;
      if (st.max_responses !== null && r.card_response_number >= st.max_responses) {
        // R-PAS "pull": card withdrawn after the maximum number of responses.
        s.administration.pulls++;
        s.administration.pulled_cards.push(card.card_number);
      }
      touch(s);
      return { response: r, state: stateOf(s) };
    },
    { ...PATIENT, status: 201 },
  ),

  route(
    'POST',
    '/assessments/sessions/:id/next/',
    (ctx) => {
      const s = ownSession(ctx);
      const st = requireStage(s, 'RESPONSE');
      const card = st.card!;
      const count = st.card_responses.length;
      if (count === 0) fail(400, 'برای ادامه حداقل یک پاسخ لازم است.');
      if (count < st.min_responses && !st.prompted) {
        // R-PAS "prompt for 2": one standard reminder per card, instead of advancing.
        s.administration.prompts++;
        s.administration.prompted_cards.push(card.card_number);
        s.updated_at = nowIso();
        return { prompt: true, state: stateOf(s) };
      }
      const cards = mockDb.responseCards(s.test_version_id);
      const idx = cards.findIndex((c) => c.id === card.id);
      const now = nowIso();
      if (idx === cards.length - 1) {
        Object.assign(s, { current_phase: phaseId(s, 'CLARIFICATION'), current_card: null, current_step: 0 });
        s.administration.clarification_phase_started_at = now;
        s.administration.card_started_at = null;
      } else {
        s.current_card = cards[idx + 1].id;
        s.administration.card_started_at = now;
      }
      s.updated_at = now;
      return { prompt: false, state: stateOf(s) };
    },
    PATIENT,
  ),

  route(
    'POST',
    '/assessments/sessions/:id/clarifications/',
    (ctx) => {
      const s = ownSession(ctx);
      const b = ctx.body as ClarifyBody;
      const target = mockDb.responses.find((r) => r.id === b.response_id && r.assessment_id === s.id) ?? fail(404, 'پاسخ یافت نشد.');
      if (target.clarification) return stateOf(s); // idempotent retry
      const st = requireStage(s, 'CLARIFICATION');
      if (st.target!.id !== target.id) fail(409, 'وضعیت آزمون تغییر کرده است؛ صفحه را تازه کنید.');
      const marks = Array.isArray(b.location_marks) ? b.location_marks.slice(0, 12) : [];
      if (!b.whole && !marks.length) fail(400, 'محل پاسخ را روی کارت مشخص کنید.');
      // Stored separately — the original response is never overwritten (BR-06).
      const reasons = Array.isArray(b.reasons)
        ? [...new Set(b.reasons)].filter((r) => CLARIFICATION_REASONS.some((x) => x.code === r))
        : [];
      const text = (b.text ?? '').trim();
      if (!reasons.length && !text) fail(400, 'دلیل را انتخاب کنید یا توضیح دهید.');
      target.clarification = { whole: !!b.whole, location_marks: marks, reasons, text, submitted_at: nowIso() };
      s.current_step = (s.current_step ?? 0) + 1;
      s.updated_at = nowIso();
      return stateOf(s);
    },
    PATIENT,
  ),

  route(
    'POST',
    '/assessments/sessions/:id/complete/',
    (ctx) => {
      const s = ownSession(ctx);
      if (s.status === 'COMPLETED') return stateOf(s); // terminal & idempotent (BR-08)
      requireStage(s, 'REVIEW');
      const now = nowIso();
      Object.assign(s, { status: 'COMPLETED', completed_at: now, updated_at: now });
      analyze(s);
      mockDb.audit(s.patient_id, 'PATIENT_COMPLETED_ASSESSMENT', 'AssessmentSession', s.id);
      return stateOf(s);
    },
    PATIENT,
  ),

  route(
    'POST',
    '/assessments/sessions/:id/events/',
    (ctx) => {
      const s = ownSession(ctx);
      const { type } = ctx.body as { type: AdministrationEvent };
      if (s.status === 'IN_PROGRESS') {
        if (type === 'INTERRUPTION') s.administration.interruptions++;
        else if (type === 'TAB_HIDDEN') s.administration.tab_hidden++;
      }
      return {};
    },
    PATIENT,
  ),

  // ---- Psychologist: review, coding, analysis (BR-14) -----------------------

  route(
    'GET',
    '/assessments/sessions/:id/detail/',
    (ctx) => {
      const u = requireUser(ctx);
      const s = readableSession(ctx);
      if (u.role === 'PSYCHOLOGIST') mockDb.audit(u.id, 'PSYCHOLOGIST_VIEWED_ASSESSMENT', 'AssessmentSession', s.id);
      return {
        session: s,
        cards: mockDb.responseCards(s.test_version_id),
        responses: sessionResponses(s),
        analysis: mockDb.analyses.find((a) => a.assessment_id === s.id) ?? null,
        report: mockDb.reports.find((r) => r.assessment_id === s.id) ?? null,
      };
    },
    { roles: ['PSYCHOLOGIST', 'ADMIN'] },
  ),

  route(
    'PUT',
    '/assessments/sessions/:id/responses/:responseId/coding/',
    (ctx) => {
      const u = requireUser(ctx);
      const s = readableSession(ctx);
      if (s.psychologist_id !== u.id) fail(403, 'فقط روان‌شناس مرتبط می‌تواند کدگذاری کند.');
      if (s.status !== 'COMPLETED') fail(409, 'کدگذاری پس از تکمیل آزمون ممکن است.');
      const r = mockDb.responses.find((x) => x.id === ctx.params['responseId'] && x.assessment_id === s.id) ?? fail(404, 'پاسخ یافت نشد.');
      r.coding = normalizeCoding(ctx.body);
      r.coded_by = u.id;
      r.coded_at = nowIso();
      mockDb.audit(u.id, 'RESPONSE_CODED', 'AssessmentResponse', r.id);
      return r;
    },
    { roles: ['PSYCHOLOGIST'] },
  ),

  route(
    'POST',
    '/assessments/sessions/:id/analysis/',
    (ctx) => {
      const s = readableSession(ctx);
      if (s.status !== 'COMPLETED') fail(409, 'تحلیل پس از تکمیل آزمون ممکن است.');
      return analyze(s);
    },
    { roles: ['PSYCHOLOGIST', 'ADMIN'] },
  ),
];
