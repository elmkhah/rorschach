# syntax=docker/dockerfile:1
#
# No `apt-get` anywhere on purpose. Every dependency ships a manylinux wheel
# (`psycopg[binary]`, Pillow, cryptography), so nothing needs a compiler — and
# pulling gcc from the Debian mirror is the slowest, least reliable step there
# is on a restricted network.
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=5

# Set to a mirror on hosts that reach pypi.org unreliably.
ARG PIP_INDEX_URL=https://pypi.org/simple

WORKDIR /app

RUN groupadd --system rorschach \
    && useradd --system --gid rorschach --create-home rorschach

COPY requirements/ requirements/

# The entrypoint is installed outside /app on purpose, for two reasons:
#
#   1. The development stack bind-mounts ./backend over /app, which shadows the
#      copy baked into the image — including the line-ending fix below.
#   2. A Windows checkout can carry CRLF endings, and /bin/sh rejects a CRLF
#      shebang with `#!/bin/sh^M: No such file or directory`.
#
# Normalising it here, at a path no volume covers, makes the container start
# regardless of how the host checked the repository out. (.gitattributes keeps
# the working copy at LF as well, so `pytest`/`sh` work on the host too.)
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod 0755 /usr/local/bin/docker-entrypoint.sh


FROM base AS development
RUN python -m pip install -r requirements/development.txt
COPY --chown=rorschach:rorschach . .
RUN mkdir -p /app/media /app/staticfiles \
    && chown -R rorschach:rorschach /app/media /app/staticfiles
USER rorschach
EXPOSE 8000
# Absolute name, resolved on PATH: `./docker-entrypoint.sh` would depend on the
# working directory, which the bind mount replaces.
ENTRYPOINT ["docker-entrypoint.sh"]
# Daphne rather than runserver: the chat WebSocket needs ASGI.
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]


FROM base AS production
RUN python -m pip install -r requirements/production.txt
COPY --chown=rorschach:rorschach . .
RUN mkdir -p /app/media /app/staticfiles \
    && chown -R rorschach:rorschach /app/media /app/staticfiles
USER rorschach

ENV DJANGO_SETTINGS_MODULE=config.settings.production
EXPOSE 8000

# Python rather than curl, so the image needs no extra package.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/', timeout=4)"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", \
     "--lifespan", "off", "--workers", "3", "--forwarded-allow-ips", "*"]
