"""Admin panel routes — mounted under `/api/v1/admin/`."""
from django.urls import path

from apps.administration import views

urlpatterns = [
    path("stats/", views.StatsView.as_view(), name="admin-stats"),
    path("users/", views.UserListView.as_view(), name="admin-users"),
    path("users/<uuid:pk>/toggle-active/", views.ToggleActiveView.as_view(), name="admin-user-toggle"),
    path("psychologists/", views.PsychologistListView.as_view(), name="admin-psychologists"),
    path("psychologists/<uuid:pk>/verify/", views.VerifyView.as_view(), name="admin-verify"),
    path("relationships/", views.RelationshipListView.as_view(), name="admin-relationships"),
    path("assessments/", views.AssessmentListView.as_view(), name="admin-assessments"),
    path("tests/", views.TestListView.as_view(), name="admin-tests"),
    path("test-versions/<uuid:pk>/", views.TestVersionDetailView.as_view(), name="admin-test-version"),
    path("test-versions/<uuid:pk>/clone/", views.CloneVersionView.as_view(), name="admin-version-clone"),
    path(
        "test-versions/<uuid:pk>/publish/",
        views.PublishVersionView.as_view(),
        name="admin-version-publish",
    ),
    path("cards/<uuid:pk>/", views.CardUpdateView.as_view(), name="admin-card"),
    path("announcements/", views.AnnouncementListView.as_view(), name="admin-announcements"),
    path("announcements/<uuid:pk>/", views.AnnouncementDetailView.as_view(), name="admin-announcement"),
    path("media/", views.MediaListView.as_view(), name="admin-media"),
    path("audit-logs/", views.AuditLogListView.as_view(), name="admin-audit-logs"),
]
