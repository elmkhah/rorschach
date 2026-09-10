import { Role } from './user.models';

export interface SiteAnnouncement {
  id: string;
  title: string;
  body: string;
  published_at: string | null;
  expires_at: string | null;
  is_published: boolean;
}

export type MessageType = 'TEXT' | 'SYSTEM';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: MessageType;
  content: string;
  created_at: string;
  read_at: string | null;
}

export interface ConversationPeer {
  user_id: string;
  name: string;
  avatar: string | null;
  role: Role;
  is_online: boolean;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  peer: ConversationPeer;
  last_message: Message | null;
  unread_count: number;
}

export type RealtimeEvent =
  | { type: 'message.new'; message: Message }
  | { type: 'typing'; conversation_id: string; user_id: string }
  | { type: 'message.read'; conversation_id: string; user_id: string; read_at: string }
  | { type: 'presence'; user_id: string; is_online: boolean };
