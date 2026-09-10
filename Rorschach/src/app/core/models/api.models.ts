/** DRF-style page. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Error body shape shared by all endpoints. */
export interface ApiErrorBody {
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export interface PageQuery {
  page?: number;
  page_size?: number;
  search?: string;
}
