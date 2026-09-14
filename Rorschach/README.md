# Rorschach — Frontend

Angular 20 SPA for the Rorschach (R-PAS) assessment platform: public site,
patient dashboard and assessment runner, psychologist workspace, admin panel.

Architecture and UI decisions are documented in
[`documentation/08-frontend.md`](../documentation/08-frontend.md) (Persian); the
API contract this app consumes is in
[`documentation/04-api-design.md`](../documentation/04-api-design.md).

## Run

```bash
npm ci
npm start      # http://localhost:4200 — proxies /api and /ws to http://127.0.0.1:8000
```

The backend must be running (`docker compose up -d --build` from the repository
root). To run the app standalone against the built-in mock backend, set
`useMock: true` in `src/environments/environment.development.ts`.

```bash
npm run build                                          # production build (no mock code)
npx ng test --watch=false --browsers=ChromeHeadless    # 12 tests
```

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Angular 20 — Standalone Components, Signals, `OnPush` |
| Styling | Tailwind CSS 4 + daisyUI 5, custom `rorschach` theme in `src/styles.css` |
| Language | Persian, RTL, YekanBakh font (8 weights), Jalali dates, Persian digits |
| Auth | access token in memory only; refresh token in an `HttpOnly` cookie |
| Realtime | one WebSocket at `/ws/`, authenticated on the first frame |

## Layout

```
src/app/
├── core/       auth · guards · interceptors · api · models · rpas · mock · services
├── shared/     ui · components · pipes · utils · pages
├── layouts/    public · dashboard · focus
└── features/   landing · auth · profile · patient · psychologist · assessment · chat · admin
```

Two rules hold everywhere:

- **No component talks to `HttpClient` directly** — every call goes through
  `core/api/*`. This is what made swapping the mock for the real backend a
  three-line change.
- **The assessment runner mirrors the server, it does not lead it.** Every step
  is a request; the server's `RunState` replaces local state. The client never
  decides which card comes next.

## The mock backend

`src/app/core/mock/` is a complete implementation of the same `/api/v1` contract:
router, handlers, seed data and the R-PAS scoring algorithm. It was the executable
specification the Django backend was written against, and it still backs three of
the unit test suites. Production builds replace `mock.providers.ts` with
`mock.providers.prod.ts`, so no mock code ships.

## Images

Drop files under `public/images/…` and the dashed placeholders disappear on their
own — no code change needed. The expected paths are listed in
`src/app/shared/utils/images.ts`; the test card images
(`public/images/test/1.jpg … 10.jpg`) are already in place.
