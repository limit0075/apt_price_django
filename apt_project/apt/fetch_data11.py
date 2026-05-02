"""
==========================================================
✅ 통합본(1파일) - query_apts() 단일 진입
- 주소모드(addr_key): EPOST 후보 → 단지/면적 → 상세 + KAPT(세대/주차)
- 조건모드(max_price + (min/max households)): 단지 리스트업(✅ (고층)/(저층) 병합 + 대표 주소 포함)
  + (옵션) 드릴다운: 병합명 기준 상세(고층/저층 합친 실거래) + KAPT 자동 단일 확정

필수:
- DATAGO_KEY, POSTAL_KEY, KAPT_KEY

권장:
- plotly
- (노트북 클릭) anywidget ipywidgets jupyterlab_widgets
==========================================================
"""

from datakart import Datagokr
import pandas as pd
from datetime import datetime
from dateutil.relativedelta import relativedelta
import time
import requests
import xml.etree.ElementTree as ET
from functools import lru_cache
from urllib.parse import unquote
import re
from difflib import SequenceMatcher
from collections import Counter
from dotenv import load_dotenv
import os
import plotly.express as px
import plotly.graph_objects as go

pd.set_option("display.max_rows", None)
pd.set_option("display.max_columns", None)
pd.set_option("display.width", None)
pd.set_option("display.max_colwidth", None)

# =========================
# API KEY
# =========================
load_dotenv()
DATAGO_KEY = os.getenv('DATAGO_KEY')
POSTAL_KEY = os.getenv('POSTAL_KEY')
KAPT_KEY   = os.getenv('KAPT_KEY')


datago = Datagokr(DATAGO_KEY)

# ==========================================================
# 0) 공통 유틸
# ==========================================================
def _norm_key(key: str) -> str:
    k = (key or "").strip()
    if "%" in k:
        k = unquote(k)
    return k

def _sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return float(SequenceMatcher(None, a, b).ratio())

def _to_int(x):
    try:
        if x is None or x == "":
            return None
        return int(str(x).strip())
    except:
        return None

def _f(x, default=0.0) -> float:
    """None/NaN 방지용 float 캐스팅"""
    try:
        if x is None:
            return float(default)
        if isinstance(x, float) and pd.isna(x):
            return float(default)
        return float(x)
    except:
        return float(default)

def extract_bunji(s: str):
    if s is None:
        return None
    s = str(s).strip()
    m = re.search(r"(\d+(?:-\d+)?)", s)
    return m.group(1) if m else None

def normalize_bunji_from_bonbun_bubun(bonbun, bubun):
    if bonbun is None:
        return None
    b1 = str(bonbun).strip()
    if not b1.isdigit():
        return None
    b1n = str(int(b1))
    if bubun is None:
        return b1n
    b2 = str(bubun).strip()
    if not b2.isdigit():
        return b1n
    b2i = int(b2)
    if b2i == 0:
        return b1n
    return f"{b1n}-{b2i}"

def make_dong_srchwrd(umd: str, bonbun, bubun, jibun: str):
    umd = (umd or "").strip()
    bunji = normalize_bunji_from_bonbun_bubun(bonbun, bubun)
    if not bunji:
        bunji = extract_bunji(jibun)
    if not umd or not bunji:
        return None
    return f"{umd} {bunji}".strip()

def parse_trade_amount_to_won(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.replace(",", "", regex=False)
        .str.strip()
        .replace("", pd.NA)
        .astype("Int64") * 10000
    )

def parse_price_to_won_scalar(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return int(x)
    s = str(x).strip().replace(",", "")
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*억", s)
    if m:
        v = float(m.group(1))
        return int(v * 100_000_000)
    if s.isdigit():
        return int(s)
    raise ValueError(f"max_price 형식을 해석할 수 없습니다: {x}")

# ==========================================================
# ✅ (고층)/(저층) 병합용: 단지명 정규화
# ==========================================================
def merge_complex_name(name: str) -> str:
    """
    (고층)/(저층) 같은 층그룹 표기를 제거해서 병합 키를 만든다.
    예) '상계주공10(고층)' -> '상계주공10'
        '상계주공10 (저층)' -> '상계주공10'
    """
    if name is None:
        return ""
    s = str(name).strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\((고층|저층)\)", "", s)
    s = re.sub(r"\(\s*(고층|저층)\s*\)", "", s)
    return s.strip()

def norm_apt_name(s: str) -> str:
    """단지명 비교용 정규화(특수/공백 제거 + 흔한 토큰 제거)"""
    if s is None:
        return ""
    t = str(s).strip().lower()
    t = re.sub(r"\(.*?\)", "", t)
    stop = ["아파트", "apt", "단지", "주공", "임대", "sh", "lh", "관리", "연립", "빌라", "주택", "the"]
    for w in stop:
        t = t.replace(w, "")
    t = re.sub(r"[^0-9가-힣]", "", t)
    return t

def _digits(s: str) -> str:
    if not s:
        return ""
    return "".join(re.findall(r"\d+", str(s)))

def digit_overlap_score(a: str, b: str) -> float:
    """
    숫자(단지 번호 등) 겹침 점수.
    None 방지: 항상 float 반환.
    """
    da, db = _digits(a), _digits(b)
    if not da or not db:
        return 0.0
    # 완전 일치면 크게
    if da == db:
        return 1.0
    # 부분 포함/교집합
    if da in db or db in da:
        return 0.7
    # 공통 숫자 토큰 비율
    sa, sb = set(re.findall(r"\d+", a)), set(re.findall(r"\d+", b))
    inter = len(sa & sb)
    union = len(sa | sb) if (sa or sb) else 1
    return float(inter / union)

# ==========================================================
# 1) EPOST (도로명/우편)
# ==========================================================
POSTAL_URL = (
    "http://openapi.epost.go.kr/postal/retrieveNewAdressAreaCdService/"
    "retrieveNewAdressAreaCdService/getNewAddressListAreaCd"
)
POSTAL_SESSION = requests.Session()

def _parse_postal(xml_text: str):
    root = ET.fromstring(xml_text)
    success = root.findtext(".//successYN")
    if success == "N":
        code = (root.findtext(".//returnCode") or "").strip()
        msg = (root.findtext(".//errMsg") or "").strip()
        if code == "03":
            return []
        raise RuntimeError(f"POSTAL API ERROR returnCode={code}, errMsg={msg}")

    items = root.findall(".//newAddressListAreaCd")
    res = []
    for it in items:
        res.append({
            "zipNo": (it.findtext("zipNo", "") or "").strip(),
            "rnAdres": (it.findtext("rnAdres", "") or "").strip(),
            "lnmAdres": (it.findtext("lnmAdres", "") or "").strip(),
        })
    return res

@lru_cache(maxsize=50000)
def epost_search_top(searchSe: str, srchwrd: str, top_n: int = 10, count_per_page: int = 50):
    if not srchwrd or str(srchwrd).strip() == "":
        return []
    params = {
        "ServiceKey": _norm_key(POSTAL_KEY),
        "searchSe": searchSe,
        "srchwrd": str(srchwrd).strip(),
        "countPerPage": str(count_per_page),
        "currentPage": "1",
    }
    r = POSTAL_SESSION.get(POSTAL_URL, params=params, timeout=(5, 25))
    r.raise_for_status()
    results = _parse_postal(r.text)
    return results[:top_n]

def _detect_addr_mode(addr_key: str) -> str:
    s = ("" if addr_key is None else str(addr_key)).strip()
    if s == "":
        return "none"
    if re.fullmatch(r"\d{5}", s):
        return "zip"
    if re.search(r"(로|길)\s*\d", s):
        return "road"
    return "jibun"

def split_postal_addr(item: dict):
    a = (item.get("rnAdres") or "").strip()
    b = (item.get("lnmAdres") or "").strip()

    def is_road(s: str) -> bool:
        return bool(re.search(r"(로|길)\s*\d", s))

    if is_road(a) and not is_road(b):
        return a or None, b or None
    if is_road(b) and not is_road(a):
        return b or None, a or None

    if len(a) >= len(b):
        return a or None, b or None
    return b or None, a or None

def extract_dong_bunji_from_addr(jibun_addr: str | None, road_addr: str | None):
    for text in [jibun_addr, road_addr]:
        if not text:
            continue
        m = re.search(r"([가-힣0-9]+동)\s*(\d+(?:-\d+)?)", text)
        if m:
            return m.group(1), m.group(2)
    return None, None

def resolve_address_candidates(addr_key: str, top_n: int = 10):
    mode = _detect_addr_mode(addr_key)
    q = str(addr_key).strip()
    if mode == "zip":
        return "zip", epost_search_top("post", q, top_n=top_n)
    if mode == "road":
        return "road", epost_search_top("road", q, top_n=top_n)
    if mode == "jibun":
        return "jibun", epost_search_top("dong", q, top_n=top_n)
    return "none", []

def _choose_one_postal(title: str, cands: list[dict]):
    if not cands:
        print(f"[{title}] 검색 결과가 없습니다.")
        return None
    if len(cands) == 1:
        print(f"[{title}] 후보 1개 → 자동 선택")
        return cands[0]

    print(f"\n[{title}] 후보 {len(cands)}개")
    for i, c in enumerate(cands, 1):
        road, jibun = split_postal_addr(c)
        print(f"{i}) zip={c.get('zipNo')} | 도로명={road} | 지번={jibun}")

    while True:
        try:
            pick = int(input(f"{title} 번호 선택 (1~{len(cands)}): ").strip())
            if 1 <= pick <= len(cands):
                return cands[pick - 1]
        except:
            pass
        print("다시 입력해줘.")

def add_road_zip_columns(df: pd.DataFrame, top_n: int = 2) -> pd.DataFrame:
    if df is None or df.empty:
        return df

    out = df.copy()
    for c in ["법정동", "본번", "부번", "지번"]:
        if c not in out.columns:
            out[c] = None

    out["__srchwrd"] = out.apply(
        lambda r: make_dong_srchwrd(r.get("법정동"), r.get("본번"), r.get("부번"), r.get("지번")),
        axis=1
    )
    uniq = out["__srchwrd"].dropna().unique()

    rows = []
    for q in uniq:
        results = epost_search_top("dong", q, top_n=top_n)
        best = results[0] if results else None
        if best:
            road, _ = split_postal_addr(best)
            rows.append({"__srchwrd": q, "도로명주소_merge": road, "우편번호_merge": best.get("zipNo")})
        else:
            rows.append({"__srchwrd": q, "도로명주소_merge": None, "우편번호_merge": None})

    addr_df = pd.DataFrame(rows)
    out = out.merge(addr_df, on="__srchwrd", how="left").drop(columns=["__srchwrd"])
    return out

# ==========================================================
# 2) 실거래(datakart)
# ==========================================================
def safe_apt_trade(datago, lawd_cd, ymd, retry=3, delay=0.6):
    for i in range(retry):
        try:
            resp = datago.apt_trade(lawd_cd, ymd)
            if not resp:
                return pd.DataFrame()
            return pd.DataFrame(resp)
        except Exception as e:
            print(f"[ERROR] apt_trade {ymd} ({i+1}/{retry}) -> {e}")
            time.sleep(delay * (2 ** i))
    return pd.DataFrame()

def area_sort(area):
    resp = datago.lawd_code(area)
    data = pd.DataFrame(resp).filter(["sido_cd", "sgg_cd", "umd_cd", "ri_cd", "locatadd_nm"])
    data["sido_sgg"] = data["sido_cd"] + data["sgg_cd"]
    umd = data["umd_cd"] == "000"
    ri = data["ri_cd"] == "00"
    sgg = data["sgg_cd"] != "000"
    area = data.loc[umd & ri & sgg]
    return area.filter(["sido_sgg", "locatadd_nm"]).sort_values("locatadd_nm")

def get_months_between(start, end):
    start_date = datetime.strptime(start, "%Y%m")
    end_date = datetime.strptime(end, "%Y%m")
    today = datetime.today().strftime("%Y%m")
    end_date = min(end_date, datetime.strptime(today, "%Y%m"))

    months = []
    cur = start_date
    while cur <= end_date:
        months.append(cur.strftime("%Y%m"))
        cur += relativedelta(months=1)
    return months

def area_price(City, District, start_date, end_date):
    dates = get_months_between(start_date, end_date)
    result = []

    sido = area_sort(City)
    place = f"{City} {District}"
    sido_num = sido[sido["locatadd_nm"] == place][["sido_sgg"]]
    if sido_num.empty:
        raise ValueError("지역명을 찾을 수 없습니다. City/District 확인")
    lawd_cd = sido_num["sido_sgg"].values[0]

    for ymd in dates:
        df = safe_apt_trade(datago, lawd_cd, ymd)
        if df.empty:
            continue

        df["계약날짜"] = df["dealYear"] + "-" + df["dealMonth"] + "-" + df["dealDay"]

        keep = [
            "umdNm", "bonbun", "bubun",
            "aptDong", "aptNm", "buildYear", "dealAmount",
            "계약날짜", "excluUseAr", "floor", "jibun", "buyerGbn"
        ]
        df = df.filter([c for c in keep if c in df.columns])

        if "buyerGbn" in df.columns:
            df = df[df["buyerGbn"] == "개인"].copy()

        result.append(df)
        time.sleep(0.18)

    if not result:
        return pd.DataFrame()

    out = pd.concat(result).reset_index(drop=True)
    out = out.rename(columns={
        "umdNm": "법정동",
        "bonbun": "본번",
        "bubun": "부번",
        "aptDong": "아파트 동명",
        "aptNm": "단지명",
        "buildYear": "건축년도",
        "dealAmount": "거래금액",
        "excluUseAr": "전용면적",
        "floor": "층",
        "jibun": "지번",
    })

    out["계약날짜"] = pd.to_datetime(out["계약날짜"], errors="coerce")
    out["거래금액_원"] = parse_trade_amount_to_won(out["거래금액"])
    out["거래금액_억"] = out["거래금액_원"] / 1e8
    out["전용면적_숫자"] = out["전용면적"].astype(str).str.extract(r"(\d+\.?\d*)").astype(float)

    out = out.dropna(subset=["계약날짜", "거래금액_원", "전용면적_숫자", "단지명"])
    return out

# ==========================================================
# 3) 메뉴 선택
# ==========================================================
def pick_unique_menu(title: str, options: list):
    options = [o for o in options if o is not None and str(o).strip() != ""]
    options = list(dict.fromkeys(options))
    if not options:
        print(f"[{title}] 후보가 없습니다.")
        return None
    if len(options) == 1:
        print(f"[{title}] 후보 1개 → 자동 선택: {options[0]}")
        return options[0]

    print(f"\n[{title}] 후보 {len(options)}개")
    for i, o in enumerate(options, 1):
        print(f"{i}) {o}")
    while True:
        try:
            pick = int(input(f"{title} 번호 선택 (1~{len(options)}): ").strip())
            if 1 <= pick <= len(options):
                return options[pick - 1]
        except:
            pass
        print("다시 입력해줘.")

# ==========================================================
# 4) KAPT (세대/주차) + 주소/단지명 자동확정
# ==========================================================
KAPT_LIST_URL = "http://apis.data.go.kr/1613000/AptListService3/getSidoAptList3"
KAPT_BASS_URL = "http://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4"
KAPT_DTL_URL  = "http://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4"
KAPT_SESSION = requests.Session()

SIDO_NAME_TO_CODE = {
    "서울특별시": "11", "부산광역시": "26", "대구광역시": "27", "인천광역시": "28",
    "광주광역시": "29", "대전광역시": "30", "울산광역시": "31", "세종특별자치시": "36",
    "경기도": "41", "강원특별자치도": "51", "충청북도": "43", "충청남도": "44",
    "전북특별자치도": "52", "전라남도": "46", "경상북도": "47", "경상남도": "48",
    "제주특별자치도": "50",
}

def _kapt_get(url: str, params: dict, debug: bool = False):
    params = dict(params)
    params["serviceKey"] = _norm_key(KAPT_KEY)
    params["_type"] = "json"

    r = KAPT_SESSION.get(url, params=params, timeout=(5, 25))
    r.raise_for_status()
    js = r.json()

    resp = js.get("response", {}) or {}
    header = resp.get("header", {}) or {}
    body = resp.get("body", {}) or {}

    result_code = str(header.get("resultCode", "")).strip()
    result_msg = str(header.get("resultMsg", "")).strip()
    if result_code and result_code != "00":
        if debug:
            print("[KAPT API FAIL] url:", r.url)
            print(" resultCode:", result_code)
            print(" resultMsg :", result_msg)
            print(" body head :", str(body)[:300])
        raise RuntimeError(f"KAPT API FAIL resultCode={result_code}, resultMsg={result_msg}")

    items = body.get("items", None)
    if items is None and "item" in body:
        items = body.get("item")

    if items is None:
        return [], body

    if isinstance(items, dict):
        if "item" in items:
            item = items.get("item", [])
        else:
            item = items
        if isinstance(item, dict):
            item = [item]
        elif item is None:
            item = []
        return item, body

    if isinstance(items, list):
        return items, body

    return [], body

@lru_cache(maxsize=2000)
def kapt_list_by_sido(sido_name: str, numOfRows: int = 2000, max_pages: int = 60):
    sido_code = SIDO_NAME_TO_CODE.get(sido_name)
    if not sido_code:
        raise ValueError(f"시도 코드 매핑이 없습니다: {sido_name}")

    all_items = []
    for page in range(1, max_pages + 1):
        items, body = _kapt_get(KAPT_LIST_URL, {"sidoCode": sido_code, "numOfRows": numOfRows, "pageNo": page})
        if not items:
            break
        all_items.extend(items)

        total = body.get("totalCount")
        if isinstance(total, int) and len(all_items) >= total:
            break
    return all_items

@lru_cache(maxsize=50000)
def get_kapt_basic_raw(kapt_code: str) -> dict:
    items, _ = _kapt_get(KAPT_BASS_URL, {"kaptCode": kapt_code, "numOfRows": 10, "pageNo": 1})
    if not items:
        return {}
    return items[0]

def _pick_household_cnt_from_item(it: dict):
    # BASS 기준: hoCnt가 가장 확실
    for k in ["hoCnt", "totHhldCnt", "totHhld", "hhldCnt", "householdCnt", "kaptHhldCnt"]:
        if k in it and it[k] not in (None, ""):
            v = _to_int(it[k])
            return v if v is not None else it[k]
    return None

@lru_cache(maxsize=50000)
def get_kapt_detail_parking(kapt_code: str) -> dict:
    items, _ = _kapt_get(KAPT_DTL_URL, {"kaptCode": kapt_code, "numOfRows": 10, "pageNo": 1})
    if not items:
        return {}
    it = items[0]
    g = _to_int(it.get("kaptdPcnt"))
    u = _to_int(it.get("kaptdPcntu"))
    total = (g + u) if (g is not None and u is not None) else (_to_int(it.get("parkngCnt")) or _to_int(it.get("totParkngCnt")))
    return {"g": g, "u": u, "t": total, "raw": it}

def format_parking(total, ground, under):
    t = _to_int(total)
    g = _to_int(ground)
    u = _to_int(under)
    if t is None and g is not None and u is not None:
        t = g + u
    parts = []
    if g is not None:
        parts.append(f"지상:{g}")
    if u is not None:
        parts.append(f"지하:{u}")
    if t is not None:
        return f"총:{t}" + (f" ({', '.join(parts)})" if parts else "")
    return None if not parts else "(" + ", ".join(parts) + ")"

def kapt_candidates_topN(city: str, district: str, dong: str, apt_name_hint: str, top_n: int = 10):
    allc = kapt_list_by_sido(city)
    dist = (district or "").strip()
    dn = (dong or "").strip()
    hint = (apt_name_hint or "").strip()

    pool = [it for it in allc if (it.get("as2") == dist and it.get("as3") == dn)]
    if not pool:
        pool = [it for it in allc if it.get("as2") == dist]
    if not pool:
        pool = allc

    scored = []
    for it in pool:
        name = (it.get("kaptName") or "").strip()
        code = (it.get("kaptCode") or "").strip()
        if not name or not code:
            continue
        score = _sim(hint, name) if hint else 0.0
        scored.append((score, it))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in scored[:top_n]]

def _kapt_addr_score(bass_raw: dict,
                     chosen_zip: str | None, chosen_road: str | None, chosen_jibun: str | None,
                     chosen_dong: str | None, chosen_bunji: str | None) -> float:
    if not bass_raw:
        return 0.0

    zip2  = (bass_raw.get("zipcode") or "").strip()
    road2 = (bass_raw.get("doroJuso") or "").strip()
    jib2  = (bass_raw.get("kaptAddr") or "").strip()

    score = 0.0
    if chosen_zip and zip2 and chosen_zip.strip() == zip2:
        score += 10.0
    if chosen_road and road2:
        score += 6.0 * _sim(chosen_road, road2)
    if chosen_jibun and jib2:
        score += 4.0 * _sim(chosen_jibun, jib2)
    if chosen_dong and chosen_bunji and jib2:
        key = f"{chosen_dong} {chosen_bunji}"
        if key in jib2:
            score += 6.0
    return float(score)

def choose_kapt_auto_strict(
    cands: list[dict],
    title: str,
    apt_name_hint: str,
    chosen_zip: str | None = None,
    chosen_road: str | None = None,
    chosen_jibun: str | None = None,
    chosen_dong: str | None = None,
    chosen_bunji: str | None = None,
    # 가중치
    name_weight: float = 6.0,
    digit_weight: float = 3.5,
    # 자동확정 기준
    auto_min_score: float = 14.0,
):
    """
    ✅ 무조건 '자동 확정' 버전
    - 후보별 점수 계산 후, tie 포함해서 정렬 1등을 그대로 확정
    - 사용자 입력 없음
    """
    if not cands:
        print(f"{title} 후보가 없습니다.")
        return None, []

    rows = []
    for it in cands:
        code = (it.get("kaptCode") or "").strip()
        name = (it.get("kaptName") or "").strip()

        bass = get_kapt_basic_raw(code)
        hh = _to_int(_pick_household_cnt_from_item(bass))

        addr_sc = _kapt_addr_score(bass, chosen_zip, chosen_road, chosen_jibun, chosen_dong, chosen_bunji)
        name_sc = _sim(apt_name_hint, name)
        digit_sc = digit_overlap_score(apt_name_hint, name)

        # ✅ None 방지 강제
        addr_sc = _f(addr_sc, 0.0)
        name_sc = _f(name_sc, 0.0)
        digit_sc = _f(digit_sc, 0.0)
        hh_sc = _f(hh or 0, 0.0) / 10000.0  # 극소 tie-break

        final_sc = addr_sc + (name_weight * name_sc) + (digit_weight * digit_sc) + hh_sc

        road = (bass.get("doroJuso") or "").strip() or None
        zipc = (bass.get("zipcode") or "").strip() or None

        rows.append({
            "final_sc": float(final_sc),
            "addr_sc": float(addr_sc),
            "name_sc": float(name_sc),
            "digit_sc": float(digit_sc),
            "hh": hh,
            "kaptCode": code,
            "kaptName": name,
            "zip": zipc,
            "road": road,
            "raw_it": it,
        })

    # ✅ 동률/근접 동률도 자동 확정: 정렬 규칙으로 강제 결정
    rows.sort(key=lambda r: (
        r["final_sc"],
        r["addr_sc"],
        r["digit_sc"],
        r["name_sc"],
        (r["hh"] or 0)
    ), reverse=True)

    best = rows[0]
    if best["final_sc"] < auto_min_score:
        # 점수가 낮아도 "무조건 자동 확정" 규칙이니 그대로 확정 (단, 로그는 남김)
        print(f"[WARN] {title} 점수 낮음({best['final_sc']:.2f})이지만 자동 확정 규칙 적용")

    print(f"\n{title} (자동 확정)")
    print(f" - pick: {best['kaptName']} | {best['kaptCode']} | score={best['final_sc']:.2f} | hh={best['hh']} | zip={best['zip']} | road={best['road']}")
    return best["raw_it"], rows

def enrich_house_parking_by_choice(
    df: pd.DataFrame,
    city: str,
    district: str,
    dong: str,
    apt_name_hint: str,
    top_n: int = 10,
    chosen_zip: str | None = None,
    chosen_road: str | None = None,
    chosen_jibun: str | None = None,
    chosen_dong: str | None = None,
    chosen_bunji: str | None = None,
) -> pd.DataFrame:
    if df is None or df.empty:
        return df

    cands = kapt_candidates_topN(city, district, dong, apt_name_hint=apt_name_hint, top_n=top_n)
    chosen, debug_rows = choose_kapt_auto_strict(
        cands,
        title=f"[KAPT 후보] {district}/{dong}",
        apt_name_hint=apt_name_hint,
        chosen_zip=chosen_zip,
        chosen_road=chosen_road,
        chosen_jibun=chosen_jibun,
        chosen_dong=chosen_dong,
        chosen_bunji=chosen_bunji,
    )

    out = df.copy()
    if not chosen:
        out["세대수"] = None
        out["전체주차대수"] = None
        return out

    kapt_code = chosen.get("kaptCode")
    kapt_name = chosen.get("kaptName")

    bass_raw = get_kapt_basic_raw(kapt_code)
    hh = _pick_household_cnt_from_item(bass_raw)
    prk = get_kapt_detail_parking(kapt_code)

    out["세대수"] = hh
    out["전체주차대수"] = format_parking(prk.get("t"), prk.get("g"), prk.get("u"))

    # 대표 주소도 가능하면 확정해둠
    out["대표도로명주소"] = (bass_raw.get("doroJuso") or "").strip() or None
    out["대표우편번호"]   = (bass_raw.get("zipcode") or "").strip() or None

    print(f"[KAPT 확정] {kapt_name} / kaptCode={kapt_code} | 세대수={hh} | 주차={out['전체주차대수'].iloc[0]}")
    return out

# ==========================================================
# 5) 대표주소 채우기 / chosen_* 생성
# ==========================================================
def fill_representative_address_from_rows(df_detail: pd.DataFrame, top_n_postal: int = 1) -> pd.DataFrame:
    if df_detail is None or df_detail.empty:
        return df_detail

    d = df_detail.copy()
    if "도로명주소" not in d.columns:
        d["도로명주소"] = None
    if "우편번호" not in d.columns:
        d["우편번호"] = None

    # 이미 들어있으면 그대로
    if d["도로명주소"].notna().any() and d["우편번호"].notna().any():
        return d

    def _mk_srchwrd(row):
        q = make_dong_srchwrd(row.get("법정동"), row.get("본번"), row.get("부번"), row.get("지번"))
        if q:
            return q
        umd = (str(row.get("법정동")).strip() if row.get("법정동") is not None else "")
        bunji = extract_bunji(row.get("지번"))
        if umd and bunji:
            return f"{umd} {bunji}"
        return None

    srchwrd_series = d.apply(_mk_srchwrd, axis=1).dropna()
    if srchwrd_series.empty:
        return d

    uniq = list(dict.fromkeys(srchwrd_series.tolist()))
    road_counter = Counter()
    zip_counter = Counter()

    for q in uniq:
        try:
            results = epost_search_top("dong", q, top_n=top_n_postal)
        except Exception:
            results = []
        if not results:
            continue
        best = results[0]
        road, _ = split_postal_addr(best)
        zip_no = (best.get("zipNo") or "").strip()
        if road:
            road_counter[road] += 1
        if zip_no:
            zip_counter[zip_no] += 1

    rep_road = road_counter.most_common(1)[0][0] if road_counter else None
    rep_zip = zip_counter.most_common(1)[0][0] if zip_counter else None

    if rep_road:
        d.loc[d["도로명주소"].isna(), "도로명주소"] = rep_road
    if rep_zip:
        d.loc[d["우편번호"].isna(), "우편번호"] = rep_zip

    return d

def chosen_from_representative_address(df_any: pd.DataFrame):
    """도로명/우편번호로 EPOST 역조회해서 chosen_* 구성"""
    if df_any is None or df_any.empty:
        return (None, None, None, None, None)

    chosen_zip = None
    chosen_road = None
    chosen_jibun = None
    chosen_dong = None
    chosen_bunji = None

    if "우편번호" in df_any.columns:
        z = df_any["우편번호"].dropna().astype(str).str.strip()
        if not z.empty:
            chosen_zip = z.iloc[0]

    if "도로명주소" in df_any.columns:
        r = df_any["도로명주소"].dropna().astype(str).str.strip()
        if not r.empty:
            chosen_road = r.iloc[0]

    if chosen_zip:
        cands = epost_search_top("post", chosen_zip, top_n=1)
        if cands:
            road, jibun = split_postal_addr(cands[0])
            chosen_road = chosen_road or road
            chosen_jibun = jibun
            d, b = extract_dong_bunji_from_addr(jibun, road)
            chosen_dong, chosen_bunji = d, b
            return (chosen_zip, chosen_road, chosen_jibun, chosen_dong, chosen_bunji)

    if chosen_road:
        cands = epost_search_top("road", chosen_road, top_n=1)
        if cands:
            chosen_zip = chosen_zip or (cands[0].get("zipNo") or "").strip()
            road, jibun = split_postal_addr(cands[0])
            chosen_road = chosen_road or road
            chosen_jibun = jibun
            d, b = extract_dong_bunji_from_addr(jibun, road)
            chosen_dong, chosen_bunji = d, b

    return (chosen_zip, chosen_road, chosen_jibun, chosen_dong, chosen_bunji)

# ==========================================================
# 6) 조건모드 리스트업 (✅ (고층)/(저층) 병합 + KAPT 대표주소 포함)
# ==========================================================
def best_kapt_for_apt(city: str, district: str, dong: str, apt_name: str):
    allc = kapt_list_by_sido(city)
    dist = (district or "").strip()
    dn = (dong or "").strip()
    name = (apt_name or "").strip()

    pool = [it for it in allc if (it.get("as2") == dist and it.get("as3") == dn)]
    if not pool:
        pool = [it for it in allc if it.get("as2") == dist]
    if not pool:
        pool = allc

    best = None
    best_score = -1.0
    for it in pool:
        kn = (it.get("kaptName") or "").strip()
        kc = (it.get("kaptCode") or "").strip()
        if not kn or not kc:
            continue
        sc = _sim(name, kn)
        if sc > best_score:
            best_score = sc
            best = it
    return best, float(best_score)

def list_apt_under_price_and_households(
    City: str,
    District: str,
    max_price,
    start_date: str,
    end_date: str,
    max_households: int | None = None,
    min_households: int | None = None,
    max_trade_units: int = 4000,
    min_name_similarity: float = 0.55,
):
    max_price_won = parse_price_to_won_scalar(max_price)
    trade = area_price(City, District, start_date, end_date)
    if trade.empty:
        print("실거래 데이터가 없습니다.")
        return pd.DataFrame()

    # ✅ 병합명 컬럼 추가
    trade["단지명_병합"] = trade["단지명"].apply(merge_complex_name)

    g = (trade
         .groupby(["단지명_병합", "단지명", "법정동", "전용면적_숫자"], as_index=False)
         .agg(
            최저거래가_원=("거래금액_원", "min"),
            최근거래일=("계약날짜", "max"),
            거래건수=("거래금액_원", "count"),
            건축년도=("건축년도", "max"),
         ))

    g = g[g["최저거래가_원"] <= max_price_won].copy()
    if g.empty:
        print("조건(가격) 만족 후보가 없습니다.")
        return pd.DataFrame()

    g = g.sort_values(["최저거래가_원", "최근거래일"], ascending=[True, False]).head(max_trade_units).reset_index(drop=True)

    # ✅ 단지-동별 best KAPT → 세대수/대표주소
    kapt_code_list = []
    hh_list = []
    rep_road_list = []
    rep_zip_list = []

    for _, row in g.iterrows():
        apt_merge = row["단지명_병합"]
        dong = row["법정동"]

        best, score = best_kapt_for_apt(City, District, dong, apt_merge)
        if not best or score < min_name_similarity:
            kapt_code_list.append(None)
            hh_list.append(None)
            rep_road_list.append(None)
            rep_zip_list.append(None)
            continue

        kc = best.get("kaptCode")
        bass_raw = get_kapt_basic_raw(kc)
        kapt_code_list.append(kc)
        hh_list.append(_pick_household_cnt_from_item(bass_raw))
        rep_road_list.append((bass_raw.get("doroJuso") or "").strip() or None)
        rep_zip_list.append((bass_raw.get("zipcode") or "").strip() or None)

    g["kaptCode"] = kapt_code_list
    g["세대수_num"] = hh_list
    g["대표도로명주소"] = rep_road_list
    g["대표우편번호"] = rep_zip_list

    g2 = g.dropna(subset=["세대수_num"]).copy()
    g2["세대수_num"] = g2["세대수_num"].astype(int)

    if min_households is not None and max_households is not None:
        g2 = g2[(g2["세대수_num"] >= int(min_households)) & (g2["세대수_num"] <= int(max_households))].copy()
    elif max_households is not None:
        g2 = g2[g2["세대수_num"] <= int(max_households)].copy()
    elif min_households is not None:
        g2 = g2[g2["세대수_num"] >= int(min_households)].copy()

    if g2.empty:
        print("조건(세대수)까지 만족하는 후보가 없습니다.")
        return pd.DataFrame()

    # ✅ 병합명 기준으로 최종 리스트 생성 (고층/저층 합쳐짐)
    out = (g2
           .groupby(["단지명_병합"], as_index=False)
           .agg(
               대표법정동=("법정동", lambda x: x.value_counts().index[0]),
               최저거래가_원=("최저거래가_원", "min"),
               최고거래가_원=("최저거래가_원", "max"),
               최저면적=("전용면적_숫자", "min"),
               최고면적=("전용면적_숫자", "max"),
               거래건수합=("거래건수", "sum"),
               최근거래일=("최근거래일", "max"),
               건축년도=("건축년도", "max"),
               세대수_num=("세대수_num", "max"),
               대표도로명주소=("대표도로명주소", lambda x: x.dropna().value_counts().index[0] if x.dropna().size else None),
               대표우편번호=("대표우편번호", lambda x: x.dropna().value_counts().index[0] if x.dropna().size else None),
           ))

    out["최저거래가_억"] = out["최저거래가_원"] / 1e8
    out["최고거래가_억"] = out["최고거래가_원"] / 1e8

    out["최저면적"] = out["최저면적"].map(lambda x: f"{x:.2f}㎡" if pd.notna(x) else None)
    out["최고면적"] = out["최고면적"].map(lambda x: f"{x:.2f}㎡" if pd.notna(x) else None)
    out["거래건수합"] = out["거래건수합"].map(lambda x: f"{int(x)}건" if pd.notna(x) else None)
    out["세대수"] = out["세대수_num"].map(lambda x: f"{int(float(x))}세대" if pd.notna(x) else None)

    out = out.rename(columns={"단지명_병합": "단지명"}).copy()

    out = out[[
        "단지명", "대표법정동",
        "대표도로명주소", "대표우편번호",
        "최저면적", "최고면적", "거래건수합", "최근거래일",
        "건축년도", "세대수", "최저거래가_억", "최고거래가_억"
    ]].copy()

    out = out.sort_values(["최저거래가_억", "최근거래일"], ascending=[True, False]).reset_index(drop=True)
    return out

# ==========================================================
# 7) 상세 드릴다운: 병합명 기준(고층/저층 합친 실거래)
# ==========================================================
def detail_by_apt_name(
    City: str,
    District: str,
    start_date: str,
    end_date: str,
    apt_name: str,
    dong_hint: str | None = None,
    top_n_kapt: int = 10,
    plot: bool = False,
    ma_window: int = 3,
    rep_road: str | None = None,
    rep_zip: str | None = None,
):
    base = area_price(City, District, start_date, end_date)
    if base.empty:
        print("조회된 실거래 데이터가 없습니다.")
        return pd.DataFrame()

    # ✅ 병합명 기준으로 전체 합치기
    base["단지명_병합"] = base["단지명"].apply(merge_complex_name)
    target_merge = merge_complex_name(apt_name)

    d = base[base["단지명_병합"].astype(str).str.strip() == str(target_merge).strip()].copy()
    if dong_hint:
        d = d[d["법정동"].astype(str).str.strip() == str(dong_hint).strip()].copy()
    if d.empty:
        print("[FAIL] 단지명/법정동 필터 후 데이터가 없습니다.")
        return pd.DataFrame()

    areas = sorted(d["전용면적_숫자"].dropna().unique().tolist())
    usearea = pick_unique_menu("전용면적 선택", areas)
    if usearea is None:
        return pd.DataFrame()

    d = d[d["전용면적_숫자"] == float(usearea)].copy()
    if d.empty:
        print("[FAIL] 전용면적 필터 후 데이터가 없습니다.")
        return pd.DataFrame()

    if "도로명주소" not in d.columns:
        d["도로명주소"] = None
    if "우편번호" not in d.columns:
        d["우편번호"] = None

    out = (
        d.filter([
            "단지명", "단지명_병합", "전용면적", "층", "건축년도", "거래금액", "계약날짜",
            "법정동", "본번", "부번", "지번", "도로명주소", "우편번호"
        ])
         .sort_values("계약날짜")
         .reset_index(drop=True)
    )

    # ✅ 조건모드에서 받은 대표주소 우선 주입
    if rep_road:
        out["도로명주소"] = rep_road
    if rep_zip:
        out["우편번호"] = rep_zip

    # ✅ 비어있으면 row 기반 보강
    out = fill_representative_address_from_rows(out, top_n_postal=1)

    # ✅ 대표주소 기반 chosen_* 생성
    chosen_zip, chosen_road, chosen_jibun, chosen_dong, chosen_bunji = chosen_from_representative_address(out)

    # ✅ KAPT 자동확정: "사용자가 선택한 병합 단지명"을 힌트로 사용
    kapt_dong = dong_hint if dong_hint else (out["법정동"].dropna().iloc[0] if not out["법정동"].dropna().empty else "")
    out = enrich_house_parking_by_choice(
        out,
        city=City,
        district=District,
        dong=kapt_dong,
        apt_name_hint=target_merge,  # ✅ 중요: 병합명으로 강하게 유도
        top_n=top_n_kapt,
        chosen_zip=chosen_zip,
        chosen_road=chosen_road,
        chosen_jibun=chosen_jibun,
        chosen_dong=chosen_dong,
        chosen_bunji=chosen_bunji,
    )

    final = out.filter([
        "단지명_병합", "전용면적", "층", "건축년도", "거래금액", "계약날짜",
        "도로명주소", "우편번호",
        "세대수", "전체주차대수"
    ]).copy()

    final = final.rename(columns={"단지명_병합": "단지명"}).copy()

    # (원하면 plot 여기서 run_service_pack 붙이기 가능)
    return final

# ==========================================================
# 8) query_apts(): 주소모드 / 조건모드
# ==========================================================
def query_apts(
    City: str,
    District: str,
    start_date: str,
    end_date: str,
    addr_key: str | None = None,
    max_price=None,
    max_households: int | None = None,
    min_households: int | None = None,
    top_n_addr: int = 10,
    top_n_kapt: int = 10,
    top_n_postal_merge: int = 2,
    max_trade_units: int = 4000,
    min_name_similarity: float = 0.55,
    drilldown: bool = True,
    plot: bool = False,
    ma_window: int = 3,
):
    # 모드 결정
    if addr_key is not None and str(addr_key).strip() != "":
        mode = "address"
    elif (max_price is not None) and ((min_households is not None) or (max_households is not None)):
        mode = "filter"
    else:
        raise ValueError(
            "입력 방식이 불명확합니다.\n"
            "1) 주소모드: addr_key를 넣어주세요.\n"
            "2) 조건모드: max_price + (min_households 또는 max_households) 중 하나 이상을 넣어주세요."
        )

    # ----------------------------
    # A) 주소모드
    # ----------------------------
    if mode == "address":
        mode2, cands = resolve_address_candidates(str(addr_key).strip(), top_n=top_n_addr)
        chosen = _choose_one_postal(f"{mode2} 주소", cands)
        if not chosen:
            return pd.DataFrame()

        chosen_zip = (chosen.get("zipNo") or "").strip()
        chosen_road, chosen_jibun = split_postal_addr(chosen)
        chosen_dong, chosen_bunji = extract_dong_bunji_from_addr(chosen_jibun, chosen_road)

        print("\n[선택된 주소]")
        print(" - 도로명:", chosen_road)
        print(" - 지번  :", chosen_jibun)
        print(" - zip  :", chosen_zip)
        print(" - 동/번지:", chosen_dong, chosen_bunji)

        base = area_price(City, District, start_date, end_date)
        if base.empty:
            print("조회된 실거래 데이터가 없습니다.")
            return pd.DataFrame()

        narrowed = None
        if chosen_dong and chosen_bunji:
            tmp = base.copy()
            tmp["_bunji"] = tmp["지번"].apply(extract_bunji)
            tmp = tmp[(tmp["법정동"].astype(str).str.strip() == chosen_dong.strip()) &
                      (tmp["_bunji"].astype(str).str.strip() == chosen_bunji.strip())].copy()
            tmp = tmp.drop(columns=["_bunji"], errors="ignore")
            if not tmp.empty:
                narrowed = tmp

        if narrowed is None:
            print("[WARN] 동+번지 매칭 실패 → 우편번호 merge 진행")
            tmp = add_road_zip_columns(base, top_n=top_n_postal_merge)
            tmp = tmp[tmp["우편번호_merge"].astype(str).str.strip() == chosen_zip].copy()
            if tmp.empty:
                print("[FAIL] 선택 주소로 실거래 데이터를 못 찾았습니다.")
                return pd.DataFrame()
            narrowed = tmp

        base = narrowed

        # 단지 선택
        apt_candidates = sorted(base["단지명"].dropna().unique().tolist())
        apt_name = pick_unique_menu("단지 선택", apt_candidates)
        if not apt_name:
            return pd.DataFrame()

        base = base[base["단지명"] == apt_name].copy()
        if base.empty:
            print("[FAIL] 단지 필터 후 데이터가 없습니다.")
            return pd.DataFrame()

        # 면적 선택
        area_candidates = sorted(base["전용면적_숫자"].dropna().unique().tolist())
        usearea = pick_unique_menu("전용면적 선택", area_candidates)
        if usearea is None:
            return pd.DataFrame()

        base = base[base["전용면적_숫자"] == float(usearea)].copy()
        if base.empty:
            print("[FAIL] 전용면적 필터 후 데이터가 없습니다.")
            return pd.DataFrame()

        out = (
            base.filter(["단지명", "전용면적", "층", "건축년도", "거래금액", "계약날짜", "법정동", "본번", "부번", "지번"])
            .sort_values("계약날짜")
            .reset_index(drop=True)
        )

        out["도로명주소"] = chosen_road
        out["우편번호"] = chosen_zip

        # ✅ 핵심: KAPT 자동확정 시 "사용자가 고른 단지명"을 apt_name_hint로 강하게 반영
        kapt_dong = chosen_dong if chosen_dong else (out["법정동"].dropna().iloc[0] if not out["법정동"].dropna().empty else "")
        out = enrich_house_parking_by_choice(
            out,
            city=City,
            district=District,
            dong=kapt_dong,
            apt_name_hint=apt_name,   # ✅ 중요
            top_n=top_n_kapt,
            chosen_zip=chosen_zip,
            chosen_road=chosen_road,
            chosen_jibun=chosen_jibun,
            chosen_dong=chosen_dong,
            chosen_bunji=chosen_bunji,
        )

        final = out.filter([
            "단지명", "전용면적", "층", "건축년도", "거래금액", "계약날짜",
            "도로명주소", "우편번호",
            "세대수", "전체주차대수"
        ]).copy()

        final = fill_representative_address_from_rows(final, top_n_postal=1)
        return final

    # ----------------------------
    # B) 조건모드
    # ----------------------------
    df_list = list_apt_under_price_and_households(
        City=City,
        District=District,
        max_price=max_price,
        start_date=start_date,
        end_date=end_date,
        max_households=max_households,
        min_households=min_households,
        max_trade_units=max_trade_units,
        min_name_similarity=min_name_similarity,
    )

    if df_list.empty:
        return df_list

    if drilldown:
        print(f"\n[조건모드 결과] 단지 {len(df_list)}개 (상위 30개만 표시)")
        for i, row in df_list.head(30).iterrows():
            print(f"{i+1}) {row['단지명']} | {row.get('대표법정동')} | 최저:{row.get('최저거래가_억'):.2f}억 | {row.get('세대수')} | {row.get('대표우편번호')}")

        print("\n0) 드릴다운 안 하고 리스트 그대로 받기")
        while True:
            try:
                pick = int(input(f"상세로 볼 단지 번호 선택 (0~{min(len(df_list),30)}): ").strip())
                if pick == 0:
                    return df_list
                if 1 <= pick <= min(len(df_list), 30):
                    chosen_row = df_list.iloc[pick - 1]
                    apt_name = chosen_row["단지명"]
                    dong_hint = chosen_row.get("대표법정동")
                    rep_road = chosen_row.get("대표도로명주소")
                    rep_zip  = chosen_row.get("대표우편번호")

                    print(f"\n[드릴다운 선택] {apt_name} / {dong_hint}")
                    df_detail = detail_by_apt_name(
                        City=City,
                        District=District,
                        start_date=start_date,
                        end_date=end_date,
                        apt_name=apt_name,      # ✅ 병합명
                        dong_hint=dong_hint,
                        top_n_kapt=top_n_kapt,
                        plot=plot,
                        ma_window=ma_window,
                        rep_road=rep_road,
                        rep_zip=rep_zip,
                    )
                    return df_detail
            except:
                pass
            print("다시 입력해줘.")

    return df_list

# ==========================================================
# 실행 예시
# ==========================================================
if __name__ == "__main__":
    # 조건모드 예시(병합 적용)
    """ df = query_apts(
        City="서울특별시",
        District="노원구",
        start_date="202501",
        end_date="202512",
        max_price="8억",
        min_households=1000,
        drilldown=True
    )
    print(df.head(50)) """


    df = query_apts(
        City="서울특별시",
        District="동대문구",
        start_date="202501",
        end_date="202512",
        addr_key="한천로 248",
        top_n_addr=10,
        top_n_kapt=10,
        
    )
    print(df.head(50))