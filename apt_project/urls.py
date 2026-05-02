"""apt_project/urls.py"""
from django.urls import path, include

urlpatterns = [
    path('', include('apt_project.apt.urls')),
]
