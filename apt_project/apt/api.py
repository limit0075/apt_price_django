"""
apt_project/apt/api.py
Django JSON API 뷰.
모든 뷰는 POST(또는 GET) → JSON 응답.
무거운 작업은 services.py 에 위임합니다.
"""
import json
import math
import threading
import traceback
import concurrent.futures

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from . import services
from . import fetch_data11

_executor: concurrent.futures.ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()


def _get_executor() -> concurrent.futures.ThreadPoolExecutor:
    """StatReloader 재시작 후 shutdown된 executor를 자동 재생성."""
    global _executor
    if _executor is None or _executor._shutdown:
        with _executor_lock:
            if _executor is None or _executor._shutdown:
                _executor = concurrent.futures.ThreadPoolExecutor(max_workers=8)
    return _executor


# ── 헬퍼 ──────────────────────────────────────────────────────

def _body(request) -> dict:
    try:
        return json.loads(request.body)
    except Exception:
        return {}


def _run(fn, *args, timeout=600, **kwargs):
    try:
        future = _get_executor().submit(fn, *args, **kwargs)
    except RuntimeError:
        # interpreter shutdown 중 executor 사용 불가 → 직접 실행
        return fn(*args, **kwargs)
    return future.result(timeout=timeout)


def _err(e: Exception) -> JsonResponse:
    msg = str(e) or type(e).__name__
    traceback.print_exc()
    return JsonResponse({'ok': False, 'error': msg}, status=500)


def _require_base(body: dict):
    required = ['City', 'District', 'start_date', 'end_date']
    missing  = [k for k in required if not body.get(k)]
    if missing:
        return JsonResponse({'ok': False, 'error': f'필수 파라미터 누락: {", ".join(missing)}'}, status=400)
    return None


# ── Health ────────────────────────────────────────────────────

@require_http_methods(['GET'])
def health(request):
    return JsonResponse({'ok': True})


# ── 구별 평균가 ticker ────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def district_ticker(request):
    body = _body(request)
    City       = body.get('City', '서울특별시')
    start_date = body.get('start_date', '202501')
    end_date   = body.get('end_date', '202512')
    try:
        data = _run(services.svc_district_ticker, City, start_date, end_date, timeout=10)
        return JsonResponse(data, encoder=_SafeEncoder)
    except Exception as e:
        return _err(e)


# ── 주소 모드 ─────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def address_candidates(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('addr_key'):
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: addr_key'}, status=400)
    try:
        data = _run(services.svc_address_candidates, body)
        return JsonResponse(data)
    except Exception as e:
        return _err(e)


@csrf_exempt
@require_http_methods(['POST'])
def address_complexes(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('selected_address'):
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: selected_address'}, status=400)
    try:
        data = _run(services.svc_address_complexes, body)
        return JsonResponse(data)
    except Exception as e:
        return _err(e)


@csrf_exempt
@require_http_methods(['POST'])
def address_areas(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('selected_address') or not body.get('selected_complex'):
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: selected_address, selected_complex'}, status=400)
    try:
        data = _run(services.svc_address_areas, body)
        return JsonResponse(data)
    except Exception as e:
        return _err(e)


@csrf_exempt
@require_http_methods(['POST'])
def address_results(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('selected_address') or not body.get('selected_complex') or body.get('selected_area') is None:
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: selected_address, selected_complex, selected_area'}, status=400)
    try:
        data = _run(services.svc_address_results, body)
        return JsonResponse(data, encoder=_SafeEncoder)
    except Exception as e:
        return _err(e)


@csrf_exempt
@require_http_methods(['POST'])
def address_district_bars(request):
    """구별 비교 지연 로딩 — 캐시 확인 후 즉시 반환 (pending=true/false)"""
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if body.get('selected_area') is None:
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: selected_area'}, status=400)
    try:
        data = _run(services.svc_district_bars, body, timeout=10)
        return JsonResponse(data, encoder=_SafeEncoder)
    except Exception as e:
        return _err(e)


# ── 조건 모드 ─────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def filter_list(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('max_price') and not body.get('max_pyeong_price'):
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: max_price 또는 max_pyeong_price'}, status=400)
    min_hh = body.get('min_households')
    max_hh = body.get('max_households')
    if min_hh in (None, '') and max_hh in (None, ''):
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: min_households 또는 max_households'}, status=400)
    try:
        data = _run(services.svc_filter_list, body)
        return JsonResponse(data, encoder=_SafeEncoder)
    except Exception as e:
        return _err(e)


@csrf_exempt
@require_http_methods(['POST'])
def filter_detail_areas(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('selected_complex'):
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: selected_complex'}, status=400)
    try:
        data = _run(services.svc_filter_detail_areas, body)
        return JsonResponse(data)
    except Exception as e:
        return _err(e)


@csrf_exempt
@require_http_methods(['POST'])
def filter_detail_results(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('selected_complex') or body.get('selected_area') is None:
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: selected_complex, selected_area'}, status=400)
    try:
        data = _run(services.svc_filter_detail_results, body)
        return JsonResponse(data, encoder=_SafeEncoder)
    except Exception as e:
        return _err(e)


# ── 역세권 비교 ───────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def subway_peer(request):
    body = _body(request)
    err  = _require_base(body)
    if err: return err
    if not body.get('selected_complex') or body.get('selected_area') is None:
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: selected_complex, selected_area'}, status=400)
    if not body.get('subway_lat') or not body.get('subway_lng'):
        return JsonResponse({'ok': False, 'error': '필수 파라미터 누락: subway_lat, subway_lng'}, status=400)
    try:
        data = _run(services.svc_subway_peer, body)
        return JsonResponse(data, encoder=_SafeEncoder)
    except Exception as e:
        return _err(e)


# ── 주변 시설 / 임장 블로그 ──────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def nearby_info(request):
    body = _body(request)
    try:
        data = _run(services.svc_nearby_info, body)
        return JsonResponse(data, encoder=_SafeEncoder)
    except Exception as e:
        return _err(e)


# ── pandas/numpy 타입 직렬화 ─────────────────────────────────

import json as _json
import numpy as _np
import pandas as _pd

class _SafeEncoder(_json.JSONEncoder):
    def default(self, obj):
        if obj is _pd.NA or obj is _pd.NaT:   return None
        if isinstance(obj, (_np.integer,)):    return int(obj)
        if isinstance(obj, (_np.floating,)):
            v = float(obj)
            return None if _np.isnan(obj) else v
        if isinstance(obj, _np.ndarray):       return obj.tolist()
        if isinstance(obj, _pd.Timestamp):     return str(obj)[:10]
        if hasattr(obj, 'isoformat'):          return obj.isoformat()
        return super().default(obj)
