import { compileRoutes, paginate, route } from './mock-router';

describe('mock router', () => {
  const match = compileRoutes([
    route('GET', '/psychologists/me/achievements/', () => 'mine'),
    route('GET', '/psychologists/:id/', () => 'detail'),
    route('POST', '/relationships/:id/approve/', () => 'approve'),
  ]);

  it('matches static routes before params', () => {
    expect(match('GET', '/psychologists/me/achievements/')?.route.pattern).toBe('/psychologists/me/achievements/');
  });

  it('extracts path params', () => {
    const m = match('POST', '/relationships/rel-7/approve/');
    expect(m?.params).toEqual({ id: 'rel-7' });
  });

  it('respects the HTTP method', () => {
    expect(match('GET', '/relationships/rel-7/approve/')).toBeNull();
  });

  it('paginates DRF-style', () => {
    const page = paginate([1, 2, 3, 4, 5], new URLSearchParams('page=2&page_size=2'));
    expect(page).toEqual({ count: 5, next: '?page=3', previous: '?page=1', results: [3, 4] });
  });
});
