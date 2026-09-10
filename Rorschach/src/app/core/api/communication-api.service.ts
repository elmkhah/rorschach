import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Conversation, Message, SiteAnnouncement } from '@core/models';
import { Observable } from 'rxjs';
import { API } from './http-params';

@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly http = inject(HttpClient);

  conversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${API}/conversations/`);
  }

  conversation(id: string): Observable<Conversation> {
    return this.http.get<Conversation>(`${API}/conversations/${id}/`);
  }

  messages(conversationId: string): Observable<Message[]> {
    return this.http.get<Message[]>(`${API}/conversations/${conversationId}/messages/`);
  }

  send(conversationId: string, content: string): Observable<Message> {
    return this.http.post<Message>(`${API}/conversations/${conversationId}/messages/`, { content });
  }

  markRead(conversationId: string): Observable<void> {
    return this.http.post<void>(`${API}/conversations/${conversationId}/read/`, {});
  }
}

/** Public site announcements (not personal notifications — those are not part of the app). */
@Injectable({ providedIn: 'root' })
export class AnnouncementsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<SiteAnnouncement[]> {
    return this.http.get<SiteAnnouncement[]>(`${API}/announcements/`);
  }
}
