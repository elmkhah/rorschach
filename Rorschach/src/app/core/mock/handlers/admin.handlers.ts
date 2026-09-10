import { AdminStats, AdminUserRow, SiteAnnouncement, VerificationDecision } from '@core/models';
import { mockDb, MockUser, newId, nowIso } from '../mock-db';
import { fail, matchesSearch, paginate, requireUser, route } from '../mock-router';

const ADMIN = { roles: ['ADMIN' as const] };

function row(u: MockUser): AdminUserRow {
  return {
    user: mockDb.publicUser(u),
    name: mockDb.displayName(u.id),
    patient_profile: mockDb.patientProfile(u.id),
    psychologist_profile: mockDb.psychologistProfile(u.id),
  };
}

function announcementBody(body: unknown): Partial<SiteAnnouncement> {
  const b = body as Partial<SiteAnnouncement>;
  if (!b.title?.trim()) fail(400, 'عنوان الزامی است.', { title: ['عنوان الزامی است.'] });
  return {
    title: b.title,
    body: b.body ?? '',
    expires_at: b.expires_at || null,
    is_published: !!b.is_published,
  };
}

export const adminRoutes = [
  route(
    'GET',
    '/admin/stats/',
    (): AdminStats => ({
      users: mockDb.users.length,
      patients: mockDb.users.filter((u) => u.role === 'PATIENT').length,
      psychologists: mockDb.users.filter((u) => u.role === 'PSYCHOLOGIST').length,
      pending_verifications: mockDb.psychologistProfiles.filter((p) => p.verification_status === 'PENDING_VERIFICATION').length,
      active_relationships: mockDb.relationships.filter((r) => r.status === 'ACTIVE').length,
      sessions_total: mockDb.sessions.length,
      sessions_completed: mockDb.sessions.filter((s) => s.status === 'COMPLETED').length,
    }),
    ADMIN,
  ),

  route(
    'GET',
    '/admin/users/',
    (ctx) => {
      const role = ctx.query.get('role');
      const list = mockDb.users
        .filter((u) => !role || u.role === role)
        .filter((u) => matchesSearch(ctx.query, u.email, mockDb.displayName(u.id)))
        .map(row);
      return paginate(list, ctx.query);
    },
    ADMIN,
  ),
  route(
    'POST',
    '/admin/users/:id/toggle-active/',
    (ctx) => {
      const admin = requireUser(ctx);
      const u = mockDb.findUser(ctx.params['id']) ?? fail(404, 'کاربر یافت نشد.');
      if (u.id === admin.id) fail(400, 'نمی‌توانید حساب خودتان را غیرفعال کنید.');
      u.is_active = !u.is_active;
      mockDb.audit(admin.id, u.is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'User', u.id);
      return row(u);
    },
    ADMIN,
  ),

  route(
    'GET',
    '/admin/psychologists/',
    (ctx) => {
      const status = ctx.query.get('verification_status');
      return mockDb.psychologistProfiles
        .filter((p) => !status || p.verification_status === status)
        .filter((p) => matchesSearch(ctx.query, p.first_name, p.last_name, p.professional_code))
        .map((p) => row(mockDb.findUser(p.user_id)!));
    },
    ADMIN,
  ),
  route(
    'POST',
    '/admin/psychologists/:id/verify/',
    (ctx) => {
      const admin = requireUser(ctx);
      const p = mockDb.psychologistProfile(ctx.params['id']) ?? fail(404, 'روان‌شناس یافت نشد.');
      const { decision, note } = ctx.body as { decision: VerificationDecision; note?: string };
      const next = { APPROVE: 'APPROVED', REJECT: 'REJECTED', SUSPEND: 'SUSPENDED' } as const;
      if (!next[decision]) fail(400, 'تصمیم نامعتبر است.');
      p.verification_status = next[decision];
      mockDb.audit(admin.id, `PSYCHOLOGIST_PROFILE_${next[decision]}`, 'PsychologistProfile', p.user_id, { note });
      return row(mockDb.findUser(p.user_id)!);
    },
    ADMIN,
  ),

  route(
    'GET',
    '/admin/relationships/',
    (ctx) => {
      const status = ctx.query.get('status');
      return mockDb.relationships
        .filter((r) => !status || r.status === status)
        .map((r) => ({
          ...r,
          patient: mockDb.patientProfile(r.patient_id) ?? undefined,
          psychologist: mockDb.psychologistProfile(r.psychologist_id) ?? undefined,
        }));
    },
    ADMIN,
  ),

  route('GET', '/admin/assessments/', (ctx) => {
    const status = ctx.query.get('status');
    return mockDb.sessions.filter((s) => !status || s.status === status);
  }, ADMIN),

  route('GET', '/admin/tests/', () =>
    mockDb.testDefinitions.map((t) => ({
      ...t,
      versions: mockDb.testVersions.filter((v) => v.test_definition_id === t.id),
    })),
  ADMIN),
  route(
    'GET',
    '/admin/test-versions/:id/',
    (ctx) => {
      const v = mockDb.testVersions.find((x) => x.id === ctx.params['id']) ?? fail(404, 'نسخه یافت نشد.');
      return {
        ...v,
        phases: mockDb.phases
          .filter((p) => p.test_version_id === v.id)
          .sort((a, b) => a.display_order - b.display_order)
          .map((p) => ({ ...p, cards: mockDb.cards.filter((c) => c.phase_id === p.id).sort((a, b) => a.display_order - b.display_order) })),
      };
    },
    ADMIN,
  ),
  route(
    'POST',
    '/admin/test-versions/:id/clone/',
    (ctx) => {
      const admin = requireUser(ctx);
      const src = mockDb.testVersions.find((x) => x.id === ctx.params['id']) ?? fail(404, 'نسخه یافت نشد.');
      const siblings = mockDb.testVersions.filter((v) => v.test_definition_id === src.test_definition_id);
      const [major, minor] = siblings.at(-1)!.version.split('.').map(Number);
      const v = {
        id: newId('tv'),
        test_definition_id: src.test_definition_id,
        version: `${major}.${minor + 1}`,
        is_published: false,
        published_at: null,
        created_at: nowIso(),
      };
      mockDb.testVersions.push(v);
      for (const p of mockDb.phases.filter((x) => x.test_version_id === src.id)) {
        const phaseId = newId('ph');
        mockDb.phases.push({ ...p, id: phaseId, test_version_id: v.id });
        for (const c of mockDb.cards.filter((x) => x.phase_id === p.id)) {
          mockDb.cards.push({ ...structuredClone(c), id: newId('card'), phase_id: phaseId, test_version_id: v.id });
        }
      }
      mockDb.audit(admin.id, 'TEST_VERSION_CREATED', 'TestVersion', v.id, { from: src.id });
      return v;
    },
    { ...ADMIN, status: 201 },
  ),
  route(
    'POST',
    '/admin/test-versions/:id/publish/',
    (ctx) => {
      const admin = requireUser(ctx);
      const v = mockDb.testVersions.find((x) => x.id === ctx.params['id']) ?? fail(404, 'نسخه یافت نشد.');
      if (v.is_published) fail(409, 'این نسخه قبلاً منتشر شده است.');
      v.is_published = true;
      v.published_at = nowIso();
      mockDb.audit(admin.id, 'TEST_VERSION_PUBLISHED', 'TestVersion', v.id);
      return v;
    },
    ADMIN,
  ),
  route(
    'PATCH',
    '/admin/cards/:id/',
    (ctx) => {
      const c = mockDb.cards.find((x) => x.id === ctx.params['id']) ?? fail(404, 'کارت یافت نشد.');
      const v = mockDb.testVersions.find((x) => x.id === c.test_version_id)!;
      // BR-04: an executed/published version is immutable.
      if (v.is_published) fail(409, 'نسخه‌ی منتشرشده قابل ویرایش نیست؛ یک نسخه‌ی جدید بسازید.');
      const b = ctx.body as { title?: string; configuration?: typeof c.configuration };
      if (b.title !== undefined) c.title = b.title;
      if (b.configuration) c.configuration = b.configuration;
      return c;
    },
    ADMIN,
  ),

  route('GET', '/admin/announcements/', () => mockDb.announcements, ADMIN),
  route(
    'POST',
    '/admin/announcements/',
    (ctx) => {
      const data = announcementBody(ctx.body);
      const a: SiteAnnouncement = {
        id: newId('ann'),
        title: data.title!,
        body: data.body!,
        expires_at: data.expires_at ?? null,
        is_published: !!data.is_published,
        published_at: data.is_published ? nowIso() : null,
      };
      mockDb.announcements.unshift(a);
      return a;
    },
    { ...ADMIN, status: 201 },
  ),
  route(
    'PATCH',
    '/admin/announcements/:id/',
    (ctx) => {
      const a = mockDb.announcements.find((x) => x.id === ctx.params['id']) ?? fail(404, 'یافت نشد.');
      const data = announcementBody(ctx.body);
      if (data.is_published && !a.is_published) a.published_at = nowIso();
      Object.assign(a, data);
      return a;
    },
    ADMIN,
  ),
  route(
    'DELETE',
    '/admin/announcements/:id/',
    (ctx) => {
      mockDb.announcements = mockDb.announcements.filter((a) => a.id !== ctx.params['id']);
      return null;
    },
    { ...ADMIN, status: 204 },
  ),

  route('GET', '/admin/media/', () => mockDb.media, ADMIN),
  route(
    'GET',
    '/admin/audit-logs/',
    (ctx) => {
      const action = ctx.query.get('action');
      const list = mockDb.auditLogs.filter((l) => !action || l.action === action);
      return paginate(list, ctx.query, 25);
    },
    ADMIN,
  ),
];
