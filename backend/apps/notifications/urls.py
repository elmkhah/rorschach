from django.urls import path

from apps.notifications import views

urlpatterns = [
    path("announcements/", views.AnnouncementListView.as_view(), name="announcement-list"),
]
