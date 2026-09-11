# Rorschach — Backend

Django + DRF backend for the Rorschach (R-PAS) assessment platform.
Design decisions and deviations live in [`documentation/11-backend-notes.md`](../documentation/11-backend-notes.md).

## Run

```bash
python -m venv .venv && .venv/Scripts/activate   # Linux/macOS: source .venv/bin/activate
pip install -r requirements/development.txt
cp .env.example .env

python manage.py migrate
python manage.py seed_catalog        # the ten-card Rorschach structure
python manage.py seed_demo           # test accounts (DEBUG only), password Test1234
python manage.py runserver 8000
```

With Docker (PostgreSQL + Redis + Celery included):

```bash
docker compose up -d                 # from the repository root
```

Interactive API docs: <http://localhost:8000/api/docs/>

## Checks

```bash
python -m pytest          # 128 tests
python -m ruff check .
```

Tests run on SQLite by default so no service is needed; set `DATABASE_URL` to run
the same suite against PostgreSQL.

## Layout

| Path | Responsibility |
| --- | --- |
| `config/` | settings (base/development/production/testing), URLs, ASGI, Celery |
| `apps/accounts` | `User`, authentication, `PATCH /users/me/` |
| `apps/profiles` | patient & psychologist profiles, documents, achievements, directory |
| `apps/relationships` | patient ↔ psychologist link, `GET /patients/{id}/` |
| `apps/catalog` | TestDefinition → TestVersion → TestPhase → AssessmentCard |
| `apps/assessments` | the assessment engine and `rpas/` scoring |
| `apps/messaging` | conversations, messages, the `/ws/` consumer |
| `apps/notifications` | site announcements |
| `apps/media` · `apps/audit` | media metadata, audit log |
| `apps/administration` | admin panel API |
| `common/` | error shape, pagination, permissions, throttling, model bases |

Layering is `View → Serializer → Service → Model`, with selectors for read
queries. Business logic never lives in a view — the assessment state machine is
entirely in `apps/assessments/services.py`.

## Environment

Copy `.env.example` and set at minimum `SECRET_KEY`, `DATABASE_URL` and
`REDIS_URL`. Secrets never belong in the repository.
