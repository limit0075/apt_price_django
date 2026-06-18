"""
apt_project/apt/fetch_nearby.py
카카오 로컬 API + 네이버 블로그 검색 API 래퍼 모듈.
"""
import logging
import re
from pathlib import Path

import requests
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parent.parent.parent / '.env')

logger = logging.getLogger(__name__)

KAKAO_REST_KEY      = os.getenv('KAKAO_REST_KEY', '')
NAVER_CLIENT_ID     = os.getenv('NAVER_CLIENT_ID', '')
NAVER_CLIENT_SECRET = os.getenv('NAVER_CLIENT_SECRET', '')

logger.debug('KAKAO_REST_KEY 로드 여부: %s', '✓' if KAKAO_REST_KEY else '✗ (비어있음)')

_KAKAO_GEOCODE_URL  = 'https://dapi.kakao.com/v2/local/search/address.json'
_KAKAO_CATEGORY_URL = 'https://dapi.kakao.com/v2/local/search/category.json'
_NAVER_BLOG_URL     = 'https://openapi.naver.com/v1/search/blog.json'

_CATEGORY_CODES = {
    'schools':   'SC4',
    'marts':     'MT1',
    'hospitals': 'HP8',
    'subways':   'SW8',
}

_TIMEOUT = 5  # 초


def _kakao_headers():
    return {'Authorization': f'KakaoAK {KAKAO_REST_KEY}'}


def _norm_complex(s: str) -> str:
    """단지명 비교용 정규화: 공백·아파트 접미사·행정구역 접미사 제거"""
    s = re.sub(r'\s+', '', s)
    s = re.sub(r'아파트$|아파$', '', s)
    s = re.sub(r'(동|구|읍|면)(?=[가-힣])', '', s)
    return s


def _extract_dong(address: str) -> str:
    """주소에서 동/읍/면 추출. 괄호 안 우선, 없으면 주소 본문에서 추출."""
    if not address:
        return ''
    m = re.search(r'[(\s,](\S+(?:동|읍|면))', address)
    if m:
        return m.group(1)
    m = re.search(r'(\S+(?:동|읍|면))\b', address)
    return m.group(1) if m else ''


def _strip_html(text: str) -> str:
    """HTML 태그 제거"""
    if not text:
        return ''
    return re.sub(r'<[^>]+>', '', text).strip()


# ──────────────────────────────────────────────────────────────
# 공개 함수
# ──────────────────────────────────────────────────────────────

def geocode_address(address: str):
    """주소 → (lat, lng) 또는 None"""
    if not address or not KAKAO_REST_KEY:
        return None
    try:
        resp = requests.get(
            _KAKAO_GEOCODE_URL,
            headers=_kakao_headers(),
            params={'query': address},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        docs = resp.json().get('documents', [])
        if not docs:
            logger.warning('카카오 지오코딩 결과 없음: %s', address)
            return None
        doc = docs[0]
        lat = float(doc.get('y', 0))
        lng = float(doc.get('x', 0))
        return (lat, lng)
    except requests.HTTPError as e:
        logger.error('카카오 지오코딩 HTTP 오류: %s | status=%s body=%s',
                     address, e.response.status_code, e.response.text[:200])
        return None
    except Exception as e:
        logger.error('카카오 지오코딩 실패: %s | %s', address, e)
        return None


def search_nearby(lat: float, lng: float, category_group_code: str, radius: int = 1000) -> list:
    """카카오 카테고리 검색 → [{name, distance, walkMins, address, lat, lng}, ...]"""
    if not KAKAO_REST_KEY:
        return []
    try:
        resp = requests.get(
            _KAKAO_CATEGORY_URL,
            headers=_kakao_headers(),
            params={
                'category_group_code': category_group_code,
                'x': lng,
                'y': lat,
                'radius': radius,
                'size': 5,
                'sort': 'distance',
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        docs = resp.json().get('documents', [])
        result = []
        for d in docs[:5]:
            dist_m = int(d.get('distance', 0) or 0)
            result.append({
                'name':     d.get('place_name', ''),
                'distance': dist_m,
                'walkMins': max(1, round(dist_m / 67)),  # 도보 4km/h = 67m/분
                'address':  d.get('road_address_name') or d.get('address_name', ''),
                'lat':      float(d['y']) if d.get('y') else None,
                'lng':      float(d['x']) if d.get('x') else None,
            })
        return result
    except Exception as e:
        logger.error('카카오 카테고리 검색 실패: %s | %s', category_group_code, e)
        return []


def search_naver_blog(query: str, display: int = 5,
                      district: str = '', dong: str = '', apt_name: str = '') -> list:
    """네이버 블로그 검색 → [{title, link, description, bloggername, postdate}, ...]"""
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        return []
    try:
        resp = requests.get(
            _NAVER_BLOG_URL,
            headers={
                'X-Naver-Client-Id':     NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
            },
            params={'query': query, 'display': display, 'sort': 'sim'},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        items = resp.json().get('items', [])
        result = []
        for it in items:
            title = _strip_html(it.get('title', ''))
            if '임장' not in title:
                continue
            result.append({
                'title':       title,
                'link':        it.get('link', ''),
                'description': _strip_html(it.get('description', '')),
                'bloggername': it.get('bloggername', ''),
                'postdate':    it.get('postdate', ''),
            })
            if len(result) >= 5:
                break
        return result
    except Exception as e:
        logger.error('네이버 블로그 검색 실패: %s | %s', query, e)
        return []


def fetch_nearby_info(road_address: str, apt_name: str, district: str = '') -> dict:
    """
    주소 + 단지명 기반으로 주변 시설 + 임장 블로그 정보를 반환.

    반환 dict 키:
      coords, schools, marts, hospitals, subways, blogs
    """
    coords = geocode_address(road_address) if road_address else None

    schools  = []
    marts    = []
    hospitals = []
    subways  = []

    if coords:
        lat, lng = coords
        schools   = search_nearby(lat, lng, _CATEGORY_CODES['schools'],   radius=1000)
        marts     = search_nearby(lat, lng, _CATEGORY_CODES['marts'],     radius=2000)
        hospitals = search_nearby(lat, lng, _CATEGORY_CODES['hospitals'], radius=1000)
        subways   = search_nearby(lat, lng, _CATEGORY_CODES['subways'],   radius=1500)

    dong = _extract_dong(road_address)
    blog_query = ' '.join(filter(None, [district, dong, apt_name, '임장'])) if apt_name else ''
    blogs = search_naver_blog(blog_query, display=20, district=district, dong=dong, apt_name=apt_name) if blog_query else []

    return {
        'coords':    {'lat': coords[0], 'lng': coords[1]} if coords else None,
        'schools':   schools,
        'marts':     marts,
        'hospitals': hospitals,
        'subways':   subways,
        'blogs':     blogs,
    }