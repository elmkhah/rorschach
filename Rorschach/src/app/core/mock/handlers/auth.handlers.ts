import { RegisterRequest } from '@core/auth/auth.models';
import { newId, mockDb, MockUser, nowIso } from '../mock-db';
import { fail, MockContext, requireUser, route } from '../mock-router';

// Simulates the HttpOnly refresh cookie so a page reload keeps the session.
const REFRESH_KEY = 'rorschach.mock.refresh';
const TOKEN_PREFIX = 'Bearer mock.';

export function userFromAuthHeader(header: string | null): MockUser | null {
  if (!header?.startsWith(TOKEN_PREFIX)) return null;
  const id = header.slice(TOKEN_PREFIX.length).split('.')[0];
  const u = mockDb.findUser(id);
  return u?.is_active ? u : null;
}

function issue(u: MockUser) {
  sessionStorage.setItem(REFRESH_KEY, u.id);
  u.last_login_at = nowIso();
  return { access: `mock.${u.id}.${Date.now()}`, me: mockDb.me(u.id) };
}

function register(ctx: MockContext) {
  const b = ctx.body as RegisterRequest;
  const errors: Record<string, string[]> = {};
  if (mockDb.users.some((u) => u.email.toLowerCase() === b.email?.toLowerCase())) {
    errors['email'] = ['این ایمیل قبلاً ثبت شده است.'];
  }
  if (!b.password || b.password.length < 8) errors['password'] = ['رمز عبور باید حداقل ۸ کاراکتر باشد.'];
  if (Object.keys(errors).length) fail(400, 'اطلاعات نامعتبر است.', errors);

  const u: MockUser = {
    id: newId('u'),
    email: b.email,
    phone: b.phone,
    role: b.role,
    is_active: true,
    is_verified: false,
    created_at: nowIso(),
    last_login_at: null,
    password: b.password,
  };
  mockDb.users.push(u);
  if (b.role === 'PATIENT') {
    mockDb.patientProfiles.push({
      user_id: u.id,
      first_name: b.first_name,
      last_name: b.last_name,
      birth_date: null,
      gender: null,
      avatar: null,
      bio: '',
    });
  } else {
    mockDb.psychologistProfiles.push({
      user_id: u.id,
      first_name: b.first_name,
      last_name: b.last_name,
      avatar: null,
      bio: '',
      specialty: b.specialty ?? '',
      professional_code: b.professional_code ?? '',
      verification_status: 'REGISTERED',
      city: '',
      years_of_experience: 0,
      documents: [],
    });
  }
  return issue(u);
}

function updateMe(ctx: MockContext) {
  const u = requireUser(ctx);
  const patch = ctx.body as Record<string, unknown>;
  if (typeof patch['phone'] === 'string' || patch['phone'] === null) u.phone = patch['phone'] as string | null;
  const profile = mockDb.patientProfile(u.id) ?? mockDb.psychologistProfile(u.id);
  if (profile) {
    const editable = [
      'first_name',
      'last_name',
      'bio',
      'birth_date',
      'gender',
      'specialty',
      'city',
      'years_of_experience',
    ];
    for (const key of editable) {
      if (key in patch && key in profile) (profile as unknown as Record<string, unknown>)[key] = patch[key];
    }
  }
  return mockDb.me(u.id);
}

function uploadDocuments(ctx: MockContext) {
  const u = requireUser(ctx);
  const profile = mockDb.psychologistProfile(u.id) ?? fail(404, 'پروفایل یافت نشد.');
  const names =
    ctx.body instanceof FormData
      ? ctx.body.getAll('documents').map((f) => (f instanceof File ? f.name : String(f)))
      : [];
  if (!names.length) fail(400, 'حداقل یک فایل انتخاب کنید.');
  profile.documents.push(...names.map((name) => ({ id: newId('doc'), name, uploaded_at: nowIso() })));
  if (profile.verification_status === 'REGISTERED' || profile.verification_status === 'REJECTED') {
    profile.verification_status = 'PENDING_VERIFICATION';
  }
  return mockDb.me(u.id);
}

export const authRoutes = [
  route(
    'POST',
    '/auth/login/',
    (ctx) => {
      const b = ctx.body as { email?: string; password?: string };
      const u = mockDb.users.find((x) => x.email.toLowerCase() === b.email?.trim().toLowerCase());
      if (!u || u.password !== b.password) fail(401, 'ایمیل یا رمز عبور اشتباه است.');
      if (!u.is_active) fail(403, 'حساب کاربری شما غیرفعال شده است.');
      return issue(u);
    },
    { public: true },
  ),
  route('POST', '/auth/register/', register, { public: true, status: 201 }),
  route(
    'POST',
    '/auth/refresh/',
    () => {
      const id = sessionStorage.getItem(REFRESH_KEY);
      const u = id ? mockDb.findUser(id) : undefined;
      if (!u?.is_active) fail(401, 'نشست منقضی شده است.');
      return { access: `mock.${u.id}.${Date.now()}` };
    },
    { public: true },
  ),
  route(
    'POST',
    '/auth/logout/',
    () => {
      sessionStorage.removeItem(REFRESH_KEY);
      return {};
    },
    { public: true },
  ),
  route('GET', '/auth/me/', (ctx) => mockDb.me(requireUser(ctx).id)),
  route('PATCH', '/users/me/', updateMe),
  route('POST', '/psychologists/me/documents/', uploadDocuments, { roles: ['PSYCHOLOGIST'] }),
];
