import { AssessmentSession, RunState } from '@core/models';
import { mockDb, MockUser } from '../mock-db';
import { compileRoutes, MockError } from '../mock-router';
import { assessmentRoutes } from './assessments.handlers';

const match = compileRoutes(assessmentRoutes);
let seq = 0;

function call<T>(method: string, path: string, user: MockUser, body: unknown = {}): T {
  const m = match(method, path);
  if (!m) throw new Error(`no route ${method} ${path}`);
  return m.route.handler({ method, path, params: m.params, query: new URLSearchParams(), body, user }) as T;
}

describe('assessment mock API (R-PAS run)', () => {
  it('accepts unlimited responses per card and requires a reason or text in clarification', () => {
    const patient = mockDb.findUser('u-patient-3')!;
    const base = '/assessments/sessions';
    const s = call<AssessmentSession>('POST', `${base}/`, patient, { psychologist_id: 'u-psy-1' });
    let st = call<RunState>('POST', `${base}/${s.id}/start/`, patient);

    const submit = (text: string) => {
      const now = new Date().toISOString();
      st = call<{ state: RunState }>('POST', `${base}/${s.id}/responses/`, patient, {
        client_response_id: `spec-${++seq}`,
        card_id: st.card!.id,
        response_text: text,
        client_started_at: now,
        client_submitted_at: now,
        measurements: { reaction_time_ms: 100, card_turns: 0, final_rotation: 0 },
      }).state;
    };

    // No cap: six responses on card I, card never pulled.
    for (let i = 1; i <= 6; i++) submit(`پاسخ ${i}`);
    expect(st.card_responses.length).toBe(6);
    expect(st.pulled).toBeFalse();
    expect(st.max_responses).toBeNull();

    // Advance through the remaining cards.
    for (let guard = 0; st.stage === 'RESPONSE' && guard < 20; guard++) {
      while (st.card_responses.length < 2) submit('x');
      st = call<{ state: RunState }>('POST', `${base}/${s.id}/next/`, patient).state;
    }
    expect(st.stage).toBe('CLARIFICATION');
    expect(st.clarification_index).toBe(1);

    const target = st.target!;
    const clarify = (reasons: string[], text: string) =>
      call<RunState>('POST', `${base}/${s.id}/clarifications/`, patient, {
        response_id: target.id,
        whole: true,
        location_marks: [],
        reasons,
        text,
        client_submitted_at: new Date().toISOString(),
      });

    expect(() => clarify([], '')).toThrowMatching((e) => e instanceof MockError && e.status === 400);

    st = clarify(['FORM', 'BOGUS', 'FORM'], '');
    expect(st.clarification_index).toBe(2);
    expect(mockDb.responses.find((r) => r.id === target.id)!.clarification!.reasons).toEqual(['FORM']);
  });
});
