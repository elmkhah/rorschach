from .base import *  # noqa: F403
from .base import STORAGES, env

DEBUG = False

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

REFRESH_COOKIE_SECURE = True

# Rorschach card images, avatars and verification documents live in object
# storage; the database only keeps metadata (BR-15).
if env("STORAGE_BACKEND", default="local") == "s3":
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "endpoint_url": env("STORAGE_ENDPOINT"),
            "bucket_name": env("STORAGE_BUCKET"),
            "access_key": env("STORAGE_ACCESS_KEY"),
            "secret_key": env("STORAGE_SECRET_KEY"),
            "region_name": env("STORAGE_REGION", default=""),
            "default_acl": "private",
            "querystring_auth": True,
            "file_overwrite": False,
        },
    }
