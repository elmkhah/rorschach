import { Conversation, Message } from '@core/models';
import { mockDb, MockConversation, newId, nowIso } from '../mock-db';
import { emitTo } from '../mock-realtime';
import { fail, MockContext, requireUser, route } from '../mock-router';

const AUTO_REPLIES = [
  'پیام شما دریافت شد، به‌زودی پاسخ می‌دهم.',
  'ممنون از پیامتان.',
  'حتماً، در جلسه‌ی بعد درباره‌اش صحبت می‌کنیم.',
];

function peerOf(c: MockConversation, userId: string): string {
  return c.participant_ids[0] === userId ? c.participant_ids[1] : c.participant_ids[0];
}

function toConversation(c: MockConversation, userId: string): Conversation {
  const peerId = peerOf(c, userId);
  const msgs = mockDb.messages.filter((m) => m.conversation_id === c.id);
  return {
    id: c.id,
    created_at: c.created_at,
    updated_at: c.updated_at,
    peer: {
      user_id: peerId,
      name: mockDb.displayName(peerId),
      avatar: null,
      role: mockDb.findUser(peerId)!.role,
      is_online: peerId.startsWith('u-psy'),
    },
    last_message: msgs.at(-1) ?? null,
    unread_count: msgs.filter((m) => m.sender_id !== userId && !m.read_at).length,
  };
}

function participantConversation(ctx: MockContext): MockConversation {
  const u = requireUser(ctx);
  const c = mockDb.conversations.find((x) => x.id === ctx.params['id']) ?? fail(404, 'گفت‌وگو یافت نشد.');
  if (!c.participant_ids.includes(u.id)) fail(403, 'به این گفت‌وگو دسترسی ندارید.');
  return c;
}

function addMessage(conversationId: string, senderId: string, content: string): Message {
  const m: Message = {
    id: newId('msg'),
    conversation_id: conversationId,
    sender_id: senderId,
    message_type: 'TEXT',
    content,
    created_at: nowIso(),
    read_at: null,
  };
  mockDb.messages.push(m);
  const c = mockDb.conversations.find((x) => x.id === conversationId);
  if (c) c.updated_at = m.created_at;
  return m;
}

export const communicationRoutes = [
  route('GET', '/conversations/', (ctx) => {
    const u = requireUser(ctx);
    return mockDb.conversations
      .filter((c) => c.participant_ids.includes(u.id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((c) => toConversation(c, u.id));
  }),
  route('GET', '/conversations/:id/', (ctx) => toConversation(participantConversation(ctx), ctx.user!.id)),
  route('GET', '/conversations/:id/messages/', (ctx) => {
    const c = participantConversation(ctx);
    return mockDb.messages.filter((m) => m.conversation_id === c.id);
  }),
  route(
    'POST',
    '/conversations/:id/messages/',
    (ctx) => {
      const u = requireUser(ctx);
      const c = participantConversation(ctx);
      const content = (ctx.body as { content?: string }).content?.trim();
      if (!content) fail(400, 'متن پیام خالی است.', { content: ['متن پیام خالی است.'] });
      const peerId = peerOf(c, u.id);
      const m = addMessage(c.id, u.id, content);
      emitTo(peerId, { type: 'message.new', message: m });

      // Simulated peer: typing indicator, then a reply.
      emitTo(u.id, { type: 'typing', conversation_id: c.id, user_id: peerId }, 800);
      setTimeout(() => {
        const reply = addMessage(c.id, peerId, AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)]);
        emitTo(u.id, { type: 'message.new', message: reply });
      }, 2500);
      return m;
    },
    { status: 201 },
  ),
  route('POST', '/conversations/:id/read/', (ctx) => {
    const u = requireUser(ctx);
    const c = participantConversation(ctx);
    const at = nowIso();
    mockDb.messages
      .filter((m) => m.conversation_id === c.id && m.sender_id !== u.id && !m.read_at)
      .forEach((m) => (m.read_at = at));
    emitTo(peerOf(c, u.id), { type: 'message.read', conversation_id: c.id, user_id: u.id, read_at: at });
    return {};
  }),

  route(
    'GET',
    '/announcements/',
    () => {
      const now = nowIso();
      return mockDb.announcements.filter((a) => a.is_published && (!a.expires_at || a.expires_at > now));
    },
    { public: true },
  ),
];
