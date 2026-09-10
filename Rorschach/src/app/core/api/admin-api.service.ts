import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  AdminStats,
  AdminUserRow,
  AssessmentCard,
  AssessmentSession,
  AuditLog,
  MediaAsset,
  PageQuery,
  Paginated,
  Relationship,
  RelationshipStatus,
  Role,
  SessionStatus,
  SiteAnnouncement,
  TestDefinition,
  TestVersion,
  VerificationDecision,
  VerificationStatus,
} from '@core/models';
import { Observable } from 'rxjs';
import { API, toParams } from './http-params';

export interface TestDefinitionWithVersions extends TestDefinition {
  versions: TestVersion[];
}

export type AnnouncementInput = Pick<SiteAnnouncement, 'title' | 'body' | 'expires_at' | 'is_published'>;

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API}/admin`;

  stats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.base}/stats/`);
  }

  users(query: PageQuery & { role?: Role } = {}): Observable<Paginated<AdminUserRow>> {
    return this.http.get<Paginated<AdminUserRow>>(`${this.base}/users/`, { params: toParams(query) });
  }

  toggleActive(userId: string): Observable<AdminUserRow> {
    return this.http.post<AdminUserRow>(`${this.base}/users/${userId}/toggle-active/`, {});
  }

  psychologists(query: { verification_status?: VerificationStatus; search?: string } = {}): Observable<AdminUserRow[]> {
    return this.http.get<AdminUserRow[]>(`${this.base}/psychologists/`, { params: toParams(query) });
  }

  verify(userId: string, decision: VerificationDecision, note?: string): Observable<AdminUserRow> {
    return this.http.post<AdminUserRow>(`${this.base}/psychologists/${userId}/verify/`, { decision, note });
  }

  relationships(status?: RelationshipStatus): Observable<Relationship[]> {
    return this.http.get<Relationship[]>(`${this.base}/relationships/`, { params: toParams({ status }) });
  }

  assessments(status?: SessionStatus): Observable<AssessmentSession[]> {
    return this.http.get<AssessmentSession[]>(`${this.base}/assessments/`, { params: toParams({ status }) });
  }

  tests(): Observable<TestDefinitionWithVersions[]> {
    return this.http.get<TestDefinitionWithVersions[]>(`${this.base}/tests/`);
  }

  testVersion(id: string): Observable<TestVersion> {
    return this.http.get<TestVersion>(`${this.base}/test-versions/${id}/`);
  }

  cloneVersion(id: string): Observable<TestVersion> {
    return this.http.post<TestVersion>(`${this.base}/test-versions/${id}/clone/`, {});
  }

  publishVersion(id: string): Observable<TestVersion> {
    return this.http.post<TestVersion>(`${this.base}/test-versions/${id}/publish/`, {});
  }

  updateCard(id: string, patch: Partial<Pick<AssessmentCard, 'title' | 'configuration'>>): Observable<AssessmentCard> {
    return this.http.patch<AssessmentCard>(`${this.base}/cards/${id}/`, patch);
  }

  announcements(): Observable<SiteAnnouncement[]> {
    return this.http.get<SiteAnnouncement[]>(`${this.base}/announcements/`);
  }

  createAnnouncement(body: AnnouncementInput): Observable<SiteAnnouncement> {
    return this.http.post<SiteAnnouncement>(`${this.base}/announcements/`, body);
  }

  updateAnnouncement(id: string, body: AnnouncementInput): Observable<SiteAnnouncement> {
    return this.http.patch<SiteAnnouncement>(`${this.base}/announcements/${id}/`, body);
  }

  deleteAnnouncement(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/announcements/${id}/`);
  }

  media(): Observable<MediaAsset[]> {
    return this.http.get<MediaAsset[]>(`${this.base}/media/`);
  }

  auditLogs(query: PageQuery & { action?: string } = {}): Observable<Paginated<AuditLog>> {
    return this.http.get<Paginated<AuditLog>>(`${this.base}/audit-logs/`, { params: toParams(query) });
  }
}
