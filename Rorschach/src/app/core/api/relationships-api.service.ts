import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AssessmentSession, PatientProfile, Relationship, RelationshipStatus } from '@core/models';
import { Observable } from 'rxjs';
import { API, toParams } from './http-params';

export interface PatientDetail {
  patient: PatientProfile;
  email: string | null;
  relationship: Relationship;
  sessions: AssessmentSession[];
}

@Injectable({ providedIn: 'root' })
export class RelationshipsApi {
  private readonly http = inject(HttpClient);

  list(status?: RelationshipStatus): Observable<Relationship[]> {
    return this.http.get<Relationship[]>(`${API}/relationships/`, { params: toParams({ status }) });
  }

  request(psychologistId: string): Observable<Relationship> {
    return this.http.post<Relationship>(`${API}/relationships/`, { psychologist_id: psychologistId });
  }

  approve(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`${API}/relationships/${id}/approve/`, {});
  }

  reject(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`${API}/relationships/${id}/reject/`, {});
  }

  revoke(id: string): Observable<Relationship> {
    return this.http.post<Relationship>(`${API}/relationships/${id}/revoke/`, {});
  }

  /** Psychologist view of a linked patient (403 unless relationship is ACTIVE). */
  patient(patientId: string): Observable<PatientDetail> {
    return this.http.get<PatientDetail>(`${API}/patients/${patientId}/`);
  }
}
