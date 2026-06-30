import { useEffect, useRef, useState, useCallback } from "react";
import { ExternalLink, BookOpen, Train, GraduationCap, ShoppingBag, Clock } from "lucide-react";
import { Panel } from "./Panel";
import { cn } from "@/lib/utils";
import { fetchNearbyInfo } from "@/lib/djangoApi";
import type { NearbyInfo, NearbyItem } from "@/lib/djangoTypes";

// ── Kakao Maps 타입 선언 ───────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type KMaps = {
  Map: new (el: HTMLElement, opts: object) => any;
  LatLng: new (lat: number, lng: number) => any;
  Marker: new (opts: object) => any;
  MarkerImage: new (src: string, size: any, opts?: object) => any;
  Size: new (w: number, h: number) => any;
  Point: new (x: number, y: number) => any;
  InfoWindow: new (opts: object) => any;
  event: { addListener: (t: any, type: string, fn: () => void) => void };
  load: (fn: () => void) => void;
};
declare global {
  interface Window { kakao?: { maps: KMaps } }
}

// ── SDK 로더 ──────────────────────────────────────────────────

function loadKakaoSdk(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 이미 완전히 초기화된 경우 (LatLng가 생성자로 사용 가능)
    if (typeof window.kakao?.maps?.LatLng === 'function') { resolve(); return; }

    // SDK namespace는 있지만 autoload=false로 미초기화 → load() 호출
    if (window.kakao?.maps) { window.kakao.maps.load(resolve); return; }

    // 이미 삽입된 Kakao SDK 스크립트 대기
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-kakao], script[src*="dapi.kakao.com/v2/maps"]'
    );
    if (existingScript) {
      let ms = 0;
      const poll = setInterval(() => {
        ms += 50;
        if (window.kakao?.maps) { clearInterval(poll); window.kakao.maps.load(resolve); }
        else if (ms > 15000) { clearInterval(poll); reject(new Error('SDK 로드 타임아웃 — 카카오 콘솔 도메인 등록 확인')); }
      }, 50);
      return;
    }

    const s = document.createElement('script');
    s.dataset.kakao = '1';
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.onload  = () => window.kakao!.maps.load(resolve);
    s.onerror = () => reject(new Error(
      'SDK 로드 실패 — 카카오 콘솔에서 JavaScript 키 확인 및 Web 플랫폼(http://localhost:8082) 등록 필요'
    ));
    document.head.appendChild(s);
  });
}

// ── 마커 이미지 (SVG circle) ──────────────────────────────────

function markerSrc(fill: string, stroke: string, r = 8) {
  const d = r * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}">
    <circle cx="${r}" cy="${r}" r="${r - 2}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MARKER_CFG = {
  apt:    { fill: '#C4633A', stroke: '#8B3A1E', r: 10 },
  subway: { fill: '#3B82F6', stroke: '#1D4ED8', r: 7  },
  school: { fill: '#22C55E', stroke: '#15803D', r: 7  },
  mart:   { fill: '#F59E0B', stroke: '#B45309', r: 7  },
};

// ── 시설 섹션 설정 ─────────────────────────────────────────────

type SectionKey = 'subways' | 'schools' | 'marts';

const SECTIONS: {
  key: SectionKey;
  label: string;
  markerKey: keyof typeof MARKER_CFG;
  icon: React.ReactNode;
  iconColor: string;
}[] = [
  { key: 'subways', label: '지하철역',  markerKey: 'subway', icon: <Train className="h-3.5 w-3.5" />,        iconColor: 'text-[hsl(210_62%_50%)]' },
  { key: 'schools', label: '학교',      markerKey: 'school', icon: <GraduationCap className="h-3.5 w-3.5" />, iconColor: 'text-[hsl(142_44%_38%)]' },
  { key: 'marts',   label: '대형마트',  markerKey: 'mart',   icon: <ShoppingBag className="h-3.5 w-3.5" />,   iconColor: 'text-[hsl(38_85%_48%)]'  },
];

// ── 도보 시간 뱃지 ─────────────────────────────────────────────

function WalkBadge({ mins }: { mins: number }) {
  return (
    <span className={cn(
      "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
      mins <= 5  ? "bg-[hsl(142_44%_38%/0.12)] text-[hsl(142_44%_38%)]"
      : mins <= 10 ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground",
    )}>
      <Clock className="h-2.5 w-2.5" />
      도보 {mins}분
    </span>
  );
}

// ── 시설 행 ───────────────────────────────────────────────────

function FacilityRow({ item }: { item: NearbyItem }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{item.name}</p>
        {item.address && (
          <p className="truncate text-[11px] text-muted-foreground">{item.address}</p>
        )}
      </div>
      <WalkBadge mins={item.walkMins} />
    </div>
  );
}

// ── 인포윈도우 HTML ───────────────────────────────────────────

function infoHtml(name: string, walkMins?: number, distance?: number) {
  const sub = walkMins
    ? `<div style="color:#888;font-size:11px;margin-top:2px">도보 ${walkMins}분 · ${distance}m</div>`
    : '';
  return `<div style="padding:8px 12px;font-family:Inter,system-ui,sans-serif;font-size:13px;
    background:#fff;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.14);
    border:1px solid #ebe7e0;white-space:nowrap;line-height:1.4">
    <b>${name}</b>${sub}
  </div>`;
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────

interface Props {
  roadAddress: string;
  aptName: string;
  district: string;
  onSubwayFound?: (lat: number, lng: number, name: string) => void;
}

export const NearbyPanel = ({ roadAddress, aptName, district, onSubwayFound }: Props) => {
  const [info, setInfo]         = useState<NearbyInfo | null>(null);
  const [loading, setLoading]   = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstance    = useRef<any>(null);
  // ref로 최신 콜백 유지 — deps에서 제외해 불필요한 API 재호출 방지
  const onSubwayRef    = useRef(onSubwayFound);
  useEffect(() => { onSubwayRef.current = onSubwayFound; }, [onSubwayFound]);

  // SDK 로드 (최초 1회)
  useEffect(() => {
    const key = import.meta.env.VITE_KAKAO_JS_KEY;
    if (!key) return;
    loadKakaoSdk(key)
      .then(() => setSdkReady(true))
      .catch((e: Error) => setMapError(e.message));
  }, []);

  // 주변 정보 조회 — onSubwayFound 제외 (ref로 참조)
  const handleNearby = useCallback(() => {
    if (!roadAddress) return;
    setLoading(true);
    setInfo(null);
    fetchNearbyInfo(roadAddress, aptName, district)
      .then((data) => {
        setInfo(data);
        const first = data.subways?.[0];
        if (first?.lat && first?.lng && onSubwayRef.current) {
          onSubwayRef.current(first.lat, first.lng, first.name);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roadAddress, aptName, district]);

  useEffect(() => { handleNearby(); }, [handleNearby]);

  // 지도 초기화 — SDK + 좌표 모두 준비된 뒤
  useEffect(() => {
    if (!sdkReady || !mapRef.current || !info?.coords) return;

    const container = mapRef.current;
    container.innerHTML = '';
    mapInstance.current = null;
    setMapError(null);

    // requestAnimationFrame: 컨테이너가 실제 픽셀 크기를 가진 뒤 초기화
    const raf = requestAnimationFrame(() => {
      try {
        const { LatLng, Map, Marker, MarkerImage, Size, Point, InfoWindow, event } =
          window.kakao!.maps;

        const center = new LatLng(info.coords!.lat, info.coords!.lng);
        const map = new Map(container, { center, level: 4 });
        mapInstance.current = map;

        // 마커 + 인포윈도우 헬퍼
        function addMarker(
          lat: number, lng: number,
          cfg: typeof MARKER_CFG[keyof typeof MARKER_CFG],
          title: string,
          walkMins?: number,
          distance?: number,
        ) {
          const img = new MarkerImage(
            markerSrc(cfg.fill, cfg.stroke, cfg.r),
            new Size(cfg.r * 2, cfg.r * 2),
            { offset: new Point(cfg.r, cfg.r) },
          );
          const marker = new Marker({ position: new LatLng(lat, lng), image: img, map });
          const iw = new InfoWindow({ content: infoHtml(title, walkMins, distance), removable: true });
          event.addListener(marker, 'click', () => iw.open(map, marker));
        }

        // 아파트 마커
        addMarker(info.coords!.lat, info.coords!.lng, MARKER_CFG.apt, aptName);

        // 시설 마커
        const facilityMap: { items: NearbyItem[]; cfg: typeof MARKER_CFG[keyof typeof MARKER_CFG] }[] = [
          { items: info.subways ?? [], cfg: MARKER_CFG.subway },
          { items: info.schools  ?? [], cfg: MARKER_CFG.school },
          { items: info.marts    ?? [], cfg: MARKER_CFG.mart   },
        ];
        for (const { items, cfg } of facilityMap) {
          for (const f of items) {
            if (f.lat && f.lng) {
              addMarker(f.lat, f.lng, cfg, f.name, f.walkMins, f.distance);
            }
          }
        }
      } catch (e: any) {
        setMapError(e?.message ?? '지도 초기화 오류');
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      container.innerHTML = '';
      mapInstance.current = null;
    };
  }, [sdkReady, info, aptName]);

  const blogs    = info?.blogs ?? [];
  const noKey    = !import.meta.env.VITE_KAKAO_JS_KEY;
  const naverUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(
    `${district} ${aptName} 임장`,
  )}`;

  return (
    <div className="space-y-5">
      {/* 지도 + 시설 정보 */}
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">

        {/* 카카오맵 */}
        <Panel tag="MAP" title="위치" subtitle={aptName} className="flex flex-col" bodyClassName="p-0 flex flex-col flex-1 min-h-0">
          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-b-xl bg-muted/30">
            {noKey ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  <code className="rounded bg-muted px-1">front/.env</code>에{' '}
                  <code className="rounded bg-muted px-1">VITE_KAKAO_JS_KEY</code>를 설정하세요
                </p>
              </div>
            ) : (
              <>
                {/* 지도 컨테이너 — 명시적 width/height로 카카오맵 렌더링 보장 */}
                <div
                  ref={mapRef}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                />
                {/* 로딩 / 좌표 없음 오버레이 */}
                {(loading || (!info?.coords && !loading && !mapError)) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                    <span className={cn("text-xs text-muted-foreground", loading && "animate-pulse")}>
                      {loading ? '위치 조회 중...' : '위치 정보를 가져올 수 없습니다'}
                    </span>
                  </div>
                )}
                {/* SDK 오류 오버레이 */}
                {mapError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm px-6 text-center">
                    <p className="text-xs font-medium text-foreground">{mapError}</p>
                    <p className="text-[11px] text-muted-foreground">
                      카카오 콘솔 → 플랫폼 → Web에<br />
                      <code className="rounded bg-muted px-1">http://localhost:8082</code> 등록 확인
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          {/* 범례 */}
          {info?.coords && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5">
              {[
                { fill: MARKER_CFG.apt.fill,    label: aptName },
                { fill: MARKER_CFG.subway.fill, label: '지하철' },
                { fill: MARKER_CFG.school.fill, label: '학교'   },
                { fill: MARKER_CFG.mart.fill,   label: '마트'   },
              ].map(({ fill, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: fill }} />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* 시설 목록 */}
        <Panel tag="NEARBY" title="주변 시설" subtitle="도보 기준" bodyClassName="divide-y divide-border">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center">
              <span className="animate-pulse text-xs text-muted-foreground">조회 중...</span>
            </div>
          ) : !info ? (
            <div className="flex h-[280px] items-center justify-center">
              <span className="text-xs text-muted-foreground">정보를 가져올 수 없습니다</span>
            </div>
          ) : (
            SECTIONS.map(({ key, label, icon, iconColor }) => {
              const items = (info[key] ?? []) as NearbyItem[];
              return (
                <div key={key} className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className={iconColor}>{icon}</span>
                    <span className="text-xs font-semibold text-foreground">{label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{items.length}개</span>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">반경 내 없음</p>
                  ) : (
                    <div className="space-y-0.5">
                      {items.map((item, i) => <FacilityRow key={i} item={item} />)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Panel>
      </div>

      {/* 임장 블로그 */}
      <Panel
        tag="BLOG"
        title="임장 블로그"
        subtitle="네이버"
        actions={
          <a href={naverUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition-snap hover:border-primary/40 hover:text-primary">
            <ExternalLink className="h-3 w-3" />
            더보기
          </a>
        }
        bodyClassName="space-y-2 p-3"
      >
        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">블로그 조회 중...</div>
        ) : blogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">임장 블로그가 없습니다</div>
        ) : (
          blogs.slice(0, 5).map((b, i) => (
            <a key={i} href={b.link} target="_blank" rel="noopener noreferrer"
              className="block rounded-sm border border-border/50 p-3 transition-snap hover:border-border-strong hover:bg-surface">
              <div className="flex items-start gap-2">
                <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-snug"
                    dangerouslySetInnerHTML={{ __html: b.title }} />
                  <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: b.description }} />
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>{b.bloggername}</span>
                    <span>·</span>
                    <span>{b.postdate}</span>
                  </div>
                </div>
              </div>
            </a>
          ))
        )}
      </Panel>
    </div>
  );
};
