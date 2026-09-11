#!/bin/sh
# Brings a container up to a usable state before handing over to the command:
# wait for PostgreSQL, apply migrations, make sure the Rorschach test structure
# exists. Both seed commands are idempotent, so restarts are cheap.
#
# The worker container skips migrations (RUN_MIGRATIONS=false) — two containers
# racing on `migrate` at startup is a real way to deadlock a fresh database.
set -eu

is_true() {
    case "${1:-}" in
        1 | true | True | TRUE | yes | Yes | YES | on | On | ON) return 0 ;;
        *) return 1 ;;
    esac
}

if [ -n "${DATABASE_URL:-}" ]; then
    echo "waiting for the database…"
    attempts=0
    until python -c "
import os, socket, sys, urllib.parse as u
url = u.urlparse(os.environ['DATABASE_URL'])
if url.scheme.startswith('sqlite'):
    sys.exit(0)
socket.create_connection((url.hostname, url.port or 5432), timeout=2).close()
" 2>/dev/null; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge 60 ]; then
            echo "database unreachable after 60 attempts" >&2
            exit 1
        fi
        sleep 1
    done
fi

if is_true "${RUN_MIGRATIONS:-true}"; then
    python manage.py migrate --noinput
    python manage.py seed_catalog
fi

if is_true "${SEED_DEMO:-false}"; then
    python manage.py seed_demo
fi

if is_true "${RUN_COLLECTSTATIC:-false}"; then
    python manage.py collectstatic --noinput
fi

exec "$@"
