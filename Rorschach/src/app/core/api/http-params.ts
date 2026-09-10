import { HttpParams } from '@angular/common/http';
import { environment } from '@env/environment';

export const API = environment.apiBaseUrl;

/** Builds HttpParams, dropping empty values. */
export function toParams(query: object = {}): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
  }
  return params;
}
