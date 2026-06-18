# 아파트 실거래가 조회 — Django + React 버전

공공데이터포털 실거래가 API를 기반으로 아파트 거래 이력을 조회하고, 가격 추이·구별 비교·단지 비교·주변 시설 정보를 제공하는 웹 애플리케이션입니다.

## 주요 기능

- **주소 모드** — 도로명/지번 주소로 단지를 찾아 실거래가 조회
- **조건 모드** — 최고 가격·세대수 범위로 단지를 필터링하고 지도에 표시
- **단지 비교** — 조건 모드에서 최대 5개 단지를 선택해 가격 추이 비교 분석
- **가격 추이 차트** — 월별 평균 거래가 시계열 시각화
- **구별 비교** — 선택 단지의 평균가가 해당 구 내에서 차지하는 위치(백분위) 표시
- **주변 시설** — 카카오 로컬 API로 학교·마트·병원·지하철역 조회 + 카카오맵 표시
- **임장 블로그** — 네이버 블로그 검색 API로 단지명 관련 포스트 링크 제공
- **단지 분포 지도** — 조건 모드 결과 단지를 카카오맵으로 시각화

## 아키텍처

```
브라우저 → React (Vite, :8080)
              ↓ /api/* 프록시
         Django (:8000) → 공공데이터 API / 카카오 / 네이버
```

개발 환경에서 Vite가 `/api/*` 요청을 Django(8000)로 프록시합니다.

## 프로젝트 구조

```
apt-django/
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
    ├── vite.config.ts          # Vite 설정 + /api 프록시
    └── src/
        ├── App.tsx
        ├── pages/
        │   └── Index.tsx
        ├── components/
        │   ├── AppHeader.tsx
        │   ├── AddressSearchMode.tsx
        │   ├── FilterSearchMode.tsx   # 조건 모드 + 비교 모드
        │   ├── PriceCharts.tsx
        │   ├── DistrictGauge.tsx
        │   ├── NearbyPanel.tsx        # 주변 시설 + 카카오맵
        │   └── ComparePanel.tsx       # 단지 비교 차트
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

`.env` 파일을 프로젝트 루트에 생성하고 아래 키를 입력합니다.

```dotenv
# 공공데이터포털 (data.go.kr)
DATAGO_KEY=YOUR_KEY
POSTAL_KEY=YOUR_KEY

# 공동주택관리정보시스템 (k-apt.go.kr)
KAPT_KEY=YOUR_KEY

# 카카오 개발자 (developers.kakao.com) — 주변 시설 지오코딩
KAKAO_REST_KEY=YOUR_KEY

# 네이버 개발자 (developers.naver.com) — 임장 블로그 검색
NAVER_CLIENT_ID=YOUR_ID
NAVER_CLIENT_SECRET=YOUR_SECRET
```

`front/.env` 파일을 `front/` 디렉터리에 생성하고 아래 키를 입력합니다.

```dotenv
# 카카오 개발자 (developers.kakao.com) — 카카오맵 JS SDK (지도 표시)
VITE_KAKAO_JS_KEY=YOUR_KEY
```

## 실행 방법

```bash
# ── 백엔드 (터미널 1) ──────────────────────────
pip install -r requirements.txt
python manage.py runserver 8000

# ── 프론트엔드 (터미널 2) ──────────────────────
cd front
npm install
npm run dev          # http://localhost:8080
```

브라우저에서 `http://localhost:8080` 접속하면 사용 가능합니다.  
프론트에서 발생하는 `/api/*` 요청은 Vite가 자동으로 Django(8000)로 프록시합니다.

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
