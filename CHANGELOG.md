# Changelog

---

## 2026-06-30

### [버그수정] 조건검색 지도 패널 "지도 로딩 중..." 고착 현상

**증상**
카카오 맵 JavaScript SDK 도메인 등록(Kakao 개발자 콘솔 → `http://localhost:8083`) 후에도
FilterSearchMode의 지도 패널이 "지도 로딩 중..."에서 벗어나지 않음.

**원인**
`react-kakao-maps-sdk` v1.2.1의 `useKakaoLoader`는 `[isLoading, error]`를 반환함.
- `isLoading = true`: SDK 로딩 중
- `isLoading = false`: 로딩 완료

그런데 컴포넌트에서 첫 번째 반환값을 `isLoaded`로 명명하고 `!isLoaded`로 조건 체크하여 로직이 반전됨:
- SDK 로딩 완료(`isLoaded=false`) → `!isLoaded=true` → "지도 로딩 중..." 표시 (버그)

**수정**
`front/src/components/FilterSearchMode.tsx` MapView 컴포넌트:
```
변경 전: const [isLoaded, loadError] = useKakaoLoader(...)
         !isLoaded ? <로딩중> : <KakaoMap>

변경 후: const [mapLoading, loadError] = useKakaoLoader(...)
         mapLoading ? <로딩중> : <KakaoMap>
```

---

## 2026-06-24

### [검증] 조건검색 end-to-end 플로우 정상 동작 확인

**확인 내용**
- filter/list: warm cache 기준 3-4초 응답 (cold: 35-40초)
- 단지 선택 → filter/detail/areas: 1-2초
- 면적 선택 → filter/detail/results: 5-11초
- 월별 시계열 차트 정상 렌더링 (leading null 트림 포함)
- 단지 등급(S/A/B/C/D), GAUGE, LEDGER 모두 정상

**발견 사항**
이전 200+ 초 지연 측정은 Playwright 테스트 코드 오류였음.
`time.sleep()` 사용 시 Playwright의 이벤트 루프가 차단되어 응답 이벤트가 늦게 전달되는 것처럼 보임.
`page.wait_for_timeout()` 사용 시 Django 응답 3-4초 정상 확인.

**정리**
`fetch_data11.py`, `services.py`에 추가했던 임시 타이밍 로그 코드(`_log`, `django_timing.log`) 제거.

---

## 2026-06-23

---

### [버그] 국토부 MOLIT API 429 Too Many Requests — 최종 수정

**증상**
성북구 2020-01 ~ 2026-06 (78개월) 조회 시 모든 월에 걸쳐 429 에러가 반복 발생.
Semaphore 방식으로는 동시성만 제한되고 초당 요청 횟수가 제한되지 않아 해결되지 않았음.
최악의 경우 10분 이상 대기 후 TimeoutError로 실패.

---

#### 1. `apt_project/apt/fetch_data11.py` — 시간 기반 레이트 리미터 + Circuit Breaker

**원인 분석**
- 기존 `threading.Semaphore` 방식은 동시 실행 수만 제한하고 초당 호출 빈도는 제어하지 않음
- data.go.kr은 API 키 단위로 초당 요청 수를 제한하므로, 직렬 호출도 빠르게 반복되면 429가 발생
- 일일 할당량 초과 시 모든 재시도가 429로 실패 → retry 5회 × 지수 백오프(5→15→45→135s) = 월당 최대 200초 낭비

**수정 내용**

```python
# 추가 — 모듈 수준 레이트 리미터 변수
_MOLIT_LOCK    = threading.Lock()
_MOLIT_LAST_T  = 0.0
_MOLIT_MIN_GAP = 1.2   # 초당 최대 0.8 요청

def _molit_wait():
    """전역 잠금으로 최소 호출 간격을 보장하는 레이트 리미터."""
    global _MOLIT_LAST_T
    with _MOLIT_LOCK:
        now = time.time()
        gap = _MOLIT_MIN_GAP - (now - _MOLIT_LAST_T)
        if gap > 0:
            time.sleep(gap)
        _MOLIT_LAST_T = time.time()


class _QuotaExceeded(Exception):
    """모든 재시도가 429로 실패 — 일일 할당량 초과 신호."""


def safe_apt_trade(datago, lawd_cd, ymd, retry=3):
    all_429 = True
    for i in range(retry):
        _molit_wait()
        try:
            resp = datago.apt_trade(lawd_cd, ymd)
            if not resp:
                return pd.DataFrame()
            return pd.DataFrame(resp)
        except Exception as e:
            is_429 = "429" in str(e) or "Too Many" in str(e)
            if not is_429:
                all_429 = False
            print(f"[ERROR] apt_trade {ymd} ({i+1}/{retry}) -> {e}")
            if i < retry - 1:
                wait = 5.0 if is_429 else 1.0 * (2 ** i)
                time.sleep(wait)
    if all_429:
        raise _QuotaExceeded(ymd)   # 할당량 초과 신호 발생
    return pd.DataFrame()
```

`area_price` 에 circuit breaker 추가 — 3개월 연속 할당량 초과 시 즉시 중단:

```python
# 수정 전 — 78개월 전부 시도, 타임아웃으로 실패
for ymd in dates:
    df = safe_apt_trade(datago, lawd_cd, ymd)
    ...

# 수정 후 — circuit breaker
consecutive_quota = 0
for ymd in dates:
    try:
        df = safe_apt_trade(datago, lawd_cd, ymd)
    except _QuotaExceeded:
        consecutive_quota += 1
        if consecutive_quota >= 3:
            raise RuntimeError(
                "국토부 MOLIT API 일일 요청 한도 초과. "
                "잠시 후 다시 조회하거나 다음 날 시도하세요."
            )
        continue
    consecutive_quota = 0
    ...
```

`area_price` 내 월별 `time.sleep(0.25)` 제거 — `_molit_wait()`이 이미 간격을 보장하므로 중복.

---

#### 2. `apt_project/apt/api.py` — Executor 안정성 + 타임아웃 연장

**원인**
Django `StatReloader`가 코드 변경을 감지해 서버를 재시작할 때, 모듈 수준에서 생성된 `ThreadPoolExecutor` 인스턴스의 `shutdown()` atexit 핸들러가 이미 실행된 상태에서 새 요청이 들어오면 `cannot schedule new futures after interpreter shutdown` 에러가 발생함.

```python
# 수정 전 — 모듈 임포트 시 1회만 생성
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=8)

def _run(fn, *args, timeout=300, **kwargs):
    future = _executor.submit(fn, *args, **kwargs)
    return future.result(timeout=timeout)

# 수정 후 — 요청 시점에 shutdown 여부를 확인하고 재생성
import threading
_executor: concurrent.futures.ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()

def _get_executor():
    global _executor
    if _executor is None or _executor._shutdown:
        with _executor_lock:
            if _executor is None or _executor._shutdown:
                _executor = concurrent.futures.ThreadPoolExecutor(max_workers=8)
    return _executor

def _run(fn, *args, timeout=600, **kwargs):   # timeout 300s → 600s
    future = _get_executor().submit(fn, *args, **kwargs)
    return future.result(timeout=timeout)
```

---

#### 3. `front/src/components/AddressSearchMode.tsx` — 실제 에러 메시지 전달

**원인**
`djangoApi.ts`의 `post()` 함수가 `ok: false` 응답을 받으면 `data.error` 텍스트로 `Error`를 throw하는데, 컴포넌트의 catch 블록이 이를 삼키고 일반 메시지만 표시함.

```tsx
// 수정 전 — API 에러 메시지 무시
} catch {
    setError("단지 조회 중 오류가 발생했습니다");
}

// 수정 후 — 실제 메시지 표시 (예: "국토부 MOLIT API 일일 요청 한도 초과...")
} catch (err) {
    setError(err instanceof Error ? err.message : "단지 조회 중 오류가 발생했습니다");
}
```

candidates / complexes / areas / results 4개 catch 블록 모두 동일하게 수정.

---

### 검증 결과

| 검증 항목 | 방법 | 결과 |
|-----------|------|------|
| 할당량 초과 시 응답 시간 | `curl POST /api/address/complexes/` | **34초** (수정 전: 600초 후 TimeoutError) |
| 에러 메시지 | 응답 JSON `error` 필드 | **"국토부 MOLIT API 일일 요청 한도 초과. 잠시 후 다시 조회하거나 다음 날 시도하세요."** |
| Executor 재생성 | Django `--noreload` 재시작 후 `/api/health/` | **200 OK** |

---

---

## 2026-06-22

---

### [버그] 국토부 API `buyerGbn=None` 필터링 오류

**증상**
2020년 이후 거래 내역이 0건으로 조회되는 단지 발생 (보문파크뷰자이 등).
2024년 이후 데이터는 정상이나 2020~2023년 구간이 완전히 비어 있었음.

**파일** `apt_project/apt/fetch_data11.py` — `area_price` 함수

**원인**
국토부 실거래가 API는 2024년 이전 구버전 응답에서 `buyerGbn` 필드를 아예 반환하지 않음.
기존 필터가 `buyerGbn == "개인"` 인 행만 통과시켜, 구버전 데이터(값이 `None`/`NaN`)를 전부 제거했음.

```python
# 수정 전 — None/NaN 행 제거
mask = df["buyerGbn"].astype(str).str.strip() == "개인"

# 수정 후 — None/NaN(구버전 API, 값 미제공)도 통과
mask = df["buyerGbn"].isna() | (df["buyerGbn"].astype(str).str.strip() == "개인")
```

### 검증 결과

| 검증 항목 | 결과 |
|-----------|------|
| 보문파크뷰자이 2020-01 ~ 2026-06 조회 건수 | **30건** (수정 전: 0건) |
| 연도별 분포 | 2020년 8건, 2021년 5건, 2022년 7건, 2023년 6건, 2024년~정상 |

---

### [버그] 카카오맵 `LatLng is not a constructor` 에러

**증상**
MAP 패널 클릭 시 콘솔에 `LatLng is not a constructor` 에러 발생. 지도가 표시되지 않음.

**파일**
- `front/index.html`
- `front/vite.config.ts`
- `front/src/components/NearbyPanel.tsx`

**원인 3단계 분석**

| 단계 | 원인 | 수정 |
|------|------|------|
| 1 | Vite 개발 서버 포트가 8080인데, 카카오 콘솔에는 8082만 등록됨 → SDK 로드 차단 | `vite.config.ts` port: 8080 → **8082** |
| 2 | `//dapi.kakao.com` (protocol-relative URL)이 HTTP 페이지에서 `http://`로 해석 → 카카오 CDN이 HTTPS로 리다이렉트하지만 `<script>`는 리다이렉트 미지원 | `index.html` SDK URL을 `**https://**dapi.kakao.com`으로 변경 |
| 3 | `loadKakaoSdk()`이 `window.kakao.maps` 네임스페이스가 존재하면 즉시 resolve했으나, `autoload=false` 모드에서는 `kakao.maps.load()` 를 호출해야 비로소 `LatLng` 등 API 객체가 초기화됨 | `typeof window.kakao?.maps?.LatLng === 'function'` 체크 추가, 모든 경로에서 `load()` 호출 보장 |

```typescript
// 수정 전 — maps 네임스페이스 존재 시 초기화 없이 resolve
if (window.kakao?.maps) { resolve(); return; }

// 수정 후 — LatLng 가용 여부로 초기화 완료 확인, 아니면 load() 호출
if (typeof window.kakao?.maps?.LatLng === 'function') { resolve(); return; }
if (window.kakao?.maps) { window.kakao.maps.load(resolve); return; }
```

`onSubwayFound` prop을 ref로 저장해 `useEffect` 의존성에서 제외하는 패턴도 함께 적용 (무한 재조회 방지).

### 검증 결과

| 검증 항목 | 결과 |
|-----------|------|
| LatLng 준비 여부 | **True** |
| 지도 타일 렌더링 | 정상 표시 |
| 마커 표시 | 정상 표시 |

---

### [최적화] 전체 코드 성능 개선

**배경**
불필요한 리렌더·재계산을 줄여 UI 반응성을 높이고, 정규표현식 반복 컴파일 비용을 제거.

---

#### 1. `front/src/components/ComparePanel.tsx`

- `PriceTooltip` 컴포넌트를 함수 본문 밖으로 이동 → 렌더마다 재생성 방지
- `allDates`, `merged`, `avgData` 를 `useMemo([results])`로 메모화

#### 2. `front/src/components/PriceCharts.tsx`

- `timeseriesData`, `areaData`, `districtData` 를 `useMemo`로 메모화

#### 3. `front/src/components/TradesTable.tsx`

- `pageItems` 슬라이스를 `useMemo([items, page])`로 메모화

#### 4. `apt_project/apt/fetch_data11.py`

모듈 수준에서 정규표현식 사전 컴파일:

```python
_RE_WHITESPACE   = re.compile(r"\s+")
_RE_FLOOR_GROUP  = re.compile(r"\(\s*(고층|저층)\s*\)")
_RE_PAREN        = re.compile(r"\(.*?\)")
_RE_NON_ALPHANUM = re.compile(r"[^0-9가-힣]")
_RE_DIGITS       = re.compile(r"\d+")
_RE_EOK_PRICE    = re.compile(r"(\d+(?:\.\d+)?)\s*억")
```

`merge_complex_name`, `norm_apt_name`, `_digits`, `digit_overlap_score`, `parse_price_to_won_scalar` 함수에서 미리 컴파일된 패턴 사용.

대표 주소가 이미 채워진 경우 `fill_representative_address_from_rows` 호출 스킵:

```python
# 수정 전 — 항상 호출
out = fill_representative_address_from_rows(out, top_n_postal=1)

# 수정 후 — 필요한 경우만 호출
if not rep_road or not rep_zip:
    out = fill_representative_address_from_rows(out, top_n_postal=1)
```

---

---

## 2026-06-17

---

### [버그] 조건검색 결과 화면에서 앱 전체 크래시 — 2건 동시 수정

**증상**
조건검색에서 단지를 선택하고 면적을 고르면 지도·단지 목록이 사라지고 화면이 공백이 됨.
Playwright 검증에서 단지 목록 조회 후 DOM 버튼 수가 42 → 0으로 떨어지고 콘솔에 60개의 PAGE_ERROR 발생이 확인됨.

---

#### Bug 1 — Leaflet 마커 `createIcon` 크래시

**파일** `front/src/components/FilterSearchMode.tsx` — `MapView` 컴포넌트

**원인**
`Marker`에 `icon={isSel ? selectedIcon : undefined}` 를 전달할 때, 선택되지 않은 마커는 `icon` prop이 `undefined` 이므로 react-leaflet이 `L.Icon.Default`로 폴백함. 그런데 파일 최상단에서 `delete L.Icon.Default.prototype._getIconUrl` 로 프로토타입을 삭제한 뒤 `mergeOptions` 로만 URL을 지정했기 때문에, `L.Icon.Default` 인스턴스 생성 시 `createIcon` 호출이 실패함. React가 에러를 컴포넌트 트리 전체로 전파해 페이지가 공백이 됨.

```tsx
// 수정 전 — undefined 전달 시 L.Icon.Default 폴백 → createIcon 실패
const selectedIcon = new L.Icon({ ..., className: "leaflet-marker-selected" });
...
icon={isSel ? selectedIcon : undefined}

// 수정 후 — defaultIcon 명시적 생성, undefined 제거
const ICON_BASE = {
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
  popupAnchor: [1, -34] as [number, number],
};
const defaultIcon  = new L.Icon(ICON_BASE);
const selectedIcon = new L.Icon({ ...ICON_BASE, className: "leaflet-marker-selected" });
...
icon={isSel ? selectedIcon : defaultIcon}
```

---

#### Bug 2 — `MapPin` 미임포트

**파일** `front/src/components/FilterSearchMode.tsx` — 상단 import

**원인**
결과 상세 화면에서 `roadAddress` 표시 시 `<MapPin>` 컴포넌트를 사용하나 `lucide-react` import 목록에 누락됨. 결과가 렌더될 때 `MapPin is not defined` 런타임 에러가 발생해 `FilterSearchMode` 전체가 크래시.

```tsx
// 수정 전
import { Check, X } from "lucide-react";

// 수정 후
import { Check, X, MapPin } from "lucide-react";
```

---

### 검증 결과

| 검증 항목 | 방법 | 결과 |
|-----------|------|------|
| 단지 목록 조회 후 DOM 버튼 수 | Playwright JS eval | **42개** (수정 전: 0) |
| 콘솔 PAGE_ERROR | Playwright `page.on("pageerror")` | **0건** (수정 전: 60건) |
| 면적 선택 후 결과 조회 | `POST /api/filter/detail/results/` | **200, 21건 거래** |
| 가격 시계열 | priceSeries 길이 | **8개월** |
| 구내 단지 비교 바 | areaComplexBars 길이 | **1개** |
| 구별 비교 바 | districtBars 길이 | **16개** |

---

### [기능] 지도 라이브러리 Leaflet → 카카오맵으로 교체

**파일**
- `front/src/components/FilterSearchMode.tsx`
- `front/index.html`
- `front/src/vite-env.d.ts`
- `front/package.json`

**배경**
조건검색 결과 화면의 단지 분포 지도가 OpenStreetMap(Leaflet) 기반이었음. Leaflet 특유의 Vite 번들링 이슈(마커 아이콘 경로 핵 등)를 근본적으로 제거하고 국내 지명·도로명 표시에 최적화된 카카오맵으로 교체 요청.

---

#### 1. npm 패키지 교체

| 제거 | 추가 |
|------|------|
| `leaflet ^1.9.4` | `react-kakao-maps-sdk` |
| `react-leaflet ^4.2.1` | — |
| `@types/leaflet ^1.9.21` | — |

---

#### 2. `FilterSearchMode.tsx` 수정 내용

**import 교체**

```tsx
// 수정 전 — Leaflet
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
delete (L.Icon.Default.prototype as ...)._getIconUrl;
L.Icon.Default.mergeOptions({ ... });

// 수정 후 — 카카오맵
import { Map as KakaoMap, CustomOverlayMap, useMap, useKakaoLoader } from "react-kakao-maps-sdk";
```

**`MapBoundsFitter` → `KakaoBoundsFitter`**

```tsx
// 수정 전 — Leaflet fitBounds
map.fitBounds(pts, { padding: [40, 40] });

// 수정 후 — Kakao setBounds
const bounds = new kakao.maps.LatLngBounds();
pts.forEach(c => bounds.extend(new kakao.maps.LatLng(c.lat!, c.lng!)));
map.setBounds(bounds);
```

**`MapView` 컴포넌트 전면 재작성**

```tsx
// 수정 전 — Leaflet MapContainer + Marker + Popup
<MapContainer center={[37.55, 127.0]} zoom={12} ...>
  <TileLayer url="https://tile.openstreetmap.org/..." />
  <Marker icon={isSel ? selectedIcon : defaultIcon} eventHandlers={{ click: () => onSelect(c) }}>
    <Popup>...</Popup>
  </Marker>
</MapContainer>

// 수정 후 — KakaoMap + CustomOverlayMap (CSS 원형 마커 + 팝업 오버레이)
<KakaoMap center={{ lat: 37.55, lng: 127.0 }} level={7} ...>
  <KakaoBoundsFitter complexes={mapped} />
  <CustomOverlayMap position={{ lat: c.lat!, lng: c.lng! }} yAnchor={1} zIndex={isSel ? 10 : 1}>
    <button onClick={() => onSelect(c)} style={{ /* 원형 마커 */ }} />
  </CustomOverlayMap>
  {selected?.name === c.name && (
    <CustomOverlayMap position={{ lat: c.lat!, lng: c.lng! }} yAnchor={2.6} zIndex={20}>
      <div>단지명 / 최저가 / 도로명주소</div>
    </CustomOverlayMap>
  )}
</KakaoMap>
```

마커 스타일: 비선택 → 파란 원(10px), 선택 → 보라 원(14px). 외부 이미지 URL 의존 없음.

---

#### 3. `front/index.html` — SDK 사전 로딩 추가

**배경**
`useKakaoLoader`를 `MapView` 안에만 두면 검색 결과가 표시될 때 비로소 SDK(~500KB)를 다운로드하기 시작해 "지도 로딩 중…"이 수 초간 표시됨.

**수정 내용**
`<head>`에 스크립트 태그를 추가해 페이지 로드 시점부터 SDK를 미리 받아 둠. `autoload=false`로 초기화는 `useKakaoLoader`에 위임.

```html
<!-- 수정 전 — 없음 -->

<!-- 수정 후 -->
<script type="text/javascript"
  src="//dapi.kakao.com/v2/maps/sdk.js?appkey=%VITE_KAKAO_JS_KEY%&autoload=false">
</script>
```

`%VITE_KAKAO_JS_KEY%`는 Vite 빌드 시 `front/.env`의 `VITE_KAKAO_JS_KEY` 값으로 치환됨. 빌드 결과 `dist/index.html`에서 실제 키 값 치환 확인.

---

### 검증 결과

| 검증 항목 | 방법 | 결과 |
|-----------|------|------|
| TypeScript 빌드 | `npm run build` | **✓ 2,514 모듈, 에러 없음** |
| 빌드 산출물 키 치환 | `dist/index.html` grep | **appkey=07c5bffe…** (정상 치환) |
| Leaflet 코드 잔존 여부 | 소스 grep | **0건** |

---

---

## 2026-06-08

---

### [기능] 단계별 로딩 진행률 바

#### `apt_project/static/js/components/StepIndicator.js`

**배경**
검색 4단계(주소 검색 → 후보 선택 → 단지 선택 → 면적 선택) 진행 시 현재 어디까지 왔는지 시각적으로 파악하기 어려웠음.

**변경 내용**
- `StepIndicator()` 초기화 시 단계 컨테이너 바로 아래에 진행률 바 `<div>` 동적 삽입
- `setStep(prefix, active)` 호출 때마다 `_updateProgress()` 내부 함수로 퍼센트 계산
  - 공식: `Math.round((active - 1) / total * 100)` → step 1=0%, 2=25%, 3=50%, 4=75%
- `completeStep(prefix)` 함수 신규 추가 — 결과 렌더 완료 후 100% 표시용
- `_updateProgress(prefix, pct)` 내부 헬퍼 — fill 너비와 퍼센트 레이블 동시 업데이트

**추가된 함수**
```js
export function completeStep(prefix) {
  _updateProgress(prefix, 100);
}

function _updateProgress(prefix, pct) {
  const fill  = document.getElementById(`step-progress-fill-${prefix}`);
  const label = document.getElementById(`step-progress-pct-${prefix}`);
  if (fill)  fill.style.width  = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
}
```

---

#### `apt_project/static/css/style.css`

**변경 내용**
진행률 바 전용 클래스 4개 추가.

| 클래스 | 역할 |
|--------|------|
| `.step-progress-wrap` | 바 + 퍼센트 레이블 가로 배치 컨테이너 |
| `.step-progress-bar` | 회색 배경 트랙 (height: 5px) |
| `.step-progress-fill` | 채워지는 브랜드 컬러 부분 (transition 0.4s) |
| `.step-progress-pct` | 우측 퍼센트 숫자 레이블 |

---

#### `apt_project/static/js/pages/AddressMode.js`

**변경 내용**
- `completeStep` import 추가
- 결과 표시(`selectArea` → `onSuccess`) 마지막에 `completeStep('a')` 호출 → 100% 완료

---

#### `apt_project/static/js/pages/FilterMode.js`

**변경 내용**
- `completeStep` import 추가
- 결과 표시(`selectArea` → `onSuccess`) 마지막에 `completeStep('f')` 호출 → 100% 완료

---

---

### [버그] `/api/nearby/` 반복 호출 — 원인 3단계 동시 수정

**증상**
단지를 선택한 뒤 면적을 여러 번 바꾸면 Chrome Network 탭에 `POST /api/nearby/`가 계속 반복됐고, 주변 시설·블로그 섹션이 계속 깜빡이는 것처럼 보였음.

**원인 분석**
1. `selectArea` 안에서 매번 `nearbyInfo()` 를 직접 호출 → 면적 선택마다 새 네트워크 요청
2. 데이터 레벨 캐시는 첫 응답이 오기 전 동시 호출 시 경쟁 조건 발생
3. `NearbyInfo()` 렌더 함수가 조건 없이 매 호출마다 실행됨

---

#### `apt_project/static/js/api/client.js`

**수정 내용 — Promise 레벨 캐시 도입**

기존에는 `nearbyInfo()` 함수가 없었고 `request()` 를 직접 호출했음. 데이터 레벨 캐시를 추가하면 첫 응답 도착 전 동시 호출이 각자 요청을 보내는 경쟁 조건이 생김. **Promise 자체를 캐시**하면 응답 대기 중에도 같은 Promise를 반환하므로 요청은 무조건 1회.

```js
// 수정 전 — 캐시 없음, 매 호출마다 fetch 발생
export const nearbyInfo = (base, roadAddress, aptName) =>
  request('/api/nearby/', { ...base, roadAddress, aptName });

// 수정 후 — Promise 레벨 캐시
const _nearbyCache = new Map();
export function nearbyInfo(base, roadAddress, aptName) {
  const key = `${roadAddress}||${aptName}`;
  if (_nearbyCache.has(key)) return _nearbyCache.get(key);       // 진행 중 요청도 재사용
  const promise = request('/api/nearby/', { ...base, roadAddress, aptName });
  _nearbyCache.set(key, promise);
  return promise;
}
```

---

#### `apt_project/static/js/pages/AddressMode.js`

**수정 내용 — nearby 호출 시점 이동 + 렌더 플래그**

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| `nearbyInfo()` 호출 위치 | `selectArea` (면적 선택마다) | `selectComplex` (단지 선택 시 1회) |
| 단지 변경 시 초기화 | 없음 | `_nearbyRendered = false`, `innerHTML = ''` |
| 렌더 조건 | 무조건 실행 | `_nearbyRendered`가 false일 때만 등록 |

```js
// state에 추가
const state = {
  ...,
  _nearbyPromise: null,
  _nearbyRendered: false,
};

// selectComplex — 단지 선택 시 fetch 즉시 시작
state._nearbyRendered = false;
document.getElementById('nearby-addr').innerHTML = '';
state._nearbyPromise = api.nearbyInfo(getBase(), state.roadAddress, name);

// selectArea → onSuccess — 최초 1회만 렌더 등록
if (!state._nearbyRendered) {
  state._nearbyRendered = true;
  state._nearbyPromise
    .then(nearby => NearbyInfo('nearby-addr', nearby, data.aptName || state.selectedComplex))
    .catch(e => console.warn('[nearby-addr]', e));  // 에러 무음 처리 제거
}
```

---

#### `apt_project/static/js/pages/FilterMode.js`

**수정 내용** — AddressMode.js와 동일한 패턴 적용.

- `selectComplex` → `onSuccess` 안에서 `roadAddress` 확정 후 `_nearbyPromise` 시작
  - (FilterMode는 단지 선택 응답에서 `roadAddress`가 내려오므로 `onSuccess` 안으로 이동)
- `selectArea` → `onSuccess` 에서 `_nearbyRendered` 플래그 확인 후 렌더 등록

---

---

### [버그] 임장 블로그 데이터 화면 미표시

**증상**
주변 시설 섹션에 블로그 목록이 항상 비어 있었음.

---

#### `apt_project/apt/fetch_nearby.py`

**원인**
블로그 제목에 `'임장'` 문자열이 포함된 것만 통과시키는 필터가 있었음. 실제 유용한 블로그 글 대부분이 '아파트명 + 매물/시세/후기' 형태의 제목을 사용해 전부 걸러졌음.

```python
# 수정 전 — 제목에 '임장'이 없으면 무조건 제외
for it in items:
    title = _strip_html(it.get('title', ''))
    if '임장' not in title:
        continue
    result.append({...})

# 수정 후 — 빈 제목만 제외, 나머지 전부 포함
for it in items:
    title = _strip_html(it.get('title', ''))
    if not title:
        continue
    result.append({...})
```

---

#### `apt_project/apt/services.py`

**원인**
`body.get('roadAddress')` 가 `None` 을 반환할 때 바로 `.strip()` 을 호출해 `AttributeError` 발생. 블로그 API 호출 전에 크래시가 나서 빈 결과가 반환됐음.

```python
# 수정 전 — None이면 AttributeError
road_address = body.get('roadAddress').strip()
apt_name     = body.get('aptName').strip()
district     = body.get('District').strip()

# 수정 후 — None이면 빈 문자열로 대체
road_address = (body.get('roadAddress') or '').strip()
apt_name     = (body.get('aptName')     or '').strip()
district     = (body.get('District')    or '').strip()
```

---

---

### [버그] `front/` React 앱 — 주변 시설 무한 재조회

**증상**
`front/` React 앱에서 결과 화면 진입 후 지하철역 정보가 있는 단지의 경우 `/api/nearby/` 가 계속 반복 호출되며 주변 시설 섹션이 계속 리로드됨.

**원인 분석 (`front/src/components/NearbyPanel.tsx`)**

`NearbyPanel`의 `useEffect` 의존성 배열이 `[roadAddress, aptName, district, onSubwayFound]` 인데, `onSubwayFound`가 부모에서 인라인 화살표 함수로 전달됐음. 인라인 화살표 함수는 부모가 리렌더될 때마다 새 참조가 생성되므로 아래 루프가 발생:

```
① NearbyPanel useEffect 실행 → fetchNearbyInfo 호출
② 응답 도착 → 지하철 발견 → onSubwayFound(lat, lng, name) 호출
③ 부모(AddressSearchMode)에서 setSubwayCoord 실행 → 부모 리렌더
④ 부모 리렌더 → onSubwayFound가 새 함수 참조로 교체
⑤ NearbyPanel deps 변경 감지 → useEffect 재실행
⑥ fetchNearbyInfo 재호출 → ②번부터 반복
```

---

#### `front/src/components/AddressSearchMode.tsx`

```tsx
// 수정 전 — 매 렌더마다 새 함수 참조
<NearbyPanel
  ...
  onSubwayFound={(lat, lng, name) => setSubwayCoord({ lat, lng, name })}
/>

// 수정 후 — useCallback으로 참조 고정
const handleSubwayFound = useCallback(
  (lat: number, lng: number, name: string) => setSubwayCoord({ lat, lng, name }),
  [],  // setSubwayCoord는 React 보장 stable ref이므로 deps 불필요
);

<NearbyPanel
  ...
  onSubwayFound={handleSubwayFound}
/>
```

---

#### `front/src/components/FilterSearchMode.tsx`

**수정 내용** — `AddressSearchMode.tsx` 와 동일한 패턴 적용.

```tsx
// 수정 전
onSubwayFound={(lat, lng, name) => setSubwayCoord({ lat, lng, name })}

// 수정 후
const handleSubwayFound = useCallback(
  (lat: number, lng: number, name: string) => setSubwayCoord({ lat, lng, name }),
  [],
);
// ... props에 handleSubwayFound 전달
```

---

---

### 검증 결과

| 검증 항목 | 방법 | 결과 |
|-----------|------|------|
| nearby 네트워크 요청 횟수 | Playwright — `page.on('request')` 카운트 | **1회** |
| NearbyInfo 렌더 횟수 | Playwright — JS 레벨 카운터 | **1회** |
| Promise 캐시 동작 | Playwright — 동시 3회 호출 시 동일 Promise 반환 여부 | **True** |
| 블로그 표시 | Playwright — `nearby-addr` innerHTML 길이 확인 | **5건 표시** |
| `front/` TypeScript 빌드 | `npm run build` | **오류 없음 (2,474 모듈)** |
| 백엔드 `/api/nearby/` 직접 호출 | React 앱 내 `fetch()` | **ok=True, blogs=5** |
