# 아파트 실거래가 조회 — 프론트엔드

React + TypeScript + Vite로 구성된 프론트엔드입니다. Django 백엔드 API(`localhost:8000`)와 통신하며, Vite 개발 서버가 `/api/*` 요청을 자동 프록시합니다.

## 개발 환경 실행

```bash
npm install
npm run dev   # http://localhost:8080
```

> Django 백엔드(`python manage.py runserver 8000`)가 먼저 실행 중이어야 API 호출이 정상 동작합니다.

## 주요 스택

| 구분 | 라이브러리 |
|------|-----------|
| UI 프레임워크 | React 18, TypeScript |
| 빌드 도구 | Vite |
| 스타일 | Tailwind CSS, shadcn/ui (Radix UI 기반) |
| 차트 | Recharts |
| 지도 | Leaflet (주변 시설 뷰) |
| 상태/비동기 | TanStack Query, React Hook Form |
| 라우팅 | React Router v6 |

## 디렉토리 구조

```
src/
├── pages/
│   └── Index.tsx               # 메인 페이지 (모드 전환, 기준 파라미터 입력)
├── components/
│   ├── AppHeader.tsx           # 상단 헤더
│   ├── AddressSearchMode.tsx   # 주소 모드
│   ├── FilterSearchMode.tsx    # 조건 모드 + 비교 모드
│   ├── PriceCharts.tsx         # 가격 추이·구별 비교 차트
│   ├── DistrictGauge.tsx       # 구 내 백분위 게이지
│   ├── NearbyPanel.tsx         # 주변 시설 + Leaflet 지도
│   ├── ComparePanel.tsx        # 단지 비교 차트
│   └── ui/                     # shadcn/ui 공통 컴포넌트
└── lib/
    ├── djangoApi.ts            # Django API 호출 함수
    ├── djangoTypes.ts          # 공유 타입 정의
    └── format.ts               # 금액·날짜 포맷 유틸
```

## 빌드

```bash
npm run build          # dist/ 에 정적 파일 생성
npm run preview        # 빌드 결과 미리보기
```
