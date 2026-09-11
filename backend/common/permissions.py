"""
Role permissions.

Authentication only establishes identity; permission decides access and runs
before any view logic (docs/04 §2). Object-level checks live next to the domain
they protect — see `apps/assessments/permissions.py` for the rule that matters
most (BR-02, docs/02 §8).
"""
from rest_framework.permissions import BasePermission

from apps.accounts.constants import Role


class RolePermission(BasePermission):
    """Base class: subclasses set `allowed_roles`."""

    allowed_roles: tuple[str, ...] = ()
    message = "به این بخش دسترسی ندارید."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.allowed_roles)


class IsPatient(RolePermission):
    allowed_roles = (Role.PATIENT,)


class IsPsychologist(RolePermission):
    allowed_roles = (Role.PSYCHOLOGIST,)


class IsAdmin(RolePermission):
    allowed_roles = (Role.ADMIN,)


class IsPsychologistOrAdmin(RolePermission):
    allowed_roles = (Role.PSYCHOLOGIST, Role.ADMIN)


class IsApprovedPsychologist(IsPsychologist):
    """
    BR-01: an unapproved psychologist is authenticated but has no clinical access.
    """

    message = "حساب شما هنوز توسط مدیر تأیید نشده است."

    def has_permission(self, request, view) -> bool:
        if not super().has_permission(request, view):
            return False
        profile = getattr(request.user, "psychologist_profile", None)
        return bool(profile and profile.is_approved)
