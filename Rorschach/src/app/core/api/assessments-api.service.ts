import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  AdministrationEvent,
  AssessmentAnalysis,
  AssessmentDetail,
  AssessmentResponse,
  AssessmentSession,
  ClarifyBody,
  NextResult,
  ResponseCoding,
  RunState,
  SessionStatus,
  SubmitResponseBody,
  TestDefinition,
} from '@core/models';
import { Observable } from 'rxjs';
import { API, toParams } from './http-params';

export interface SessionFilters {
  status?: SessionStatus;
  patient_id?: string;
}

/** Assessment engine API (docs/04 §5, extended in docs/10). */
@Injectable({ providedIn: 'root' })
export class AssessmentsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API}/assessments/sessions`;

  tests(): Observable<TestDefinition[]> {
    return this.http.get<TestDefinition[]>(`${API}/tests/`);
  }

  sessions(filters: SessionFilters = {}): Observable<AssessmentSession[]> {
    return this.http.get<AssessmentSession[]>(`${this.base}/`, { params: toParams(filters) });
  }

  session(id: string): Observable<AssessmentSession> {
    return this.http.get<AssessmentSession>(`${this.base}/${id}/`);
  }

  /** Returns the open session with this psychologist if one exists. */
  create(psychologistId: string): Observable<AssessmentSession> {
    return this.http.post<AssessmentSession>(`${this.base}/`, { psychologist_id: psychologistId });
  }

  // ---- Examinee runtime (backend decides the current step) -------------------

  runState(id: string): Observable<RunState> {
    return this.http.get<RunState>(`${this.base}/${id}/state/`);
  }

  start(id: string): Observable<RunState> {
    return this.http.post<RunState>(`${this.base}/${id}/start/`, {});
  }

  submitResponse(id: string, body: SubmitResponseBody): Observable<{ response: AssessmentResponse; state: RunState }> {
    return this.http.post<{ response: AssessmentResponse; state: RunState }>(`${this.base}/${id}/responses/`, body);
  }

  next(id: string): Observable<NextResult> {
    return this.http.post<NextResult>(`${this.base}/${id}/next/`, {});
  }

  clarify(id: string, body: ClarifyBody): Observable<RunState> {
    return this.http.post<RunState>(`${this.base}/${id}/clarifications/`, body);
  }

  complete(id: string): Observable<RunState> {
    return this.http.post<RunState>(`${this.base}/${id}/complete/`, {});
  }

  logEvent(id: string, type: AdministrationEvent): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/events/`, { type });
  }

  // ---- Psychologist / admin (BR-14) -----------------------------------------

  detail(id: string): Observable<AssessmentDetail> {
    return this.http.get<AssessmentDetail>(`${this.base}/${id}/detail/`);
  }

  saveCoding(sessionId: string, responseId: string, coding: ResponseCoding): Observable<AssessmentResponse> {
    return this.http.put<AssessmentResponse>(`${this.base}/${sessionId}/responses/${responseId}/coding/`, coding);
  }

  analyze(sessionId: string): Observable<AssessmentAnalysis> {
    return this.http.post<AssessmentAnalysis>(`${this.base}/${sessionId}/analysis/`, {});
  }
}
