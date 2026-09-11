from django.urls import path

from apps.profiles import views

# `me` routes come first; the detail route only matches a UUID anyway.
urlpatterns = [
    path("psychologists/", views.PsychologistListView.as_view(), name="psychologist-list"),
    path(
        "psychologists/me/achievements/",
        views.MyAchievementsView.as_view(),
        name="my-achievements",
    ),
    path(
        "psychologists/me/achievements/<uuid:pk>/",
        views.MyAchievementDetailView.as_view(),
        name="my-achievement-detail",
    ),
    path("psychologists/me/documents/", views.MyDocumentsView.as_view(), name="my-documents"),
    path("psychologists/<uuid:pk>/", views.PsychologistDetailView.as_view(), name="psychologist-detail"),
]
