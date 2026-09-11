from django.urls import path

from apps.relationships import views

urlpatterns = [
    path("relationships/", views.RelationshipListView.as_view(), name="relationship-list"),
    path("relationships/<uuid:pk>/approve/", views.ApproveView.as_view(), name="relationship-approve"),
    path("relationships/<uuid:pk>/reject/", views.RejectView.as_view(), name="relationship-reject"),
    path("relationships/<uuid:pk>/revoke/", views.RevokeView.as_view(), name="relationship-revoke"),
    path("patients/<uuid:pk>/", views.PatientDetailView.as_view(), name="patient-detail"),
]
