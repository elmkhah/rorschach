import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Me, PatientProfile, PsychologistProfile } from '@core/models';
import { Observable } from 'rxjs';
import { API } from './http-params';

export type ProfilePatch = Partial<
  Pick<PatientProfile, 'first_name' | 'last_name' | 'bio' | 'birth_date' | 'gender'> &
    Pick<PsychologistProfile, 'specialty' | 'city' | 'years_of_experience'>
> & { phone?: string | null };

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly http = inject(HttpClient);

  updateMe(patch: ProfilePatch): Observable<Me> {
    return this.http.patch<Me>(`${API}/users/me/`, patch);
  }

  uploadVerificationDocuments(files: File[]): Observable<Me> {
    const form = new FormData();
    files.forEach((f) => form.append('documents', f, f.name));
    return this.http.post<Me>(`${API}/psychologists/me/documents/`, form);
  }
}
