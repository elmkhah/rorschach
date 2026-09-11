from django.urls import path

from apps.accounts import views

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("users/me/", views.UpdateMeView.as_view(), name="users-me"),
]
