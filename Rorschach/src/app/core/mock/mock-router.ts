import { ApiErrorBody, Paginated, Role } from '@core/models';
import { MockUser } from './mock-db';

export class MockError {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {}
}

export interface MockContext {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  user: MockUser | null;
}

export interface MockRoute {
  method: string;
  pattern: string;
  handler: (ctx: MockContext) => unknown;
  /** No authentication required. */
  public?: boolean;
  roles?: Role[];
  status?: number;
}

interface CompiledRoute {
  route: MockRoute;
  regex: RegExp;
  keys: string[];
}

export function route(
  method: string,
  pattern: string,
  handler: MockRoute['handler'],
  opts: Omit<MockRoute, 'method' | 'pattern' | 'handler'> = {},
): MockRoute {
  return { method, pattern, handler, ...opts };
}

export function compileRoutes(routes: MockRoute[]) {
  const compiled: CompiledRoute[] = routes.map((route) => {
    const keys: string[] = [];
    const source = route.pattern.replace(/:(\w+)/g, (_m, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    return { route, keys, regex: new RegExp(`^${source}$`) };
  });

  return (method: string, path: string) => {
    for (const c of compiled) {
      if (c.route.method !== method) continue;
      const m = c.regex.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      c.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: c.route, params };
    }
    return null;
  };
}

export function fail(status: number, detail: string, errors?: Record<string, string[]>): never {
  throw new MockError(status, { detail, errors });
}

export function requireUser(ctx: MockContext): MockUser {
  return ctx.user ?? fail(401, 'احراز هویت لازم است.');
}

export function paginate<T>(items: T[], query: URLSearchParams, defaultSize = 20): Paginated<T> {
  const page = Math.max(1, Number(query.get('page') ?? 1));
  const size = Math.max(1, Number(query.get('page_size') ?? defaultSize));
  const start = (page - 1) * size;
  return {
    count: items.length,
    next: start + size < items.length ? `?page=${page + 1}` : null,
    previous: page > 1 ? `?page=${page - 1}` : null,
    results: items.slice(start, start + size),
  };
}

export function matchesSearch(query: URLSearchParams, ...fields: (string | null | undefined)[]): boolean {
  const q = query.get('search')?.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
