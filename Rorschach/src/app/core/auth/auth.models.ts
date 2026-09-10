import { Me, Role } from '@core/models';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  role: Exclude<Role, 'ADMIN'>;
  email: string;
  password: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  specialty?: string;
  professional_code?: string;
}

/** Access token travels in the body and lives in memory only; refresh is an HttpOnly cookie. */
export interface AuthResponse {
  access: string;
  me: Me;
}
