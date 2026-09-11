# syntax=docker/dockerfile:1
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/ requirements/


FROM base AS development
RUN pip install --upgrade pip && pip install -r requirements/development.txt
COPY . .
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]


FROM base AS production
RUN pip install --upgrade pip && pip install -r requirements/production.txt
COPY . .

# Never run as root in production.
RUN useradd --create-home --uid 1000 rorschach \
    && mkdir -p /app/staticfiles /app/media \
    && chown -R rorschach:rorschach /app
USER rorschach

ENV DJANGO_SETTINGS_MODULE=config.settings.production
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS http://127.0.0.1:8000/api/v1/announcements/ || exit 1

# ASGI: the same process serves REST and the chat WebSocket (docs/02 §7).
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", "--workers", "3"]
