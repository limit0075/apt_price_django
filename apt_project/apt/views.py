"""apt_project/apt/views.py — 페이지 뷰"""
from django.shortcuts import render


def index(request):
    """메인 SPA 페이지"""
    return render(request, 'apt/index.html')
