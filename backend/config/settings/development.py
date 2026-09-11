from .base import *  # noqa: F403
from .base import env

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Angular dev server talks to Django over plain HTTP.
REFRESH_COOKIE_SECURE = False
REFRESH_COOKIE_SAMESITE = "Lax"

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:4200", "http://127.0.0.1:4200"],
)
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=["http://localhost:4200", "http://127.0.0.1:4200"],
)

INTERNAL_IPS = ["127.0.0.1"]

# `docker compose up` provides Redis, but `manage.py runserver` on its own must
# also work. Without an explicit CACHE_URL, development caches in memory; set
# CACHE_URL=redis://localhost:6379/0 to exercise the real backend.
# The chat WebSocket still needs Redis for its channel layer.
if not env("CACHE_URL", default=""):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "rorschach-development",
        },
    }
    # Same reasoning for the chat channel layer: in-memory works because a
    # development server is one process. It does NOT work across workers, so
    # production always uses Redis.
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
