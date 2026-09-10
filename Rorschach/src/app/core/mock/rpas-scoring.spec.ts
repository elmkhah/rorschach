import { AdministrationRecord, AssessmentResponse, ResponseCoding } from '@core/models';
import { emptyCoding } from '@core/rpas/rpas-codes';
import { computeRpas } from './rpas-scoring';

const adm = (patch: Partial<AdministrationRecord> = {}): AdministrationRecord => ({
  prompts: 0,
  pulls: 0,
  card_turns: 0,
  interruptions: 0,
  tab_hidden: 0,
  prompted_cards: [],
  pulled_cards: [],
  response_phase_started_at: null,
  clarification_phase_started_at: null,
  card_started_at: null,
  ...patch,
});

const resp = (coding: Partial<ResponseCoding> | null): AssessmentResponse =>
  ({
    measurement_data: { reaction_time_ms: 2000, card_turns: 0, final_rotation: 0 },
    coding: coding ? { ...emptyCoding(), ...coding } : null,
  }) as AssessmentResponse;

const value = (r: ReturnType<typeof computeRpas>, key: string) =>
  Object.values(r.variables)
    .flat()
    .find((x) => x.key === key)?.value;

describe('computeRpas', () => {
  it('computes only administration variables when nothing is coded', () => {
    const r = computeRpas([resp(null), resp(null)], adm({ prompts: 1 }));
    expect(r.R).toBe(2);
    expect(r.coded).toBe(0);
    expect(value(r, 'Pr')).toBe(1);
    expect(value(r, 'F%')).toBeNull();
    expect(r.findings.some((f) => f.basis.includes('R'))).toBeTrue();
  });

  it('weights colour responses into WSumC and derives MC', () => {
    const r = computeRpas(
      [
        resp({ location: 'D', determinants: ['FC'], form_quality: 'o' }),
        resp({ location: 'D', determinants: ['CF'], form_quality: 'u' }),
        resp({ location: 'D', determinants: ['C'], form_quality: 'n' }),
        resp({ location: 'W', determinants: ['M'], form_quality: 'o' }),
      ],
      adm(),
    );
    expect(value(r, 'WSumC')).toBe(3); // 0.5 + 1 + 1.5
    expect(value(r, 'MC')).toBe(4);
  });

  it('computes FQ-% over form-scored responses only', () => {
    const r = computeRpas(
      [
        resp({ location: 'W', determinants: ['F'], form_quality: '-' }),
        resp({ location: 'D', determinants: ['F'], form_quality: 'o' }),
        resp({ location: 'D', determinants: ['C'], form_quality: 'n' }),
      ],
      adm(),
    );
    expect(value(r, 'FQ-%')).toBe(0.5);
    expect(r.findings.some((f) => f.domain === 'PERCEPTION')).toBeTrue();
  });
});
