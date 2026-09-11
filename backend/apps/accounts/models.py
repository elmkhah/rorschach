"""
Identity only.

`User` is kept small on purpose so authentication never mixes with the domain
profile (docs/01 §1); everything role-specific lives in `apps.profiles`.
"""
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.functions import Lower

from apps.accounts.constants import Role
from common.models import UUIDModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, email: str, password: str | None, **extra):
        if not email:
            raise ValueError("ایمیل الزامی است.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra):
        extra.setdefault("role", Role.PATIENT)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(email, password, **extra)

    def create_superuser(self, email: str, password: str | None = None, **extra):
        extra.setdefault("role", Role.ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_verified", True)
        return self._create(email, password, **extra)


class User(UUIDModel, AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True, db_index=True)
    phone = models.CharField(max_length=32, null=True, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, db_index=True)
    is_active = models.BooleanField(default=True)
    # Email/phone ownership confirmation. There is no confirmation flow yet, so
    # it stays False for self-registered accounts.
    is_verified = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"
        constraints = [
            # BR-03: uniqueness is enforced by the database, not only by Python.
            models.UniqueConstraint(Lower("email"), name="users_email_ci_unique"),
        ]

    def __str__(self) -> str:
        return self.email

    @property
    def last_login_at(self):
        """Contract name for Django's `last_login` (docs/03 §3)."""
        return self.last_login

    @property
    def is_patient(self) -> bool:
        return self.role == Role.PATIENT

    @property
    def is_psychologist(self) -> bool:
        return self.role == Role.PSYCHOLOGIST

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN
