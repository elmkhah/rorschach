"""
`GET /health/` — the container healthcheck and the load balancer probe.

Deliberately outside `/api/v1/`: it is infrastructure, not part of the API
contract. It touches the database because a process that cannot reach PostgreSQL
is not healthy, however willing it is to answer HTTP.
"""
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache


@never_cache
def health(request):
    checks = {"database": False}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = True
    except Exception:
        pass

    ok = all(checks.values())
    return JsonResponse({"status": "ok" if ok else "degraded", "checks": checks}, status=200 if ok else 503)
