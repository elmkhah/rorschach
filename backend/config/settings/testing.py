"""
Test settings: no external services required.

PostgreSQL stays the production target; the models deliberately use only
portable field types (JSONField, not Postgres-specific ArrayField) so the suite
also runs on SQLite in CI and on a developer machine without Docker.
Set DATABASE_URL to run the same suite against PostgreSQL.
"""
from .base import *  # noqa: F403
from .base import BASE_DIR, env

DEBUG = False
ALLOWED_HOSTS = ["*"]

SECRET_KEY = "test-secret-key-long-enough-for-hmac-sha256-signing"
SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}  # noqa: F405

DATABASES = {"default": env.db_url("DATABASE_URL", default="sqlite:///" + str(BASE_DIR / "test.sqlite3"))}

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

REFRESH_COOKIE_SECURE = False

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# Throttling would make deterministic tests flaky.
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": ()}  # noqa: F405
