"""
apt_project/apt/services.py
FastAPI server.py 의 비즈니스 로직을 Django 용으로 이식한 서비스 레이어.
뷰(api.py)에서 호출하며, fetch_data11 모듈에 직접 의존합니다.
"""
from collections import defaultdict
import concurrent.futures
import logging
import math
import re
import threading

import pandas as pd

from . import fetch_data11

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# 시(City) 전체 실거래 캐시
# ──────────────────────────────────────────────────────────────
_city_cache: dict = {}
_city_cache_lock = threading.Lock()


def _fetch_city_area_price(City: str, start_date: str, end_date: str) -> pd.DataFrame:
    sido = fetch_data11.area_sort(City)
    prefix = City + ' '
    districts = [
        str(row['locatadd_nm'])[len(prefix):].strip()
        for _, row in sido.iterrows()
        if str(row['locatadd_nm']).startswith(prefix)
    ]
    logger.info('시 전체 수집 시작: %s %s~%s (%d개 구)', City, start_date, end_date, len(districts))

    def _fetch_with_tag(district):
        try:
            df = fetch_data11.area_price(City, district, start_date, end_date)
            if not df.empty:
                df['_district'] = district
            return df
        except Exception as e:
            logger.warning('구 수집 실패 %s: %s', district, e)
            return pd.DataFrame()

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        dfs = list(pool.map(_fetch_with_tag, districts))

    dfs = [df for df in dfs if not df.empty]
    result = pd.concat(dfs).reset_index(drop=True) if dfs else pd.DataFrame()
    logger.info('시 전체 수집 완료: %d건', len(result))
    return result


def get_city_area_price(City: str, start_date: str, end_date: str) -> pd.DataFrame:
    key = (City, start_date, end_date)
    with _city_cache_lock:
        if key in _city_cache:
            return _city_cache[key]
    df = _fetch_city_area_price(City, start_date, end_date)
    with _city_cache_lock:
        _city_cache[key] = df
    return df


# ──────────────────────────────────────────────────────────────
# 공통 유틸
# ──────────────────────────────────────────────────────────────

def parse_money_to_manwon(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip().replace(',', '').replace('만원', '')
    if not s:
        return None
    m = re.match(r'^\s*(\d+)\s*억\s*(\d+)?\s*$', s)
    if m:
        eok = int(m.group(1))
        man = int(m.group(2) or 0)
        return eok * 10_000 + man
    s = re.sub(r'[^\d]', '', s)
    return int(s) if s else None


def normalize_price(value):
    return parse_money_to_manwon(value)


def _df_scalar(df: pd.DataFrame, col: str, cast=None):
    """DataFrame 컬럼에서 첫 번째 유효한 값을 Python 기본 타입으로 반환."""
    if df is None or df.empty or col not in df.columns:
        return None
    s = df[col].dropna()
    if s.empty:
        return None
    v = s.iloc[0]
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
    except Exception:
        pass
    if cast:
        try:
            return cast(v)
        except Exception:
            return None
    return v


def normalize_price_to_won(value):
    """만원 단위 → 원 단위 변환 (프론트엔드 fmtPrice가 원 단위를 기대함)"""
    manwon = parse_money_to_manwon(value)
    return manwon * 10_000 if manwon is not None else None


def pick_deal_date(row: dict):
    for key in ['dealDate', 'contractDate', '계약일', '거래일', '계약날짜',
                'deal_date', 'contract_date', 'date', '년월', 'ym']:
        v = row.get(key)
        if v not in (None, ''):
            return str(v)
    y = row.get('년') or row.get('dealYear') or row.get('contractYear')
    m = row.get('월') or row.get('dealMonth') or row.get('contractMonth')
    d = row.get('일') or row.get('dealDay')  or row.get('contractDay')
    if y and m:
        return f'{int(y):04d}-{int(m):02d}-{int(d):02d}' if d else f'{int(y):04d}-{int(m):02d}'
    return None


def to_float_or_none(value):
    if value in (None, ''):
        return None
    try:
        return float(value)
    except Exception:
        return None


def build_price_series(items: list[dict]):
    grouped = defaultdict(list)
    for item in items:
        date  = item.get('dealDate')
        price = item.get('price')
        if not date or price is None:
            continue
        ym = str(date)[:7]  # YYYY-MM
        grouped[ym].append(float(price))
    result = [
        {'date': ym, 'avgPrice': round(sum(prices) / len(prices)), 'volume': len(prices)}
        for ym, prices in grouped.items()
    ]
    result.sort(key=lambda x: x['date'])
    return result


def build_district_compare_series(base_df: pd.DataFrame, target_areas: list) -> list:
    """구 전체에서 특정 면적들의 평균 거래금액(원) 산출"""
    if base_df is None or base_df.empty:
        return []
    if '전용면적_숫자' not in base_df.columns or '거래금액' not in base_df.columns:
        return []
    result = []
    for area in sorted(target_areas):
        subset = base_df[base_df['전용면적_숫자'] == float(area)]['거래금액'].dropna()
        prices = [normalize_price_to_won(v) for v in subset]
        prices = [p for p in prices if p is not None]
        if prices:
            result.append({'area': float(area), 'avgPrice': round(sum(prices) / len(prices))})
    return result


def build_area_complex_bars(district_df: pd.DataFrame, target_area: float, current_complex: str, max_bars: int = 30) -> list:
    """구 내 동일 면적 단지별 평균 거래금액(원) — 면적별 비교 차트용"""
    if district_df is None or district_df.empty:
        return []
    if '단지명' not in district_df.columns or '전용면적_숫자' not in district_df.columns:
        return []
    area_f = float(target_area)
    subset = district_df[abs(district_df['전용면적_숫자'] - area_f) <= 1.0]
    if subset.empty:
        return []

    price_col = '거래금액_원' if '거래금액_원' in subset.columns else '거래금액'
    current_norm = fetch_data11.merge_complex_name(str(current_complex).strip())

    result = []
    for complex_name, grp in subset.groupby('단지명'):
        if price_col == '거래금액_원':
            prices = [float(p) for p in grp[price_col].dropna() if p is not None]
        else:
            prices = [normalize_price_to_won(v) for v in grp[price_col].dropna()]
            prices = [float(p) for p in prices if p is not None]
        if not prices:
            continue
        name_norm = fetch_data11.merge_complex_name(str(complex_name).strip())
        result.append({
            'name':      str(complex_name).strip(),
            'avgPrice':  round(sum(prices) / len(prices)),
            'isCurrent': name_norm == current_norm,
        })

    result.sort(key=lambda x: x['avgPrice'])

    # 단지가 많으면 현재 단지 중심으로 max_bars 개만 추출
    if len(result) > max_bars:
        try:
            idx = next(i for i, r in enumerate(result) if r['isCurrent'])
        except StopIteration:
            idx = len(result) // 2
        half = max_bars // 2
        start = max(0, min(idx - half, len(result) - max_bars))
        result = result[start: start + max_bars]

    return result


def build_district_bars(city_df: pd.DataFrame, target_area: float, current_district: str) -> list:
    """25개 구별 동일 면적 평균 거래금액(원) — 구별 비교 차트용"""
    if city_df is None or city_df.empty:
        return []
    if '_district' not in city_df.columns or '전용면적_숫자' not in city_df.columns or '거래금액' not in city_df.columns:
        return []
    area_f = float(target_area)
    subset = city_df[abs(city_df['전용면적_숫자'] - area_f) <= 1.0]
    result = []
    price_col = '거래금액_원' if '거래금액_원' in subset.columns else '거래금액'
    for district, grp in subset.groupby('_district'):
        if price_col == '거래금액_원':
            prices = grp[price_col].dropna().tolist()
        else:
            prices = [normalize_price_to_won(v) for v in grp[price_col].dropna()]
        prices = [float(p) for p in prices if p is not None]
        if prices:
            result.append({
                'district':  district,
                'avgPrice':  round(sum(prices) / len(prices)),
                'isCurrent': district == current_district,
            })
    result.sort(key=lambda x: x['avgPrice'])
    return result


def build_compare_series(items: list[dict]):
    grouped = defaultdict(list)
    for item in items:
        area  = item.get('area')
        price = item.get('price')
        if area is None or price is None:
            continue
        grouped[float(area)].append(float(price))
    result = [
        {'area': float(area), 'avgPrice': round(sum(prices) / len(prices))}
        for area, prices in grouped.items()
    ]
    result.sort(key=lambda x: x['area'])
    return result


def normalize_result_items(df: pd.DataFrame, road_address=None, zip_no=None):
    if df is None or df.empty:
        return []
    items = []
    for _, r in df.iterrows():
        row  = r.to_dict()
        item = {
            **row,
            'dealDate':    pick_deal_date(row),
            'price':       normalize_price_to_won(row.get('거래금액') or row.get('price') or row.get('dealAmount')),
            'area':        row.get('전용면적') or row.get('전용면적_숫자') or row.get('area'),
            'floor':       row.get('층') or row.get('floor'),
            'buildYear':   row.get('건축년도') or row.get('buildYear'),
            'roadAddress': row.get('도로명주소') or road_address,
            'zipNo':       row.get('우편번호') or zip_no,
        }
        # pandas/numpy 타입 → Python 기본 타입 변환
        for k, v in item.items():
            if v is pd.NA or v is pd.NaT:
                item[k] = None
            elif hasattr(v, 'isoformat'):
                item[k] = str(v)[:10]
            elif isinstance(v, float) and math.isnan(v):
                item[k] = None
        items.append(item)
    items.sort(key=lambda x: str(x.get('dealDate') or ''), reverse=True)
    return items


def build_selected_candidate(body: dict):
    road   = (body.get('selected_road_address') or '').strip()
    jibun  = (body.get('selected_jibun_address') or '').strip()
    label  = (body.get('selected_address') or '').strip()
    zip_no = (body.get('zipNo') or '').strip()
    return {
        'rnAdres':  road  or label,
        'lnmAdres': jibun or label,
        'zipNo':    zip_no,
    }


def narrow_base_by_selected_address(base: pd.DataFrame, selected_candidate: dict, top_n_postal_merge: int = 2):
    chosen_zip  = (selected_candidate.get('zipNo') or '').strip()
    chosen_road, chosen_jibun = fetch_data11.split_postal_addr(selected_candidate)
    chosen_dong, chosen_bunji = fetch_data11.extract_dong_bunji_from_addr(chosen_jibun, chosen_road)

    narrowed = None

    # 1차: 법정동 + 번지 매칭
    if chosen_dong and chosen_bunji:
        tmp = base.copy()
        tmp['_bunji'] = tmp['지번'].apply(fetch_data11.extract_bunji)
        tmp = tmp[
            (tmp['법정동'].astype(str).str.strip() == chosen_dong.strip()) &
            (tmp['_bunji'].astype(str).str.strip() == chosen_bunji.strip())
        ].drop(columns=['_bunji'], errors='ignore')
        if not tmp.empty:
            narrowed = tmp

    # 2차: 우편번호 fallback
    if narrowed is None:
        tmp = fetch_data11.add_road_zip_columns(base, top_n=top_n_postal_merge)
        if chosen_zip:
            tmp = tmp[tmp['우편번호_merge'].astype(str).str.strip() == chosen_zip].copy()
        if not tmp.empty:
            narrowed = tmp

    return (narrowed if narrowed is not None else pd.DataFrame(),
            chosen_road, chosen_zip, chosen_jibun, chosen_dong, chosen_bunji)


def find_selected_complex_row(df_list: pd.DataFrame, selected_complex: str):
    selected = str(selected_complex).strip()
    for col in ['단지명', '단지명_병합', 'label', 'name']:
        if col in df_list.columns:
            hit = df_list[df_list[col].astype(str).str.strip() == selected]
            if not hit.empty:
                return hit
    return pd.DataFrame()


def get_first_value(df: pd.DataFrame, candidates: list):
    if df is None or df.empty:
        return None
    for col in candidates:
        if col in df.columns:
            val = df[col].iloc[0]
            if pd.notna(val):
                return val
    return None


def get_target_complex_name(target_row: pd.DataFrame, fallback: str):
    if target_row is None or target_row.empty:
        return str(fallback).strip()
    for col in ['단지명', '단지명_병합', 'label', 'name']:
        if col in target_row.columns:
            val = target_row[col].iloc[0]
            if pd.notna(val):
                s = str(val).strip()
                if s:
                    return s
    return str(fallback).strip()


def compute_district_stats(base_df: pd.DataFrame, apt_avg_won: float | None) -> dict | None:
    if base_df is None or base_df.empty or '거래금액_원' not in base_df.columns:
        return None
    prices = base_df['거래금액_원'].dropna()
    if prices.empty or apt_avg_won is None:
        return None
    d_min  = float(prices.min())
    d_max  = float(prices.max())
    d_avg  = float(prices.mean())
    if d_max <= d_min:
        return None
    pct = float((prices < apt_avg_won).sum() / len(prices) * 100)
    return {
        'districtMin': round(d_min),
        'districtMax': round(d_max),
        'districtAvg': round(d_avg),
        'aptAvg':      round(apt_avg_won),
        'percentile':  round(pct, 1),
    }


def normalize_filter_base_for_complex(
    City, District, start_date, end_date,
    selected_complex, max_price, min_households, max_households,
    max_trade_units=4000, min_name_similarity=0.55,
    max_pyeong_price=None,
):
    df_list = fetch_data11.list_apt_under_price_and_households(
        City=City, District=District,
        max_price=max_price, start_date=start_date, end_date=end_date,
        max_households=max_households, min_households=min_households,
        max_trade_units=max_trade_units, min_name_similarity=min_name_similarity,
        max_pyeong_price=max_pyeong_price,
    )
    if df_list is None or df_list.empty:
        return pd.DataFrame(), None, None, None, pd.DataFrame()

    target_row  = find_selected_complex_row(df_list, selected_complex)
    if target_row.empty:
        return pd.DataFrame(), None, None, None, pd.DataFrame()

    rep_road    = get_first_value(target_row, ['대표도로명주소'])
    rep_zip     = get_first_value(target_row, ['대표우편번호'])
    target_name = get_target_complex_name(target_row, selected_complex)

    base = fetch_data11.area_price(City, District, start_date, end_date)
    if base is None or base.empty:
        return pd.DataFrame(), rep_road, rep_zip, target_name, pd.DataFrame()

    base['단지명_병합'] = base['단지명'].apply(fetch_data11.merge_complex_name)
    target_merge = fetch_data11.merge_complex_name(target_name)

    d = base[base['단지명_병합'].astype(str).str.strip() == str(target_merge).strip()].copy()

    if rep_zip:
        d2 = fetch_data11.add_road_zip_columns(d, top_n=2)
        d2 = d2[d2['우편번호_merge'].astype(str).str.strip() == str(rep_zip).strip()].copy()
        if not d2.empty:
            d = d2

    d['도로명주소'] = d.get('도로명주소', pd.Series(dtype=str)).fillna(rep_road) if '도로명주소' in d.columns else rep_road
    d['우편번호']   = d.get('우편번호', pd.Series(dtype=str)).fillna(rep_zip) if '우편번호' in d.columns else rep_zip

    return d, rep_road, rep_zip, target_name, base


# ──────────────────────────────────────────────────────────────
# 구별 평균가 ticker 서비스
# ──────────────────────────────────────────────────────────────

def svc_district_ticker(City: str, start_date: str, end_date: str) -> dict:
    """구별 평균 실거래가 및 월 변동률 — ticker용"""
    city_df = get_city_area_price(City, start_date, end_date)
    if city_df is None or city_df.empty:
        return {'ok': True, 'items': []}

    if '_district' not in city_df.columns:
        return {'ok': True, 'items': []}

    price_col = '거래금액_원' if '거래금액_원' in city_df.columns else '거래금액'
    date_col  = '계약날짜'    if '계약날짜'    in city_df.columns else None

    items = []
    for district, grp in city_df.groupby('_district'):
        if price_col == '거래금액_원':
            prices = grp[price_col].dropna().tolist()
            prices = [float(p) for p in prices if p is not None]
        else:
            prices = [normalize_price_to_won(v) for v in grp[price_col].dropna()]
            prices = [p for p in prices if p is not None]

        if not prices:
            continue

        avg_won = round(sum(prices) / len(prices))

        # 월 변동률: 마지막 두 달 비교
        change = None
        if date_col and date_col in grp.columns:
            grp2 = grp.copy()
            grp2['_ym'] = grp2[date_col].astype(str).str[:7]
            monthly = {}
            for ym, mgrp in grp2.groupby('_ym'):
                if price_col == '거래금액_원':
                    mp = mgrp[price_col].dropna().tolist()
                    mp = [float(p) for p in mp if p is not None]
                else:
                    mp = [normalize_price_to_won(v) for v in mgrp[price_col].dropna()]
                    mp = [p for p in mp if p is not None]
                if mp:
                    monthly[ym] = sum(mp) / len(mp)

            months = sorted(monthly.keys())
            if len(months) >= 2:
                prev, last = monthly[months[-2]], monthly[months[-1]]
                if prev > 0:
                    change = round((last - prev) / prev * 100, 1)

        items.append({
            'district': district,
            'avgPrice': avg_won,
            'change':   change,
        })

    items.sort(key=lambda x: x['avgPrice'], reverse=True)
    return {'ok': True, 'items': items}


# ──────────────────────────────────────────────────────────────
# 주변 시설 / 임장 블로그 서비스
# ──────────────────────────────────────────────────────────────

def svc_nearby_info(body: dict):
    road_address = body.get('roadAddress', '').strip()
    apt_name     = body.get('aptName', '').strip()
    district     = body.get('District', '').strip()
    if not road_address and not apt_name:
        return {'ok': False, 'error': '주소 또는 단지명이 필요합니다'}
    from . import fetch_nearby
    result = fetch_nearby.fetch_nearby_info(road_address, apt_name, district)
    return {'ok': True, **result}


# ──────────────────────────────────────────────────────────────
# 주소 모드 서비스
# ──────────────────────────────────────────────────────────────

def svc_address_candidates(body: dict):
    addr_key  = str(body.get('addr_key', '')).strip()
    top_n     = int(body.get('top_n_addr', 10))
    mode, cands = fetch_data11.resolve_address_candidates(addr_key, top_n=top_n)
    items = []
    for c in cands:
        road, jibun = fetch_data11.split_postal_addr(c)
        items.append({
            'zipNo':        (c.get('zipNo') or '').strip(),
            'roadAddress':  road,
            'jibunAddress': jibun,
            'label':        road or jibun or (c.get('zipNo') or ''),
        })
    return {'ok': True, 'mode': mode, 'items': items}


def svc_address_complexes(body: dict):
    City      = body['City']
    District  = body['District']
    start_date = body['start_date']
    end_date   = body['end_date']
    top_n_postal_merge = int(body.get('top_n_postal_merge', 2))

    selected_candidate = build_selected_candidate(body)
    base = fetch_data11.area_price(City, District, start_date, end_date)
    if base.empty:
        return {'ok': True, 'items': []}

    narrowed, chosen_road, chosen_zip, *_ = narrow_base_by_selected_address(
        base, selected_candidate, top_n_postal_merge=top_n_postal_merge
    )
    if narrowed.empty:
        return {'ok': True, 'items': []}

    apt_candidates = sorted(narrowed['단지명'].dropna().unique().tolist())
    return {
        'ok': True,
        'items': [{'label': x, 'name': x} for x in apt_candidates],
        'roadAddress': chosen_road,
        'zipNo': chosen_zip,
    }


def svc_address_areas(body: dict):
    City      = body['City']
    District  = body['District']
    start_date = body['start_date']
    end_date   = body['end_date']
    top_n_postal_merge = int(body.get('top_n_postal_merge', 2))
    selected_complex   = body.get('selected_complex')

    selected_candidate = build_selected_candidate(body)
    base = fetch_data11.area_price(City, District, start_date, end_date)
    if base.empty:
        return {'ok': True, 'items': []}

    narrowed, *_ = narrow_base_by_selected_address(
        base, selected_candidate, top_n_postal_merge=top_n_postal_merge
    )
    if narrowed.empty:
        return {'ok': True, 'items': []}

    narrowed = narrowed[narrowed['단지명'].astype(str).str.strip() == str(selected_complex).strip()]
    if narrowed.empty:
        return {'ok': True, 'items': []}

    areas = sorted(narrowed['전용면적_숫자'].dropna().unique().tolist())
    return {
        'ok': True,
        'items': [{'label': f'{float(x):.2f}㎡', 'value': float(x)} for x in areas],
    }


def svc_address_results(body: dict):
    City       = body['City']
    District   = body['District']
    start_date = body['start_date']
    end_date   = body['end_date']
    top_n_postal_merge = int(body.get('top_n_postal_merge', 2))
    top_n_kapt         = int(body.get('top_n_kapt', 10))
    selected_complex   = body.get('selected_complex')
    selected_area      = body.get('selected_area')

    selected_candidate = build_selected_candidate(body)
    base = fetch_data11.area_price(City, District, start_date, end_date)
    if base.empty:
        return {'ok': True, 'items': [], 'priceSeries': [], 'compareSeries': []}

    narrowed, chosen_road, chosen_zip, chosen_jibun, chosen_dong, chosen_bunji = \
        narrow_base_by_selected_address(base, selected_candidate, top_n_postal_merge=top_n_postal_merge)
    if narrowed.empty:
        return {'ok': True, 'items': [], 'priceSeries': [], 'compareSeries': []}

    d = narrowed[narrowed['단지명'].astype(str).str.strip() == str(selected_complex).strip()].copy()
    if d.empty:
        return {'ok': True, 'items': [], 'priceSeries': [], 'compareSeries': []}

    d = d[d['전용면적_숫자'] == float(selected_area)].copy()
    if d.empty:
        return {'ok': True, 'items': [], 'priceSeries': [], 'compareSeries': []}

    if '도로명주소' not in d.columns: d['도로명주소'] = chosen_road
    if '우편번호'   not in d.columns: d['우편번호']   = chosen_zip

    out = d.filter(['단지명', '전용면적', '층', '건축년도', '거래금액', '계약날짜',
                    '법정동', '본번', '부번', '지번', '도로명주소', '우편번호'])\
           .sort_values('계약날짜').reset_index(drop=True)

    if chosen_road: out['도로명주소'] = chosen_road
    if chosen_zip:  out['우편번호']   = chosen_zip

    # detail_by_apt_name 방식: 행 데이터에서 주소 재파싱 → KAPT 매칭 정확도 향상
    out = fetch_data11.fill_representative_address_from_rows(out, top_n_postal=1)
    kapt_zip, kapt_road, kapt_jibun, kapt_dong, kapt_bunji = \
        fetch_data11.chosen_from_representative_address(out)
    apt_name_hint = fetch_data11.merge_complex_name(str(selected_complex).strip())
    kapt_dong_final = kapt_dong or chosen_dong or \
        (out['법정동'].dropna().iloc[0] if '법정동' in out.columns and not out['법정동'].dropna().empty else '')

    out = fetch_data11.enrich_house_parking_by_choice(
        out, city=City, district=District,
        dong=kapt_dong_final, apt_name_hint=apt_name_hint,
        top_n=top_n_kapt,
        chosen_zip=kapt_zip or chosen_zip,
        chosen_road=kapt_road or chosen_road,
        chosen_jibun=kapt_jibun or chosen_jibun,
        chosen_dong=kapt_dong or chosen_dong,
        chosen_bunji=kapt_bunji or chosen_bunji,
    )

    final = out.filter(['단지명', '전용면적', '층', '건축년도', '거래금액', '계약날짜',
                        '도로명주소', '우편번호', '세대수', '전체주차대수']).copy()
    items = normalize_result_items(final, chosen_road, chosen_zip)

    prices_won = [it['price'] for it in items if it.get('price') is not None]
    apt_avg_won = sum(prices_won) / len(prices_won) if prices_won else None

    compare = build_compare_series(items)
    target_areas = [s['area'] for s in compare]
    city_base = get_city_area_price(City, start_date, end_date)
    return {
        'ok': True,
        'items': items,
        'priceSeries':           build_price_series(items),
        'compareSeries':         compare,
        'areaComplexBars':       build_area_complex_bars(base, float(selected_area), str(selected_complex).strip()),
        'districtCompareSeries': build_district_compare_series(base, target_areas),
        'districtBars':          build_district_bars(city_base, target_areas[0] if target_areas else 0, District),
        'aptName':        str(selected_complex).strip(),
        'roadAddress':    chosen_road,
        'households':     _df_scalar(out, '세대수', int),
        'parking':        _df_scalar(out, '전체주차대수', str),
        'districtStats':  compute_district_stats(base, apt_avg_won),
    }


# ──────────────────────────────────────────────────────────────
# 조건 모드 서비스
# ──────────────────────────────────────────────────────────────

def svc_filter_list(body: dict):
    City       = body['City']
    District   = body['District']
    start_date = body['start_date']
    end_date   = body['end_date']
    max_price  = body.get('max_price')       # 원 단위, None이면 필터 미적용
    min_hh     = body.get('min_households')
    max_hh     = body.get('max_households')
    max_pp_raw = body.get('max_pyeong_price')  # 원/평, None이면 필터 미적용

    min_hh = int(min_hh) if min_hh not in (None, '') else None
    max_hh = int(max_hh) if max_hh not in (None, '') else None
    max_pyeong_price = float(max_pp_raw) if max_pp_raw not in (None, '') else None

    df_list = fetch_data11.list_apt_under_price_and_households(
        City=City, District=District, max_price=max_price,
        start_date=start_date, end_date=end_date,
        max_households=max_hh, min_households=min_hh,
        max_trade_units=int(body.get('max_trade_units', 4000)),
        min_name_similarity=float(body.get('min_name_similarity', 0.55)),
        max_pyeong_price=max_pyeong_price,
    )

    if df_list is None or df_list.empty:
        return {'ok': True, 'items': []}

    import re as _re
    import math as _math

    def _clean(v):
        if isinstance(v, float) and not _math.isfinite(v):
            return None
        if hasattr(v, 'isoformat'):
            return str(v)[:10]
        return v

    out = []
    for _, r in df_list.iterrows():
        row = {k: _clean(v) for k, v in r.to_dict().items()}

        # 세대수: 숫자만 추출 (예: "1234세대" → 1234)
        세대수_raw = str(row.get('세대수') or '')
        세대수_digits = _re.sub(r'[^\d]', '', 세대수_raw)
        세대수_num = int(세대수_digits) if 세대수_digits else None

        # 최저거래가: 억 단위 → 만원 단위 (프론트 formatManwon이 만원 기대)
        억 = row.get('최저거래가_억')
        최저거래가_만 = int(float(억) * 10000) if 억 is not None else None

        out.append({
            **row,
            'label':       row.get('단지명') or '',
            'name':        row.get('단지명') or '',
            'roadAddress': row.get('대표도로명주소') or '',
            'zipNo':       row.get('대표우편번호') or '',
            '세대수':      세대수_num,
            '최저거래가':  최저거래가_만,
        })

    from . import fetch_nearby

    def _geocode(item):
        addr = item.get('roadAddress') or ''
        coords = fetch_nearby.geocode_address(addr) if addr else None
        if coords:
            item['lat'], item['lng'] = coords
        return item

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        out = list(pool.map(_geocode, out))

    return {'ok': True, 'items': out}


def svc_filter_detail_areas(body: dict):
    City       = body['City']
    District   = body['District']
    start_date = body['start_date']
    end_date   = body['end_date']
    selected_complex = body.get('selected_complex')
    max_price  = body.get('max_price')
    min_hh     = body.get('min_households')
    max_hh     = body.get('max_households')
    max_pp_raw = body.get('max_pyeong_price')

    min_hh = int(min_hh) if min_hh not in (None, '') else None
    max_hh = int(max_hh) if max_hh not in (None, '') else None
    max_pyeong_price = float(max_pp_raw) if max_pp_raw not in (None, '') else None

    d, rep_road, rep_zip, _, _base = normalize_filter_base_for_complex(
        City=City, District=District,
        start_date=start_date, end_date=end_date,
        selected_complex=selected_complex,
        max_price=max_price, min_households=min_hh, max_households=max_hh,
        max_trade_units=int(body.get('max_trade_units', 4000)),
        min_name_similarity=float(body.get('min_name_similarity', 0.55)),
        max_pyeong_price=max_pyeong_price,
    )

    if d is None or d.empty:
        return {'ok': True, 'items': []}

    areas = sorted(d['전용면적_숫자'].dropna().unique().tolist())
    return {
        'ok': True,
        'items': [{'label': f'{float(x):.2f}㎡', 'value': float(x)} for x in areas],
        'roadAddress': rep_road,
        'zipNo': rep_zip,
    }


# ──────────────────────────────────────────────────────────────
# 역세권 비교 — DB 좌표 캐시 + Haversine
# ──────────────────────────────────────────────────────────────

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi    = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def get_complex_coords(complex_name: str, district: str, road_address: str = ''):
    """DB 캐시 → 카카오 지오코딩 순서로 단지 좌표 반환. DB에 없으면 저장."""
    from .models import AptCoord
    from . import fetch_nearby
    try:
        obj = AptCoord.objects.get(complex_name=complex_name, district=district)
        return (obj.lat, obj.lng)
    except AptCoord.DoesNotExist:
        pass
    coords = None
    if road_address:
        coords = fetch_nearby.geocode_address(road_address)
    if coords is None:
        coords = fetch_nearby.geocode_address(f'{district} {complex_name}')
    if coords:
        lat, lng = coords
        try:
            AptCoord.objects.get_or_create(
                complex_name=complex_name,
                district=district,
                defaults={'road_address': road_address or '', 'lat': lat, 'lng': lng},
            )
        except Exception:
            pass
        return coords
    return None


def svc_subway_peer(body: dict):
    """구 내 동일 면적대 단지별 평단가 vs 지하철 거리 산출."""
    City             = body['City']
    District         = body['District']
    start_date       = body['start_date']
    end_date         = body['end_date']
    selected_complex = str(body.get('selected_complex', '')).strip()
    selected_area    = float(body.get('selected_area', 0))
    road_address     = str(body.get('road_address', '')).strip()
    subway_lat       = body.get('subway_lat')
    subway_lng       = body.get('subway_lng')

    if not subway_lat or not subway_lng:
        return {'ok': False, 'error': '지하철역 좌표가 필요합니다'}
    subway_lat = float(subway_lat)
    subway_lng = float(subway_lng)

    base_df = fetch_data11.area_price(City, District, start_date, end_date)
    if base_df is None or base_df.empty:
        return {'ok': True, 'items': []}
    if '단지명' not in base_df.columns or '전용면적_숫자' not in base_df.columns:
        return {'ok': True, 'items': []}

    area_f  = float(selected_area)
    subset  = base_df[abs(base_df['전용면적_숫자'] - area_f) <= 5.0]
    if subset.empty:
        return {'ok': True, 'items': []}

    price_col    = '거래금액_원' if '거래금액_원' in subset.columns else '거래금액'
    pyeong       = area_f / 3.305785
    current_norm = fetch_data11.merge_complex_name(selected_complex)

    complex_stats: dict = {}
    for complex_name, grp in subset.groupby('단지명'):
        if price_col == '거래금액_원':
            prices = [float(p) for p in grp[price_col].dropna() if p is not None]
        else:
            prices = [normalize_price_to_won(v) for v in grp[price_col].dropna()]
            prices = [float(p) for p in prices if p is not None]
        if not prices:
            continue
        avg_price = sum(prices) / len(prices)
        addr = ''
        if '도로명주소' in grp.columns:
            addrs = grp['도로명주소'].dropna()
            if not addrs.empty:
                addr = str(addrs.iloc[0])
        complex_stats[str(complex_name).strip()] = {
            'avgPrice':       round(avg_price),
            'pricePerPyeong': round(avg_price / pyeong / 10000) if pyeong > 0 else 0,  # 만원/평
            'road_address':   addr,
        }

    def _process(item):
        name, stats = item
        is_current = fetch_data11.merge_complex_name(name) == current_norm
        addr  = road_address if is_current and road_address else stats['road_address']
        coords = get_complex_coords(name, District, addr)
        if not coords:
            return None
        lat, lng = coords
        return {
            'name':          name,
            'subwayDist':    round(haversine_distance(lat, lng, subway_lat, subway_lng)),
            'pricePerPyeong': stats['pricePerPyeong'],
            'avgPrice':      stats['avgPrice'],
            'isCurrent':     is_current,
            'lat':           lat,
            'lng':           lng,
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        raw = list(pool.map(_process, complex_stats.items()))

    items = [r for r in raw if r is not None]
    items.sort(key=lambda x: x['subwayDist'])
    return {'ok': True, 'items': items}


def svc_filter_detail_results(body: dict):
    City       = body['City']
    District   = body['District']
    start_date = body['start_date']
    end_date   = body['end_date']
    selected_complex = body.get('selected_complex')
    selected_area    = body.get('selected_area')
    max_price  = body.get('max_price')
    min_hh     = body.get('min_households')
    max_hh     = body.get('max_households')
    max_pp_raw = body.get('max_pyeong_price')

    min_hh = int(min_hh) if min_hh not in (None, '') else None
    max_hh = int(max_hh) if max_hh not in (None, '') else None
    max_pyeong_price = float(max_pp_raw) if max_pp_raw not in (None, '') else None

    d, rep_road, rep_zip, target_name, base = normalize_filter_base_for_complex(
        City=City, District=District,
        start_date=start_date, end_date=end_date,
        selected_complex=selected_complex,
        max_price=max_price, min_households=min_hh, max_households=max_hh,
        max_trade_units=int(body.get('max_trade_units', 4000)),
        min_name_similarity=float(body.get('min_name_similarity', 0.55)),
        max_pyeong_price=max_pyeong_price,
    )

    if d is None or d.empty:
        return {'ok': True, 'items': [], 'priceSeries': [], 'compareSeries': []}

    use_area = float(selected_area)
    d = d[d['전용면적_숫자'] == use_area].copy()
    if d.empty:
        return {'ok': True, 'items': [], 'priceSeries': [], 'compareSeries': []}

    # fill_representative_address → chosen_from_representative_address → KAPT 매칭 정확도 향상
    if rep_road: d['도로명주소'] = rep_road
    if rep_zip:  d['우편번호']   = rep_zip
    d = fetch_data11.fill_representative_address_from_rows(d, top_n_postal=1)
    kapt_zip, kapt_road, kapt_jibun, kapt_dong, kapt_bunji = \
        fetch_data11.chosen_from_representative_address(d)
    apt_name_hint = fetch_data11.merge_complex_name(str(selected_complex).strip())
    dong = kapt_dong or \
        (d['법정동'].dropna().iloc[0] if '법정동' in d.columns and not d['법정동'].dropna().empty else '')

    d = fetch_data11.enrich_house_parking_by_choice(
        d, city=City, district=District,
        dong=dong, apt_name_hint=apt_name_hint,
        chosen_zip=kapt_zip or rep_zip,
        chosen_road=kapt_road or rep_road,
        chosen_jibun=kapt_jibun,
        chosen_dong=kapt_dong,
        chosen_bunji=kapt_bunji,
    )

    final = d.filter(['단지명', '전용면적', '층', '건축년도', '거래금액', '계약날짜',
                      '도로명주소', '우편번호', '세대수', '전체주차대수']).copy()
    items = normalize_result_items(final, rep_road, rep_zip)

    prices_won = [it['price'] for it in items if it.get('price') is not None]
    apt_avg_won = sum(prices_won) / len(prices_won) if prices_won else None

    compare = build_compare_series(items)
    target_areas = [s['area'] for s in compare]
    city_base = get_city_area_price(City, start_date, end_date)
    return {
        'ok': True,
        'items': items,
        'priceSeries':           build_price_series(items),
        'compareSeries':         compare,
        'areaComplexBars':       build_area_complex_bars(base, use_area, target_name),
        'districtCompareSeries': build_district_compare_series(base, target_areas),
        'districtBars':          build_district_bars(city_base, target_areas[0] if target_areas else 0, District),
        'aptName':        target_name,
        'roadAddress':    rep_road,
        'households':     _df_scalar(d, '세대수', int),
        'parking':        _df_scalar(d, '전체주차대수', str),
        'districtStats':  compute_district_stats(base, apt_avg_won),
    }
