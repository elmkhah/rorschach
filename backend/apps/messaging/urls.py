from django.urls import path

from apps.messaging import views

urlpatterns = [
    path("conversations/", views.ConversationListView.as_view(), name="conversation-list"),
    path("conversations/<uuid:pk>/", views.ConversationDetailView.as_view(), name="conversation-detail"),
    path("conversations/<uuid:pk>/messages/", views.MessageListView.as_view(), name="conversation-messages"),
    path("conversations/<uuid:pk>/read/", views.MarkReadView.as_view(), name="conversation-read"),
]
