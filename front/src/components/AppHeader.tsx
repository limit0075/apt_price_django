import { useEffect, useState } from "react";
import { Activity, Search } from "lucide-react";
import { formatWonShort } from "@/lib/format";
import type { BaseParams } from "@/lib/djangoTypes";

type SearchMode = "address" | "filter";

interface TickerItem {
  district: string;
  avgPrice: number;  // 원
  change: number | null;
}

interface AppHeaderProps {
  mode: SearchMode;
  onModeChange: (m: SearchMode) => void;
  baseParams: BaseParams;
}

const STATIC_TICKER = [
  { district: "서초구",  avgPrice: 2870000000, change: 3.1 },
  { district: "강남구",  avgPrice: 2610000000, change: 2.4 },
  { district: "송파구",  avgPrice: 2150000000, change: 1.2 },
  { district: "용산구",  avgPrice: 2050000000, change: 1.8 },
  { district: "마포구",  avgPrice: 1680000000, change: 0.9 },
  { district: "은평구",  avgPrice: 1050000000, change: -0.4 },
  { district: "강동구",  avgPrice: 1580000000, change: 1.2 },
  { district: "노원구",  avgPrice:  820000000, change: -0.6 },
];

const CACHE_KEY = "apt_ticker_v1";

function loadCache(cacheKey: string): TickerItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { key, items } = JSON.parse(raw);
    return key === cacheKey ? items : null;
  } catch {
    return null;
  }
}

function saveCache(cacheKey: string, items: TickerItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key: cacheKey, items }));
  } catch {}
}

export const AppHeader = ({ mode, onModeChange, baseParams }: AppHeaderProps) => {
  const cacheKey = `${baseParams.City}_${baseParams.start_date}_${baseParams.end_date}`;

  const [ticker, setTicker] = useState<TickerItem[]>(() => {
    return loadCache(cacheKey) ?? STATIC_TICKER;
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // 캐시된 데이터가 있으면 즉시 반영 후 백그라운드 갱신
    const cached = loadCache(cacheKey);
    if (cached) setTicker(cached);

    setRefreshing(true);
    fetch("/api/ticker/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        City: baseParams.City,
        start_date: baseParams.start_date,
        end_date: baseParams.end_date,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.items?.length > 0) {
          setTicker(data.items);
          saveCache(cacheKey, data.items);
        }
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [cacheKey]);

  const displayed = [...ticker, ...ticker];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      {/* Top brand row */}
      <div className="flex h-14 items-center justify-between border-b border-border/60 px-6">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="relative grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground shadow-glow">
              <Activity className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                부동산 실거래 분석
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                아파트 실거래가 조회
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            <button
              data-active={mode === "address"}
              onClick={() => onModeChange("address")}
              className="nav-link font-medium"
            >
              주소 검색
            </button>
            <button
              data-active={mode === "filter"}
              onClick={() => onModeChange("filter")}
              className="nav-link font-medium"
            >
              조건 검색
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-sm border border-border bg-surface px-3 py-1.5 sm:flex">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-[11px] text-muted-foreground">
              국토교통부 실거래가 API
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={refreshing ? "pulse-dot opacity-50" : "pulse-dot"} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {refreshing ? "갱신 중…" : "Live · 국토부 API"}
            </span>
          </div>
        </div>
      </div>

      {/* Ticker tape */}
      <div className="relative h-9 overflow-hidden bg-surface">
        <div className="flex h-full animate-ticker items-center gap-10 whitespace-nowrap px-6">
          {displayed.map((t, i) => (
            <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-muted-foreground">{t.district}</span>
              <span className="font-semibold text-foreground">
                {formatWonShort(t.avgPrice)}
              </span>
              {t.change !== null && t.change !== undefined ? (
                <span className={t.change >= 0 ? "text-bull" : "text-bear"}>
                  {t.change >= 0 ? "▲" : "▼"} {Math.abs(t.change).toFixed(1)}%
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              <span className="text-border-strong">·</span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
      </div>
    </header>
  );
};
