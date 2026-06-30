# 아파트 실거래가 조회 — Django + React 버전

공공데이터포털 실거래가 API를 기반으로 아파트 거래 이력을 조회하고, 가격 추이·구별 비교·단지 비교·주변 시설 정보를 제공하는 웹 애플리케이션입니다.

## 주요 기능

- **주소 모드** — 도로명/지번 주소로 단지를 찾아 실거래가 조회
- **조건 모드** — 최고 가격·세대수 범위로 단지를 필터링하고 지도에 표시
- **단지 비교** — 조건 모드에서 최대 5개 단지를 선택해 가격 추이 비교 분석
- **가격 추이 차트** — 월별 평균 거래가 시계열 시각화
- **구별 비교** — 선택 단지의 평균가가 해당 구 내에서 차지하는 위치(백분위) 표시
- **단지 등급** — S/A/B/C/D 등급 및 GAUGE·LEDGER 지표 제공
- **주변 시설** — 카카오 로컬 API로 학교·마트·병원·지하철역 조회 + 카카오맵 표시
- **임장 블로그** — 네이버 블로그 검색 API로 단지명 관련 포스트 링크 제공
- **단지 분포 지도** — 조건 모드 결과 단지를 카카오맵으로 시각화

## 아키텍처

```
브라우저 → React (Vite, :8082)
              ↓ /api/* 프록시 (timeout 180s)
         Django (:8000) → 공공데이터 API / 카카오 / 네이버
```

개발 환경에서 Vite가 `/api/*` 요청을 Django(8000)로 프록시합니다.

## 프로젝트 구조

```
apt_price_django/
├── manage.py
├── requirements.txt
├── .env                        # API 키 (직접 생성, 아래 환경변수 참고)
│
├── apt_project/                # Django 백엔드
│   ├── urls.py
│   ├── settings/
│   │   └── base.py
│   └── apt/
│       ├── urls.py             # API 라우팅
│       ├── views.py
│       ├── api.py              # JSON API 뷰
│       ├── services.py         # 비즈니스 로직
│       ├── fetch_data11.py     # 공공데이터 수집 모듈
│       └── fetch_nearby.py     # 카카오 로컬 / 네이버 블로그 래퍼
│
└── front/                      # React 프론트엔드
    ├── package.json
    ├── .env                    # 카카오 JS 키 (직접 생성, 아래 참고)
    ├── vite.config.ts          # Vite 설정 + /api 프록시
    └── src/
        ├── App.tsx
        ├── pages/
        │   └── Index.tsx
        ├── components/
        │   ├── AppHeader.tsx
        │   ├── AddressSearchMode.tsx
        │   ├── FilterSearchMode.tsx   # 조건 모드 + 비교 모드 + 단지 분포 지도
        │   ├── PriceCharts.tsx
        │   ├── DistrictGauge.tsx
        │   ├── NearbyPanel.tsx        # 주변 시설 + 카카오맵
        │   ├── ComparePanel.tsx       # 단지 비교 차트
        │   ├── AptGradeBadge.tsx      # 단지 등급 배지 (S/A/B/C/D)
        │   ├── TradesTable.tsx        # 실거래 내역 테이블
        │   ├── SubwayPeerChart.tsx    # 지하철역 주변 비교 차트
        │   ├── NavLink.tsx
        │   ├── Panel.tsx
        │   └── StatTile.tsx
        └── lib/
            ├── djangoApi.ts           # Django API 호출
            ├── djangoTypes.ts         # 타입 정의
            └── format.ts              # 포맷 유틸
```

## API 엔드포인트

| 메서드 | URL | 설명 |
|--------|-----|------|
| GET  | `/api/health/` | 서버 상태 확인 |
| POST | `/api/address/candidates/` | 주소 후보 검색 |
| POST | `/api/address/complexes/` | 단지 목록 |
| POST | `/api/address/areas/` | 전용면적 목록 |
| POST | `/api/address/results/` | 실거래 결과 + 차트 데이터 |
| POST | `/api/filter/list/` | 조건별 단지 목록 (좌표 포함) |
| POST | `/api/filter/detail/areas/` | 단지별 면적 목록 |
| POST | `/api/filter/detail/results/` | 단지별 실거래 결과 + 차트 데이터 |
| POST | `/api/nearby/` | 주변 시설 + 임장 블로그 |

## 환경변수

### 백엔드 — `.env` (프로젝트 루트)

```dotenv
# 공공데이터포털 (data.go.kr)
DATAGO_KEY=YOUR_KEY
POSTAL_KEY=YOUR_KEY

# 공동주택관리정보시스템 (k-apt.go.kr)
KAPT_KEY=YOUR_KEY

# 카카오 개발자 (developers.kakao.com) — 주변 시설 지오코딩 (REST API 키)
KAKAO_REST_KEY=YOUR_KEY

# 네이버 개발자 (developers.naver.com) — 임장 블로그 검색
NAVER_CLIENT_ID=YOUR_ID
NAVER_CLIENT_SECRET=YOUR_SECRET
```

### 프론트엔드 — `front/.env`

```dotenv
# 카카오 개발자 (developers.kakao.com) — 카카오맵 JS SDK (지도 표시)
# REST API 키와 다른 별도 키입니다
VITE_KAKAO_JS_KEY=YOUR_KEY
```

> **카카오맵 도메인 등록 필수**  
> [카카오 개발자 콘솔](https://developers.kakao.com) → 앱 선택 → 플랫폼 → Web → 사이트 도메인에  
> `http://localhost:8082` 를 추가해야 지도가 정상 표시됩니다.  
> 미등록 시 `ERR_BLOCKED_BY_ORB` 오류로 지도가 로드되지 않습니다.

## 실행 방법

```bash
# ── 백엔드 (터미널 1) ──────────────────────────
pip install -r requirements.txt
python manage.py runserver 8000 --noreload

# ── 프론트엔드 (터미널 2) ──────────────────────
cd front
npm install
npm run dev          # http://localhost:8082
```

브라우저에서 `http://localhost:8082` 접속하면 사용 가능합니다.  
프론트에서 발생하는 `/api/*` 요청은 Vite가 자동으로 Django(8000)로 프록시합니다.

> `--noreload` 옵션은 Django 개발 서버의 자동 재시작을 비활성화합니다.  
> 공공데이터 API 응답이 느린 경우 단일 프로세스를 유지해야 캐시가 유실되지 않습니다.

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 백엔드 | Django 4.2+, Python 3.11+ |
| 데이터 처리 | pandas, datakart |
| 프론트엔드 | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| 차트 | Recharts |
| 지도 | 카카오맵 SDK · react-kakao-maps-sdk (주변 시설·단지 분포) |
| 외부 API | 공공데이터포털, K-apt, 카카오 로컬, 네이버 블로그 |
| 서빙 | Vite dev server (프론트) + Django runserver (API) |
