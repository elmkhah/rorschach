// In-memory database for frontend phase 1. Resets on page reload (except the
// simulated refresh cookie). Never imported by components — only by mock handlers.
import {
  AdministrationRecord,
  AssessmentAnalysis,
  AssessmentCard,
  AssessmentReport,
  AssessmentResponse,
  AssessmentSession,
  AuditLog,
  LocationMark,
  MediaAsset,
  Me,
  Message,
  PatientProfile,
  PsychologistAchievement,
  PsychologistProfile,
  Relationship,
  ResponseCoding,
  SiteAnnouncement,
  TestDefinition,
  TestPhase,
  TestVersion,
  User,
} from '@core/models';
import { CLARIFICATION_REASONS, emptyCoding } from '@core/rpas/rpas-codes';
import { PSYCHOLOGIST_AVATAR } from '@shared/utils/images';
import { computeRpas, RPAS_ALGORITHM_VERSION } from './rpas-scoring';

export interface MockUser extends User {
  password: string;
}

export interface MockConversation {
  id: string;
  participant_ids: [string, string];
  created_at: string;
  updated_at: string;
}

export type MockPhase = Omit<TestPhase, 'cards'>;

const DAY = 86_400_000;
export const nowIso = (): string => new Date().toISOString();
export const daysAgo = (d: number): string => new Date(Date.now() - d * DAY).toISOString();

let seq = 1000;
export const newId = (prefix: string): string => `${prefix}-${++seq}`;

export const MOCK_PASSWORD = 'Test1234';

export function emptyAdministration(): AdministrationRecord {
  return {
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
  };
}

function user(id: string, email: string, role: User['role'], createdDaysAgo: number): MockUser {
  return {
    id,
    email,
    phone: null,
    role,
    is_active: true,
    is_verified: true,
    created_at: daysAgo(createdDaysAgo),
    last_login_at: daysAgo(1),
    password: MOCK_PASSWORD,
  };
}

function psychologist(
  user_id: string,
  first_name: string,
  last_name: string,
  specialty: string,
  city: string,
  years: number,
  status: PsychologistProfile['verification_status'] = 'APPROVED',
): PsychologistProfile {
  return {
    user_id,
    first_name,
    last_name,
    avatar: null,
    bio: `${first_name} ${last_name}، روان‌شناس با ${years} سال سابقه‌ی کار بالینی در حوزه‌ی ${specialty}.`,
    specialty,
    professional_code: `PSY-${Math.floor(10000 + Math.random() * 89999)}`,
    verification_status: status,
    city,
    years_of_experience: years,
    documents:
      status === 'APPROVED' || status === 'PENDING_VERIFICATION'
        ? [{ id: newId('doc'), name: 'مجوز-نظام-روانشناسی.pdf', uploaded_at: daysAgo(20) }]
        : [],
  };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Rorschach per R-PAS: 10 cards in the Response Phase; the Clarification Phase runs over responses. */
function buildRorschachStructure(): {
  definition: TestDefinition;
  version: TestVersion;
  phases: MockPhase[];
  cards: AssessmentCard[];
} {
  const definition: TestDefinition = {
    id: 'td-rorschach',
    code: 'RORSCHACH',
    name: 'آزمون رورشاخ',
    description: 'آزمون فرافکن لکه‌های جوهر؛ ده کارت، اجرا و کدگذاری به روش R-PAS.',
    status: 'ACTIVE',
    coding_system: 'R-PAS',
    methodology_reference: 'Rorschach Performance Assessment System (R-PAS)',
    source_document: 'docs/09-Roreshach-analysis.md',
    created_at: daysAgo(90),
  };
  const version: TestVersion = {
    id: 'tv-rorschach-1-0',
    test_definition_id: definition.id,
    version: '1.0',
    is_published: true,
    published_at: daysAgo(60),
    created_at: daysAgo(90),
  };
  const phases: MockPhase[] = [
    {
      id: 'ph-1',
      test_version_id: version.id,
      kind: 'RESPONSE',
      name: 'مرحله‌ی ۱ — پاسخ (Response Phase)',
      description: 'کارت‌ها یکی‌یکی نمایش داده می‌شوند و فرد بدون راهنمایی می‌نویسد چه چیزی می‌بیند.',
      display_order: 1,
    },
    {
      id: 'ph-2',
      test_version_id: version.id,
      kind: 'CLARIFICATION',
      name: 'مرحله‌ی ۲ — روشن‌سازی (Clarification Phase)',
      description: 'برای هر پاسخ، فرد محل آن را روی کارت مشخص و دلیل آن را توضیح می‌دهد. این مرحله روی پاسخ‌ها اجرا می‌شود، نه کارت‌ها.',
      display_order: 2,
    },
  ];
  const cards: AssessmentCard[] = ROMAN.map((roman, i) => ({
    id: `card-${i + 1}`,
    test_version_id: version.id,
    phase_id: 'ph-1',
    card_number: i + 1,
    title: `کارت ${roman}`,
    image_url: `/images/test/${i + 1}.jpg`,
    display_order: i + 1,
    configuration: {
      required: true,
      min_responses: 2,
      max_responses: null,
      allow_rotation: true,
      allowed_responses: [],
      metadata: { roman },
    },
  }));
  return { definition, version, phases, cards };
}

interface ProtocolItem {
  card: number;
  text: string;
  why: string;
  coding: ResponseCoding;
  marks?: LocationMark[];
  turns?: number;
}

const cd = (
  location: ResponseCoding['location'],
  determinants: string[],
  form_quality: ResponseCoding['form_quality'],
  content: string[],
  extra: Partial<ResponseCoding> = {},
): ResponseCoding => ({ ...emptyCoding(), location, determinants, form_quality, content, ...extra });

const PAIR: LocationMark[] = [
  { x: 0.3, y: 0.5 },
  { x: 0.7, y: 0.5 },
];
const CENTER: LocationMark[] = [{ x: 0.5, y: 0.5 }];

/** Demo data: the reasons an examinee would plausibly have picked for a coded response. */
const reasonsFor = (c: ResponseCoding): string[] =>
  CLARIFICATION_REASONS.filter((r) => r.suggests.some((d) => c.determinants.includes(d))).map((r) => r.code);

/** Completed demo protocol (as-1), coded by the psychologist. */
const PROTOCOL: ProtocolItem[] = [
  { card: 1, text: 'یک خفاش', why: 'کل لکه؛ بال‌ها این دو طرف‌اند و بدنش وسط.', coding: cd('W', ['F'], 'o', ['A'], { popular: true }) },
  { card: 1, text: 'یک ماسک', why: 'این سوراخ‌های سفید چشم‌هایش است.', coding: cd('W', ['F'], 'o', ['(Hd)'], { space: ['SR'] }) },
  { card: 2, text: 'دو خرس که دست‌هایشان را به هم زده‌اند', why: 'این دو قسمت سیاه خرس‌اند، حالت دست زدن دارند.', marks: PAIR, coding: cd('D', ['FM'], 'o', ['A'], { pair: true, popular: true, thematic_codes: ['COP'] }) },
  { card: 2, text: 'خون', why: 'این قسمت‌های قرمز، رنگش شبیه خون است.', marks: [{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }], coding: cd('D', ['C'], 'n', ['Bl']) },
  { card: 3, text: 'دو نفر که دارند چیزی را بلند می‌کنند', why: 'این‌ها دو آدم‌اند که خم شده‌اند و یک سبد را بلند می‌کنند.', marks: PAIR, coding: cd('D', ['M'], 'o', ['H'], { pair: true, popular: true, thematic_codes: ['COP', 'MAH'] }) },
  { card: 3, text: 'یک پاپیون قرمز', why: 'این قسمت وسط؛ رنگ قرمز و شکلش.', marks: CENTER, coding: cd('D', ['FC'], 'o', ['Cg']) },
  { card: 4, text: 'یک هیولای بزرگ که از بالا نگاه می‌کند', why: 'پاهایش این پایین است و انگار من از پایین نگاهش می‌کنم.', coding: cd('W', ['FD'], 'o', ['(H)'], { popular: true }) },
  { card: 4, text: 'پوست یک حیوان', why: 'سایه‌ها حالت پرزدار دارند، مثل پوست.', coding: cd('W', ['T'], 'o', ['Ad']), turns: 1 },
  { card: 5, text: 'یک پروانه', why: 'کل لکه؛ بال‌ها و شاخک‌ها.', coding: cd('W', ['F'], 'o', ['A'], { popular: true }) },
  { card: 6, text: 'پوست حیوانی که روی زمین پهن شده', why: 'پهن شده و سایه‌ها مثل خز است.', coding: cd('W', ['T'], 'o', ['Ad'], { popular: true }) },
  { card: 7, text: 'دو دختر که به هم نگاه می‌کنند', why: 'صورت‌ها این بالا هستند و موهایشان رو به بالاست.', marks: [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }], coding: cd('D', ['M'], 'o', ['Hd'], { pair: true, popular: true, thematic_codes: ['MAH'] }) },
  { card: 8, text: 'دو حیوان که از کوه بالا می‌روند', why: 'این دو قسمت صورتی حیوان‌اند و پاهایشان روی این قسمت است.', marks: PAIR, coding: cd('D', ['FM'], 'o', ['A'], { pair: true, popular: true }) },
  { card: 8, text: 'یک اسکلت', why: 'این قسمت وسط مثل دنده‌هاست.', marks: CENTER, coding: cd('D', ['F'], 'u', ['An']), turns: 1 },
  { card: 9, text: 'آتش و دود', why: 'نارنجی‌اش شعله است و سبزش دودی که بالا می‌رود.', marks: [{ x: 0.5, y: 0.25 }, { x: 0.5, y: 0.6 }], coding: cd('D', ['CF', 'm'], 'u', ['Fi']) },
  { card: 9, text: 'یک صورت عجیب', why: 'دو چشم این‌جاست.', marks: [{ x: 0.45, y: 0.45 }], coding: cd('Dd', ['F'], '-', ['(Hd)']), turns: 1 },
  { card: 10, text: 'زیر آب، پر از موجودات رنگی', why: 'رنگ‌های مختلف، مثل خرچنگ و ماهی‌هایی که با هم‌اند.', coding: cd('W', ['CF'], 'u', ['A', 'NC'], { synthesis: true }) },
  { card: 10, text: 'دو خرچنگ آبی', why: 'این قسمت‌های آبی؛ پاهای زیادی دارند.', marks: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }], coding: cd('D', ['FC'], 'o', ['A'], { pair: true, popular: true }) },
  { card: 10, text: 'دو حشره که سر یک چوب دعوا می‌کنند', why: 'این خاکستری‌ها؛ هر کدام یک طرف چوب را می‌کشند.', marks: [{ x: 0.5, y: 0.1 }], coding: cd('D', ['FM'], 'o', ['A'], { pair: true, thematic_codes: ['AGM'] }) },
];

/** In-progress demo session (as-2): cards I–III answered, card IV current. */
const PARTIAL: { card: number; text: string }[] = [
  { card: 1, text: 'یک پرنده با بال‌های باز' },
  { card: 1, text: 'یک ماسک' },
  { card: 2, text: 'دو نفر که با هم می‌رقصند' },
  { card: 3, text: 'دو آدم که روبه‌روی هم ایستاده‌اند' },
  { card: 3, text: 'یک پروانه‌ی قرمز' },
];

export class MockDb {
  users: MockUser[] = [
    user('u-patient-1', 'patient@test.com', 'PATIENT', 40),
    user('u-patient-2', 'patient2@test.com', 'PATIENT', 25),
    user('u-patient-3', 'patient3@test.com', 'PATIENT', 10),
    user('u-psy-1', 'psych@test.com', 'PSYCHOLOGIST', 120),
    user('u-psy-2', 'psych2@test.com', 'PSYCHOLOGIST', 100),
    user('u-psy-3', 'psych3@test.com', 'PSYCHOLOGIST', 80),
    user('u-psy-4', 'psych4@test.com', 'PSYCHOLOGIST', 60),
    user('u-psy-pending', 'pending@test.com', 'PSYCHOLOGIST', 3),
    user('u-admin', 'admin@test.com', 'ADMIN', 200),
  ];

  patientProfiles: PatientProfile[] = [
    { user_id: 'u-patient-1', first_name: 'سارا', last_name: 'محمدی', birth_date: '1995-04-12', gender: 'FEMALE', avatar: null, bio: '' },
    { user_id: 'u-patient-2', first_name: 'علی', last_name: 'رضایی', birth_date: '1990-09-30', gender: 'MALE', avatar: null, bio: '' },
    { user_id: 'u-patient-3', first_name: 'نرگس', last_name: 'کاظمی', birth_date: '2000-01-05', gender: 'FEMALE', avatar: null, bio: '' },
  ];

  psychologistProfiles: PsychologistProfile[] = [
    psychologist('u-psy-1', 'مریم', 'احمدی', 'روان‌شناسی بالینی', 'تهران', 12),
    psychologist('u-psy-2', 'حسین', 'کریمی', 'اضطراب و افسردگی', 'اصفهان', 8),
    psychologist('u-psy-3', 'نگار', 'صادقی', 'روان‌شناسی کودک و نوجوان', 'شیراز', 6),
    psychologist('u-psy-4', 'رضا', 'موسوی', 'زوج‌درمانی', 'مشهد', 15),
    psychologist('u-psy-pending', 'امید', 'نوری', 'روان‌شناسی سلامت', 'تبریز', 3, 'PENDING_VERIFICATION'),
  ];

  achievements: PsychologistAchievement[] = [
    { id: 'ach-1', psychologist_id: 'u-psy-1', title: 'دکترای روان‌شناسی بالینی', issuer: 'دانشگاه تهران', year: 2013, description: '' },
    { id: 'ach-2', psychologist_id: 'u-psy-1', title: 'دوره‌ی تخصصی آزمون‌های فرافکن', issuer: 'انجمن روان‌شناسی ایران', year: 2016, description: 'آموزش اجرای آزمون‌های فرافکن' },
    { id: 'ach-3', psychologist_id: 'u-psy-2', title: 'کارشناسی ارشد روان‌شناسی عمومی', issuer: 'دانشگاه اصفهان', year: 2015, description: '' },
  ];

  relationships: Relationship[] = [
    this.rel('rel-1', 'u-patient-1', 'u-psy-1', 'ACTIVE', 30),
    this.rel('rel-2', 'u-patient-1', 'u-psy-2', 'PENDING', 2),
    this.rel('rel-3', 'u-patient-2', 'u-psy-1', 'PENDING', 1),
    this.rel('rel-4', 'u-patient-3', 'u-psy-1', 'ACTIVE', 8),
  ];

  testDefinitions: TestDefinition[] = [];
  testVersions: TestVersion[] = [];
  phases: MockPhase[] = [];
  cards: AssessmentCard[] = [];
  sessions: AssessmentSession[] = [];
  responses: AssessmentResponse[] = [];
  analyses: AssessmentAnalysis[] = [];
  reports: AssessmentReport[] = [];

  announcements: SiteAnnouncement[] = [
    {
      id: 'ann-1',
      title: 'به سامانه‌ی رورشاخ خوش آمدید',
      body: 'نسخه‌ی آزمایشی سامانه فعال شد. در صورت مشاهده‌ی مشکل با پشتیبانی تماس بگیرید.',
      published_at: daysAgo(5),
      expires_at: null,
      is_published: true,
    },
  ];

  conversations: MockConversation[] = [
    { id: 'conv-1', participant_ids: ['u-patient-1', 'u-psy-1'], created_at: daysAgo(29), updated_at: daysAgo(1) },
    { id: 'conv-2', participant_ids: ['u-patient-3', 'u-psy-1'], created_at: daysAgo(7), updated_at: daysAgo(3) },
  ];
  messages: Message[] = [];
  auditLogs: AuditLog[] = [];
  media: MediaAsset[] = [];

  constructor() {
    const r = buildRorschachStructure();
    this.testDefinitions.push(r.definition);
    this.testVersions.push(r.version);
    this.phases.push(...r.phases);
    this.cards.push(...r.cards);
    this.media = r.cards.map((c) => ({
      id: `media-card-${c.card_number}`,
      storage_key: `tests/rorschach/v1/card-${String(c.card_number).padStart(2, '0')}.jpg`,
      mime_type: 'image/jpeg',
      size: 0,
      checksum: '',
      url: c.image_url,
      created_at: daysAgo(60),
    }));

    this.seedSessions();
    this.seedMessages();
    // Image slots: drop photos at public/images/avatars/psychologist-N.webp
    this.psychologistProfiles.forEach((p, i) => (p.avatar = PSYCHOLOGIST_AVATAR(i + 1)));
    this.audit('u-admin', 'PSYCHOLOGIST_PROFILE_APPROVED', 'PsychologistProfile', 'u-psy-1', {}, 100);
    this.audit('u-patient-1', 'RELATIONSHIP_CREATED', 'Relationship', 'rel-1', {}, 30);
    this.audit('u-psy-1', 'RELATIONSHIP_APPROVED', 'Relationship', 'rel-1', {}, 29);
    this.audit('u-patient-1', 'PATIENT_STARTED_ASSESSMENT', 'AssessmentSession', 'as-1', {}, 12);
    this.audit('u-patient-1', 'PATIENT_COMPLETED_ASSESSMENT', 'AssessmentSession', 'as-1', {}, 12);
    this.audit('u-psy-1', 'PSYCHOLOGIST_VIEWED_ASSESSMENT', 'AssessmentSession', 'as-1', {}, 11);
  }

  // ---- helpers -------------------------------------------------------------

  findUser(id: string): MockUser | undefined {
    return this.users.find((u) => u.id === id);
  }

  patientProfile(userId: string): PatientProfile | null {
    return this.patientProfiles.find((p) => p.user_id === userId) ?? null;
  }

  psychologistProfile(userId: string): PsychologistProfile | null {
    return this.psychologistProfiles.find((p) => p.user_id === userId) ?? null;
  }

  me(userId: string): Me {
    const u = this.findUser(userId)!;
    const { password: _pw, ...publicUser } = u;
    return {
      user: publicUser,
      patient_profile: this.patientProfile(userId),
      psychologist_profile: this.psychologistProfile(userId),
    };
  }

  publicUser(u: MockUser): User {
    const { password: _pw, ...rest } = u;
    return rest;
  }

  displayName(userId: string): string {
    const p = this.patientProfile(userId) ?? this.psychologistProfile(userId);
    if (p) return `${p.first_name} ${p.last_name}`;
    const u = this.findUser(userId);
    return u?.role === 'ADMIN' ? 'مدیر سامانه' : (u?.email ?? 'کاربر');
  }

  activeRelationship(patientId: string, psychologistId: string): Relationship | undefined {
    return this.relationships.find(
      (r) => r.patient_id === patientId && r.psychologist_id === psychologistId && r.status === 'ACTIVE',
    );
  }

  audit(
    actorId: string | null,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown> = {},
    createdDaysAgo = 0,
  ): void {
    this.auditLogs.unshift({
      id: newId('audit'),
      actor_id: actorId,
      actor_email: actorId ? (this.findUser(actorId)?.email ?? null) : null,
      action,
      target_type: targetType,
      target_id: targetId,
      ip_address: '127.0.0.1',
      user_agent: 'mock',
      metadata,
      created_at: createdDaysAgo ? daysAgo(createdDaysAgo) : nowIso(),
    });
  }

  /** Response Phase cards of a version, in presentation order. */
  responseCards(versionId: string): AssessmentCard[] {
    const phase = this.phases.find((p) => p.test_version_id === versionId && p.kind === 'RESPONSE');
    return this.cards.filter((c) => c.phase_id === phase?.id).sort((a, b) => a.display_order - b.display_order);
  }

  newSession(patientId: string, psychologistId: string, relationshipId: string): AssessmentSession {
    const def = this.testDefinitions[0];
    const version = this.testVersions.find((v) => v.test_definition_id === def.id && v.is_published)!;
    const s: AssessmentSession = {
      id: newId('as'),
      patient_id: patientId,
      psychologist_id: psychologistId,
      relationship_id: relationshipId,
      test_definition_id: def.id,
      test_version_id: version.id,
      status: 'CREATED',
      current_phase: null,
      current_card: null,
      current_step: null,
      started_at: null,
      paused_at: null,
      completed_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
      administration: emptyAdministration(),
      test_name: def.name,
      test_version: version.version,
      patient_name: this.displayName(patientId),
      psychologist_name: this.displayName(psychologistId),
      total_cards: this.responseCards(version.id).length,
      answered_cards: 0,
    };
    this.sessions.unshift(s);
    return s;
  }

  // ---- seed ----------------------------------------------------------------

  private rel(
    id: string,
    patient_id: string,
    psychologist_id: string,
    status: Relationship['status'],
    requestedDaysAgo: number,
  ): Relationship {
    return {
      id,
      patient_id,
      psychologist_id,
      status,
      requested_at: daysAgo(requestedDaysAgo),
      approved_at: status === 'ACTIVE' ? daysAgo(requestedDaysAgo - 1) : null,
      revoked_at: null,
      created_at: daysAgo(requestedDaysAgo),
      updated_at: daysAgo(requestedDaysAgo),
    };
  }

  private pushResponse(
    sessionId: string,
    card: AssessmentCard,
    sequence: number,
    text: string,
    startMs: number,
    durationMs: number,
    turns: number,
  ): AssessmentResponse {
    const perCard = this.responses.filter((r) => r.assessment_id === sessionId && r.card_id === card.id).length;
    const started = new Date(startMs).toISOString();
    const submitted = new Date(startMs + durationMs).toISOString();
    const r: AssessmentResponse = {
      id: newId('resp'),
      assessment_id: sessionId,
      phase_id: card.phase_id,
      card_id: card.id,
      card_number: card.card_number,
      client_response_id: newId('crid'),
      sequence,
      card_response_number: perCard + 1,
      response_text: text,
      server_started_at: started,
      server_submitted_at: submitted,
      client_started_at: started,
      client_submitted_at: submitted,
      duration_ms: durationMs,
      client_metadata: { viewport: '1440x900' },
      measurement_data: {
        reaction_time_ms: Math.round(durationMs * (perCard === 0 ? 0.35 : 0.2)),
        card_turns: turns,
        final_rotation: 0,
      },
      clarification: null,
      coding: null,
      coded_by: null,
      coded_at: null,
    };
    this.responses.push(r);
    return r;
  }

  private seedSessions(): void {
    const completed = this.newSession('u-patient-1', 'u-psy-1', 'rel-1');
    const cards = this.responseCards(completed.test_version_id);
    let t = Date.now() - 12 * DAY;
    const started = new Date(t).toISOString();
    Object.assign(completed, { id: 'as-1', created_at: started, started_at: started });

    PROTOCOL.forEach((p, i) => {
      const duration = 14_000 + ((i * 7_919) % 38_000);
      const r = this.pushResponse('as-1', cards[p.card - 1], i + 1, p.text, t, duration, p.turns ?? 0);
      t += duration + 4_000;
      r.coding = p.coding;
      r.coded_by = 'u-psy-1';
      r.coded_at = daysAgo(11);
    });
    const cpStart = new Date(t).toISOString();
    for (const [i, r] of this.responses.filter((x) => x.assessment_id === 'as-1').entries()) {
      const p = PROTOCOL[i];
      t += 25_000;
      r.clarification = {
        whole: p.coding.location === 'W',
        location_marks: p.marks ?? [],
        reasons: reasonsFor(p.coding),
        text: p.why,
        submitted_at: new Date(t).toISOString(),
      };
    }
    const done = new Date(t).toISOString();
    Object.assign(completed, {
      status: 'COMPLETED',
      current_phase: 'ph-2',
      current_step: PROTOCOL.length,
      completed_at: done,
      updated_at: done,
      answered_cards: 10,
      administration: {
        ...emptyAdministration(),
        prompts: 3,
        prompted_cards: [5, 6, 7],
        card_turns: 3,
        tab_hidden: 1,
        response_phase_started_at: started,
        clarification_phase_started_at: cpStart,
      },
    } satisfies Partial<AssessmentSession>);

    this.analyses.push({
      id: 'an-1',
      assessment_id: 'as-1',
      algorithm_version: RPAS_ALGORITHM_VERSION,
      status: 'DONE',
      raw_analysis_data: {},
      calculated_data: computeRpas(
        this.responses.filter((x) => x.assessment_id === 'as-1'),
        completed.administration,
      ),
      generated_at: daysAgo(11),
    });

    // In-progress session: the examinee left on card IV (test is never paused; this resumes).
    const partial = this.newSession('u-patient-1', 'u-psy-1', 'rel-1');
    let t2 = Date.now() - DAY;
    const started2 = new Date(t2).toISOString();
    Object.assign(partial, { id: 'as-2', created_at: started2 });
    PARTIAL.forEach((p, i) => {
      const duration = 18_000 + i * 3_000;
      this.pushResponse('as-2', cards[p.card - 1], i + 1, p.text, t2, duration, 0);
      t2 += duration + 3_000;
    });
    Object.assign(partial, {
      status: 'IN_PROGRESS',
      current_phase: 'ph-1',
      current_card: cards[3].id,
      current_step: 0,
      started_at: started2,
      updated_at: new Date(t2).toISOString(),
      answered_cards: 3,
      administration: {
        ...emptyAdministration(),
        prompts: 1,
        prompted_cards: [2],
        response_phase_started_at: started2,
        card_started_at: new Date(t2).toISOString(),
      },
    } satisfies Partial<AssessmentSession>);

    this.sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private seedMessages(): void {
    const push = (conversation_id: string, sender_id: string, content: string, d: number, read = true) =>
      this.messages.push({
        id: newId('msg'),
        conversation_id,
        sender_id,
        message_type: 'TEXT',
        content,
        created_at: daysAgo(d),
        read_at: read ? daysAgo(d) : null,
      });
    push('conv-1', 'u-patient-1', 'سلام دکتر، وقت بخیر.', 3);
    push('conv-1', 'u-psy-1', 'سلام سارا جان، خوش آمدید. هر وقت آماده بودید آزمون را شروع کنید.', 2.9);
    push('conv-1', 'u-patient-1', 'ممنون، آزمون را شروع کردم ولی اینترنتم قطع شد.', 1.1);
    push('conv-1', 'u-psy-1', 'مشکلی نیست، از همان کارت ادامه پیدا می‌کند. لطفاً یک‌جا تمامش کنید.', 1, false);
    push('conv-2', 'u-patient-3', 'سلام، درخواستم را تأیید کردید؟', 3);
    push('conv-2', 'u-psy-1', 'بله، تأیید شد.', 3);
  }
}

export const mockDb = new MockDb();
