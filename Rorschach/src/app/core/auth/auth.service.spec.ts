import { Me, VerificationStatus } from '@core/models';
import { homeUrlFor } from './auth.service';

function me(role: Me['user']['role'], verification?: VerificationStatus): Me {
  return {
    user: {
      id: 'u1',
      email: 'x@test.com',
      phone: null,
      role,
      is_active: true,
      is_verified: true,
      created_at: '',
      last_login_at: null,
    },
    patient_profile: null,
    psychologist_profile: verification
      ? {
          user_id: 'u1',
          first_name: 'a',
          last_name: 'b',
          avatar: null,
          bio: '',
          specialty: '',
          professional_code: '',
          verification_status: verification,
          city: '',
          years_of_experience: 0,
          documents: [],
        }
      : null,
  };
}

describe('homeUrlFor', () => {
  it('sends anonymous users to login', () => {
    expect(homeUrlFor(null)).toBe('/login');
  });

  it('routes each role to its panel', () => {
    expect(homeUrlFor(me('PATIENT'))).toBe('/patient');
    expect(homeUrlFor(me('ADMIN'))).toBe('/admin');
    expect(homeUrlFor(me('PSYCHOLOGIST', 'APPROVED'))).toBe('/psychologist');
  });

  it('keeps unverified psychologists on the verification page (BR-01)', () => {
    for (const s of ['REGISTERED', 'PENDING_VERIFICATION', 'REJECTED', 'SUSPENDED'] as const) {
      expect(homeUrlFor(me('PSYCHOLOGIST', s))).toBe('/verification-pending');
    }
  });
});
