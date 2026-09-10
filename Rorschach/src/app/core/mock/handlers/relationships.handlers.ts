import { PsychologistSummary, Relationship } from '@core/models';
import { mockDb, newId, nowIso } from '../mock-db';
import { fail, matchesSearch, MockContext, paginate, requireUser, route } from '../mock-router';

function withParties(r: Relationship): Relationship {
  return {
    ...r,
    patient: mockDb.patientProfile(r.patient_id) ?? undefined,
    psychologist: mockDb.psychologistProfile(r.psychologist_id) ?? undefined,
  };
}

function summaryFor(psychologistId: string, patientId: string | null): PsychologistSummary {
  const p = mockDb.psychologistProfile(psychologistId)!;
  const rel = patientId
    ? mockDb.relationships.find((r) => r.patient_id === patientId && r.psychologist_id === psychologistId)
    : undefined;
  return { ...p, relationship_id: rel?.id ?? null, relationship_status: rel?.status ?? null };
}

function findRelationship(ctx: MockContext): Relationship {
  return mockDb.relationships.find((r) => r.id === ctx.params['id']) ?? fail(404, 'رابطه یافت نشد.');
}

function transition(ctx: MockContext, action: 'approve' | 'reject' | 'revoke') {
  const u = requireUser(ctx);
  const r = findRelationship(ctx);
  const isPsy = r.psychologist_id === u.id;
  const isPatient = r.patient_id === u.id;
  if (!isPsy && !isPatient && u.role !== 'ADMIN') fail(403, 'به این رابطه دسترسی ندارید.');

  if (action === 'approve' || action === 'reject') {
    if (!isPsy) fail(403, 'فقط روان‌شناس می‌تواند درخواست را بررسی کند.');
    if (r.status !== 'PENDING') fail(409, 'این درخواست قبلاً بررسی شده است.');
    r.status = action === 'approve' ? 'ACTIVE' : 'REJECTED';
    r.approved_at = action === 'approve' ? nowIso() : null;
    if (action === 'approve') {
      mockDb.audit(u.id, 'RELATIONSHIP_APPROVED', 'Relationship', r.id);
      if (!mockDb.conversations.some((c) => c.participant_ids.includes(r.patient_id) && c.participant_ids.includes(r.psychologist_id))) {
        mockDb.conversations.push({
          id: newId('conv'),
          participant_ids: [r.patient_id, r.psychologist_id],
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
    }
  } else {
    if (r.status !== 'ACTIVE' && r.status !== 'PENDING') fail(409, 'این رابطه فعال نیست.');
    r.status = 'REVOKED';
    r.revoked_at = nowIso();
    mockDb.audit(u.id, 'RELATIONSHIP_REVOKED', 'Relationship', r.id);
  }
  r.updated_at = nowIso();
  return withParties(r);
}

export const relationshipRoutes = [
  route('GET', '/psychologists/', (ctx) => {
    const u = requireUser(ctx);
    const list = mockDb.psychologistProfiles
      .filter((p) => p.verification_status === 'APPROVED')
      .filter((p) => matchesSearch(ctx.query, p.first_name, p.last_name, p.specialty, p.city))
      .map((p) => summaryFor(p.user_id, u.role === 'PATIENT' ? u.id : null));
    return paginate(list, ctx.query, 12);
  }),
  route('GET', '/psychologists/me/achievements/', (ctx) =>
    mockDb.achievements.filter((a) => a.psychologist_id === requireUser(ctx).id),
  { roles: ['PSYCHOLOGIST'] }),
  route(
    'POST',
    '/psychologists/me/achievements/',
    (ctx) => {
      const b = ctx.body as { title: string; issuer: string; year: number; description?: string };
      if (!b.title?.trim()) fail(400, 'عنوان الزامی است.', { title: ['عنوان الزامی است.'] });
      const a = {
        id: newId('ach'),
        psychologist_id: requireUser(ctx).id,
        title: b.title,
        issuer: b.issuer ?? '',
        year: Number(b.year) || new Date().getFullYear(),
        description: b.description ?? '',
      };
      mockDb.achievements.push(a);
      return a;
    },
    { roles: ['PSYCHOLOGIST'], status: 201 },
  ),
  route(
    'DELETE',
    '/psychologists/me/achievements/:id/',
    (ctx) => {
      const uid = requireUser(ctx).id;
      mockDb.achievements = mockDb.achievements.filter(
        (a) => !(a.id === ctx.params['id'] && a.psychologist_id === uid),
      );
      return null;
    },
    { roles: ['PSYCHOLOGIST'], status: 204 },
  ),
  route('GET', '/psychologists/:id/', (ctx) => {
    const u = requireUser(ctx);
    const p = mockDb.psychologistProfile(ctx.params['id']);
    if (!p || p.verification_status !== 'APPROVED') fail(404, 'روان‌شناس یافت نشد.');
    return {
      psychologist: summaryFor(p.user_id, u.role === 'PATIENT' ? u.id : null),
      achievements: mockDb.achievements.filter((a) => a.psychologist_id === p.user_id),
    };
  }),

  route('GET', '/relationships/', (ctx) => {
    const u = requireUser(ctx);
    const status = ctx.query.get('status');
    return mockDb.relationships
      .filter((r) => u.role === 'ADMIN' || r.patient_id === u.id || r.psychologist_id === u.id)
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(withParties);
  }),
  route(
    'POST',
    '/relationships/',
    (ctx) => {
      const u = requireUser(ctx);
      const { psychologist_id } = ctx.body as { psychologist_id: string };
      const psy = mockDb.psychologistProfile(psychologist_id);
      if (!psy || psy.verification_status !== 'APPROVED') fail(400, 'روان‌شناس نامعتبر است.');
      // UNIQUE (patient_id, psychologist_id): re-requesting reuses the row.
      let r = mockDb.relationships.find((x) => x.patient_id === u.id && x.psychologist_id === psychologist_id);
      if (r && (r.status === 'PENDING' || r.status === 'ACTIVE')) fail(409, 'درخواست شما قبلاً ثبت شده است.');
      if (r) {
        Object.assign(r, { status: 'PENDING', requested_at: nowIso(), approved_at: null, revoked_at: null, updated_at: nowIso() });
      } else {
        r = {
          id: newId('rel'),
          patient_id: u.id,
          psychologist_id,
          status: 'PENDING',
          requested_at: nowIso(),
          approved_at: null,
          revoked_at: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        mockDb.relationships.push(r);
      }
      mockDb.audit(u.id, 'RELATIONSHIP_CREATED', 'Relationship', r.id);
      return withParties(r);
    },
    { roles: ['PATIENT'], status: 201 },
  ),
  route('POST', '/relationships/:id/approve/', (ctx) => transition(ctx, 'approve'), { roles: ['PSYCHOLOGIST'] }),
  route('POST', '/relationships/:id/reject/', (ctx) => transition(ctx, 'reject'), { roles: ['PSYCHOLOGIST'] }),
  route('POST', '/relationships/:id/revoke/', (ctx) => transition(ctx, 'revoke')),

  route(
    'GET',
    '/patients/:id/',
    (ctx) => {
      const u = requireUser(ctx);
      const patientId = ctx.params['id'];
      const rel = mockDb.relationships.find((r) => r.patient_id === patientId && r.psychologist_id === u.id);
      // BR-02/BR-13: current access only through an ACTIVE relationship.
      if (!rel || rel.status !== 'ACTIVE') fail(403, 'دسترسی به اطلاعات این بیمار ندارید.');
      return {
        patient: mockDb.patientProfile(patientId),
        email: mockDb.findUser(patientId)?.email ?? null,
        relationship: rel,
        sessions: mockDb.sessions.filter((s) => s.patient_id === patientId && s.psychologist_id === u.id),
      };
    },
    { roles: ['PSYCHOLOGIST'] },
  ),
];
