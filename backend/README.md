# Rorschach — Backend

Django + DRF backend for the Rorschach (R-PAS) assessment platform.

Full engineering documentation lives in [`documentation/`](../documentation/README.md)
(Persian). The most relevant entries for this directory:

| Doc | Topic |
| --- | --- |
| [02 Architecture](../documentation/02-architecture.md) | layering, state machine, security, realtime |
| [03 Data model](../documentation/03-data-model-er.md) | ERD and the full schema of all 21 tables |
| [04 API reference](../documentation/04-api-design.md) | every one of the 50 routes |
| [10 R-PAS engine](../documentation/10-assessment-rpas.md) | administration rules, variables, findings |
| [11 Backend notes](../documentation/11-backend-notes.md) | deviations from the design and known gaps |
| [12 Testing](../documentation/12-testing-and-quality.md) | what the 154 tests protect |
| [14 AI content words](../documentation/14-ai-content-words.md) | first-round content-word hints through an Iranian OpenAI-compatible relay |

## Run

```bash
python -m venv .venv && .venv/Scripts/activate   # Linux/macOS: source .venv/bin/activate
pip install -r requirements/development.txt
cp .env.example .env

python manage.py migrate
python manage.py seed_catalog        # the ten-card Rorschach structure — needed in every environment
python manage.py seed_demo           # test accounts (DEBUG only), password Test1234
python manage.py runserver 8000
```

With Docker — the recommended path (PostgreSQL + Redis + Celery included):

```bash
docker compose up -d --build         # from the repository root
```

The entrypoint waits for the database, migrates, seeds the test structure, and
creates the demo accounts (`SEED_DEMO=true` by default). All of it is
idempotent, so restarts are cheap. The Angular dev server stays outside Docker:
`cd Rorschach && npm start` already proxies `/api` and `/ws` to `:8000`.

The image installs no system packages — every dependency ships a manylinux
wheel, so there is no compiler to fetch. On a host that cannot reach PyPI,
build with `PIP_INDEX_URL=<mirror> docker compose build`.

Health probe: <http://localhost:8000/health/>
Interactive API docs: <http://localhost:8000/api/docs/>

## Checks

```bash
python -m pytest          # 154 tests
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
| `apps/assessments` | the assessment engine, `rpas/` scoring and `ai/` content-word hints |
| `apps/messaging` | conversations, messages, the `/ws/` consumer |
| `apps/notifications` | site announcements |
| `apps/media` · `apps/audit` | media metadata, audit log |
| `apps/administration` | admin panel API |
| `common/` | error shape, pagination, permissions, throttling, model bases |

Layering is `View → Serializer → Service → Model`, with selectors for read
queries. Business logic never lives in a view — the assessment state machine is
entirely in `apps/assessments/services.py`, and the stage the examinee is on is
derived on every request in `apps/assessments/state.py` rather than stored.

## Environment

Copy `.env.example` and set at minimum `SECRET_KEY`, `DATABASE_URL` and
`REDIS_URL`. Secrets never belong in the repository. The full variable list is in
[07 Deployment §4](../documentation/07-deployment-operations.md).

## Known gap

`common/permissions.py::IsApprovedPsychologist` exists but is not applied to any
view, so a psychologist suspended *after* gaining an active relationship keeps
clinical access through a direct API client. Tracked as D-13 in
[11 Backend notes §4](../documentation/11-backend-notes.md).
