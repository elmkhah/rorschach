from django.urls import path

from apps.assessments import views

base = "assessments/sessions"

urlpatterns = [
    path(f"{base}/", views.SessionListView.as_view(), name="session-list"),
    path(f"{base}/<uuid:pk>/", views.SessionDetailView.as_view(), name="session-detail"),
    # Examinee runtime
    path(f"{base}/<uuid:pk>/state/", views.RunStateView.as_view(), name="session-state"),
    path(f"{base}/<uuid:pk>/start/", views.StartView.as_view(), name="session-start"),
    path(f"{base}/<uuid:pk>/responses/", views.SubmitResponseView.as_view(), name="session-responses"),
    path(f"{base}/<uuid:pk>/next/", views.NextView.as_view(), name="session-next"),
    path(f"{base}/<uuid:pk>/clarifications/", views.ClarifyView.as_view(), name="session-clarify"),
    path(f"{base}/<uuid:pk>/complete/", views.CompleteView.as_view(), name="session-complete"),
    path(f"{base}/<uuid:pk>/events/", views.EventsView.as_view(), name="session-events"),
    # Psychologist / admin
    path(f"{base}/<uuid:pk>/detail/", views.SessionDetailFullView.as_view(), name="session-full"),
    path(
        f"{base}/<uuid:pk>/responses/<uuid:response_id>/coding/",
        views.CodingView.as_view(),
        name="response-coding",
    ),
    path(f"{base}/<uuid:pk>/analysis/", views.AnalysisView.as_view(), name="session-analysis"),
]
