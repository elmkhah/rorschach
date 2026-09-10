import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { PageQuery, Paginated, PsychologistAchievement, PsychologistSummary } from '@core/models';
import { Observable } from 'rxjs';
import { API, toParams } from './http-params';

export interface PsychologistDetail {
  psychologist: PsychologistSummary;
  achievements: PsychologistAchievement[];
}

export type AchievementInput = Pick<PsychologistAchievement, 'title' | 'issuer' | 'year' | 'description'>;

@Injectable({ providedIn: 'root' })
export class PsychologistsApi {
  private readonly http = inject(HttpClient);

  list(query: PageQuery = {}): Observable<Paginated<PsychologistSummary>> {
    return this.http.get<Paginated<PsychologistSummary>>(`${API}/psychologists/`, { params: toParams(query) });
  }

  get(id: string): Observable<PsychologistDetail> {
    return this.http.get<PsychologistDetail>(`${API}/psychologists/${id}/`);
  }

  myAchievements(): Observable<PsychologistAchievement[]> {
    return this.http.get<PsychologistAchievement[]>(`${API}/psychologists/me/achievements/`);
  }

  addAchievement(body: AchievementInput): Observable<PsychologistAchievement> {
    return this.http.post<PsychologistAchievement>(`${API}/psychologists/me/achievements/`, body);
  }

  deleteAchievement(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/psychologists/me/achievements/${id}/`);
  }
}
