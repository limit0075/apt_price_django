# 아파트 실거래가 조회 — Django 버전

공공데이터포털 실거래가 API를 기반으로 아파트 거래 이력을 조회하고, 가격 추이·구별 비교·주변 시설 정보를 제공하는 웹 애플리케이션입니다.

## 주요 기능

- **주소 모드** — 도로명/지번 주소로 단지를 찾아 실거래가 조회
- **조건 모드** — 최고 가격·세대수 범위로 단지를 필터링하고 지도에 표시
- **가격 추이 차트** — 월별 평균 거래가 시계열 시각화
- **구별 비교** — 선택 단지의 평균가가 해당 구 내에서 차지하는 위치(백분위) 표시
- **주변 시설** — 카카오 로컬 API로 학교·마트·병원·지하철역 조회
- **임장 블로그** — 네이버 블로그 검색 API로 단지명 관련 포스트 링크 제공
- **지도 뷰** — 조건 모드 결과 단지를 카카오맵에 마커로 표시

## 프로젝트 구조

```
apt-django/
├── manage.py
├── requirements.txt
├── .env                        # API 키 (직접 생성, 아래 환경변수 참고)
│
└── apt_project/
    ├── __init__.py
    ├── urls.py                 # 루트 URL
    ├── wsgi.py
    │
    ├── settings/
    │   ├── __init__.py
    │   └── base.py             # Django 설정
    │
    ├── apt/                    # 메인 앱
    │   ├── urls.py             # API + 페이지 라우팅
    │   ├── views.py            # 페이지 뷰 (index)
    │   ├── api.py              # JSON API 뷰
    │   ├── services.py         # 비즈니스 로직
    │   ├── fetch_data11.py     # 공공데이터 수집 모듈
    │   └── fetch_nearby.py     # 카카오 로컬 / 네이버 블로그 래퍼
    │
    ├── templates/
    │   └── apt/
    │       └── index.html      # Django 템플릿 (메인 SPA)
    │
    └── static/
        ├── css/
        │   └── style.css
        └── js/
            ├── main.js             # 앱 진입점
            ├── api/
            │   └── client.js       # API 통신
            ├── utils/
            │   └── format.js       # 포맷 유틸
            ├── hooks/
            │   └── useApi.js       # 로딩/에러 상태 관리
            ├── components/
            │   ├── StepIndicator.js
            │   ├── CandidateList.js
            │   ├── MetricCards.js
            │   ├── DistrictGauge.js    # 구별 백분위 게이지
            │   ├── ResultTable.js
            │   ├── PriceChart.js
            │   ├── NearbyInfo.js       # 주변 시설 / 블로그
            │   ├── AptMap.js           # 카카오맵 단지 마커
            │   └── FilterListMap.js    # 조건 모드 지도
            └── pages/
                ├── AddressMode.js
                └── FilterMode.js
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

## 실행 방법

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. 환경변수 설정
# 위 환경변수 목록을 참고해 .env 파일 생성

# 3. 서버 실행
python manage.py runserver 8000
```

브라우저에서 `http://localhost:8000` 접속하면 바로 사용 가능합니다.

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 백엔드 | Django 4.2, Python 3.11+ |
| 데이터 처리 | pandas, datakart |
| 프론트엔드 | Vanilla JS (ES Modules), Plotly.js, 카카오맵 SDK |
| 외부 API | 공공데이터포털, K-apt, 카카오 로컬, 네이버 블로그 |
| 서빙 | Django runserver (개발) / WSGI 호환 서버 (운영) |

## FastAPI 버전과의 차이점

| | FastAPI 버전 | Django 버전 |
|--|------------|------------|
| 백엔드 | FastAPI + uvicorn | Django runserver |
| 프론트 | 별도 정적 서버 필요 | Django가 직접 서빙 |
| 접속 | `localhost:8000` (API) + `localhost:3000` (프론트) | `localhost:8000` 하나로 끝 |
| 템플릿 | 없음 (순수 HTML) | Django 템플릿 (`{% static %}`) |
| CSRF | 없음 | `@csrf_exempt` (API 뷰) |
| 추가 기능 | — | 주변 시설 조회, 임장 블로그, 지도 뷰, 구별 비교 |
