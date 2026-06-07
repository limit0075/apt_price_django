"""apt_project/apt/urls.py"""
from django.urls import path
from . import views, api

urlpatterns = [
    # ── 페이지 ─────────────────────────────────────────────
    path('',  views.index,  name='index'),

    # ── API: 공통 ──────────────────────────────────────────
    path('api/health/', api.health,          name='api_health'),
    path('api/ticker/', api.district_ticker, name='api_ticker'),

    # ── API: 주소 모드 ─────────────────────────────────────
    path('api/address/candidates/', api.address_candidates, name='api_address_candidates'),
    path('api/address/complexes/',  api.address_complexes,  name='api_address_complexes'),
    path('api/address/areas/',      api.address_areas,      name='api_address_areas'),
    path('api/address/results/',    api.address_results,    name='api_address_results'),

    # ── API: 조건 모드 ─────────────────────────────────────
    path('api/filter/list/',            api.filter_list,           name='api_filter_list'),
    path('api/filter/detail/areas/',    api.filter_detail_areas,   name='api_filter_detail_areas'),
    path('api/filter/detail/results/',  api.filter_detail_results, name='api_filter_detail_results'),

    # ── API: 주변 시설 / 임장 블로그 ───────────────────────
    path('api/nearby/', api.nearby_info, name='api_nearby_info'),

    # ── API: 역세권 비교 ─────────────────────────────────────
    path('api/subway_peer/', api.subway_peer, name='api_subway_peer'),
]
