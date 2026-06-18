import React, { useState, useCallback, useEffect, useRef } from "react";
import { Check, X, MapPin } from "lucide-react";
import { Map as KakaoMap, CustomOverlayMap, useMap, useKakaoLoader } from "react-kakao-maps-sdk";
import { Panel } from "./Panel";
import { StatTile } from "./StatTile";
import { PriceCharts } from "./PriceCharts";
import { DistrictGauge } from "./DistrictGauge";
import { NearbyPanel } from "./NearbyPanel";
import { SubwayPeerChart } from "./SubwayPeerChart";
import { ComparePanel } from "./ComparePanel";
import type { CompareResult } from "./ComparePanel";
import { cn } from "@/lib/utils";

type SubwayCoord = { lat: number; lng: number; name: string };
import { formatWon, formatWonShort, formatManwon } from "@/lib/format";
import {
  fetchFilterList,
  fetchFilterAreas,
  fetchFilterResults,
} from "@/lib/djangoApi";
import type {
  BaseParams,
  FilterListItem,
  AreaItem,
  AddressResultsData,
} from "@/lib/djangoTypes";

function parseHH(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^\d]/g, ""), 10);
    return isFinite(n) ? n : 0;
  }
  return 0;
}

type CompareEntry = {
  complex: FilterListItem;
  area: number | null;      // null = not yet chosen
  areaList: AreaItem[];
  areaLoading: boolean;
  areaError: boolean;
};

type PriceMode = "total" | "pyeong";

const PRICE_PRESETS = [
  { label: "10억", value: 100000 },
  { label: "20억", value: 200000 },
  { label: "30억", value: 300000 },
  { label: "50억", value: 500000 },
];

const PYEONG_PRESETS = [
  { label: "2천만", value: 2000 },
  { label: "3천만", value: 3000 },
  { label: "5천만", value: 5000 },
  { label: "7천만", value: 7000 },
];

const HOUSEHOLD_PRESETS = [
  { label: "500↑", min: 500 },
  { label: "1,000↑", min: 1000 },
  { label: "2,000↑", min: 2000 },
  { label: "5,000↑", min: 5000 },
];

interface Props {
  baseParams: BaseParams;
}

export const FilterSearchMode = ({ baseParams }: Props) => {
  const [priceMode, setPriceMode] = useState<PriceMode>("total");
  const [maxPrice, setMaxPrice] = useState(300000);           // 만원 단위
  const [maxPyeongPrice, setMaxPyeongPrice] = useState(3000); // 만원/평 단위
  const [minHouseholds, setMinHouseholds] = useState(1000);

  // 현재 모드에 따라 API에 넘길 값 결정
  const effectiveMaxPrice = priceMode === "total" ? maxPrice : null;
  const effectivePyeongPrice = priceMode === "pyeong" ? maxPyeongPrice : null;

  // Single-select flow
  const [complexList, setComplexList] = useState<FilterListItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedComplex, setSelectedComplex] = useState<FilterListItem | null>(null);
  const [areaList, setAreaList] = useState<AreaItem[]>([]);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [results, setResults] = useState<AddressResultsData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subwayCoord, setSubwayCoord] = useState<SubwayCoord | null>(null);

  const handleSubwayFound = useCallback(
    (lat: number, lng: number, name: string) => setSubwayCoord({ lat, lng, name }),
    [],
  );

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareEntries, setCompareEntries] = useState<CompareEntry[]>([]);
  const [compareData, setCompareData] = useState<CompareResult[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // ── Single-select handlers ───────────────────────────────────

  const handleSearch = useCallback(async () => {
    setLoading("list");
    setError(null);
    setComplexList([]);
    setSelectedComplex(null);
    setAreaList([]);
    setSelectedArea(null);
    setResults(null);
    setSearched(false);
    setCompareMode(false);
    setCompareEntries([]);
    setCompareData([]);
    try {
      const items = await fetchFilterList(baseParams, effectiveMaxPrice, minHouseholds, null, effectivePyeongPrice);
      setComplexList(items);
      setSearched(true);
      if (items.length === 0) setError("조건에 맞는 단지가 없습니다");
    } catch (e) {
      setError(e instanceof Error ? e.message : "단지 조회 중 오류가 발생했습니다 (수 분 소요될 수 있습니다)");
      setSearched(true);
    } finally {
      setLoading(null);
    }
  }, [baseParams, effectiveMaxPrice, effectivePyeongPrice, minHouseholds]);

  const handlePickComplex = useCallback(
    async (complex: FilterListItem) => {
      setSelectedComplex(complex);
      setAreaList([]);
      setSelectedArea(null);
      setResults(null);
      setLoading("areas");
      setError(null);
      try {
        const { items } = await fetchFilterAreas(baseParams, complex.name, effectiveMaxPrice, minHouseholds, null, effectivePyeongPrice);
        setAreaList(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "면적 조회 중 오류가 발생했습니다");
      } finally {
        setLoading(null);
      }
    },
    [baseParams, effectiveMaxPrice, effectivePyeongPrice, minHouseholds],
  );

  const handlePickArea = useCallback(
    async (area: number) => {
      if (!selectedComplex) return;
      setSelectedArea(area);
      setResults(null);
      setSubwayCoord(null);
      setLoading("results");
      setError(null);
      try {
        const data = await fetchFilterResults(baseParams, selectedComplex.name, area, effectiveMaxPrice, minHouseholds, null, effectivePyeongPrice);
        setResults(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "결과 조회 중 오류가 발생했습니다");
      } finally {
        setLoading(null);
      }
    },
    [baseParams, selectedComplex, effectiveMaxPrice, effectivePyeongPrice, minHouseholds],
  );

  // ── Compare mode handlers ────────────────────────────────────

  const enterCompareMode = useCallback(() => {
    setCompareMode(true);
    setCompareEntries([]);
    setCompareData([]);
    setCompareError(null);
    setSelectedComplex(null);
    setAreaList([]);
    setSelectedArea(null);
    setResults(null);
    setError(null);
  }, []);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setCompareEntries([]);
    setCompareData([]);
    setCompareError(null);
  }, []);

  // Click a complex in compare mode → add/remove entry and fetch areas
  const toggleCompareComplex = useCallback(
    async (complex: FilterListItem) => {
      const isExisting = compareEntries.some((e) => e.complex.name === complex.name);
      if (isExisting) {
        setCompareEntries((prev) => prev.filter((e) => e.complex.name !== complex.name));
        return;
      }
      if (compareEntries.length >= 5) return;

      // Add entry with loading state
      setCompareEntries((prev) => [
        ...prev,
        { complex, area: null, areaList: [], areaLoading: true, areaError: false },
      ]);

      try {
        const { items } = await fetchFilterAreas(baseParams, complex.name, effectiveMaxPrice, minHouseholds, null, effectivePyeongPrice);
        setCompareEntries((prev) =>
          prev.map((e) =>
            e.complex.name === complex.name
              ? { ...e, areaList: items, areaLoading: false }
              : e,
          ),
        );
      } catch {
        setCompareEntries((prev) =>
          prev.map((e) =>
            e.complex.name === complex.name
              ? { ...e, areaLoading: false, areaError: true }
              : e,
          ),
        );
      }
    },
    [compareEntries, baseParams, effectiveMaxPrice, effectivePyeongPrice, minHouseholds],
  );

  // Pick an area for a specific compare entry (null = reset to picker)
  const selectCompareArea = useCallback((complexName: string, area: number | null) => {
    setCompareEntries((prev) =>
      prev.map((e) => (e.complex.name === complexName ? { ...e, area } : e)),
    );
  }, []);

  // Remove a compare entry via the X badge (list)
  const removeCompareEntry = useCallback((complexName: string) => {
    setCompareEntries((prev) => prev.filter((e) => e.complex.name !== complexName));
  }, []);

  // Remove from compare chart results (and sync entries)
  const removeFromCompareData = useCallback((aptName: string) => {
    setCompareData((prev) => prev.filter((r) => r.name !== aptName));
    // Also deselect the matching entry so the list stays in sync
    setCompareEntries((prev) =>
      prev.filter((e) => (e.complex.name !== aptName && e.complex.label !== aptName)),
    );
  }, []);

  // Run comparison — only uses entries that have an area selected
  const handleCompare = useCallback(async () => {
    const ready = compareEntries.filter((e) => e.area !== null);
    if (ready.length < 2) return;
    setCompareLoading(true);
    setCompareError(null);
    setCompareData([]);

    const settled = await Promise.allSettled(
      ready.map(async (entry) => {
        const data = await fetchFilterResults(
          baseParams,
          entry.complex.name,
          entry.area!,
          effectiveMaxPrice,
          minHouseholds,
          null,
          effectivePyeongPrice,
        );
        return {
          name: data.aptName || entry.complex.name,
          area: entry.area!,
          priceSeries: data.priceSeries ?? [],
          households: data.households,
          roadAddress: data.roadAddress,
        } satisfies CompareResult;
      }),
    );

    const ok = settled
      .filter((r): r is PromiseFulfilledResult<CompareResult> => r.status === "fulfilled")
      .map((r) => r.value);
    const failCount = settled.filter((r) => r.status === "rejected").length;
    setCompareData(ok);
    if (failCount) setCompareError(`${failCount}개 단지 조회에 실패했습니다`);
    setCompareLoading(false);
  }, [compareEntries, baseParams, effectiveMaxPrice, effectivePyeongPrice, minHouseholds]);

  // ── Fetch progress simulation ────────────────────────────────
  const [fetchProgress, setFetchProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading === "results") {
      setFetchProgress(0);
      progressTimerRef.current = setInterval(() => {
        setFetchProgress((prev) => {
          const next = prev + (95 - prev) * 0.04;
          return Math.min(next, 94);
        });
      }, 600);
    } else {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (results) setFetchProgress(100);
      else setFetchProgress(0);
    }
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [loading, results]);

  // ── Derived ─────────────────────────────────────────────────

  const lastPrice = results?.priceSeries?.length
    ? results.priceSeries[results.priceSeries.length - 1].avgPrice
    : null;

  const avgHouseholds =
    complexList.length > 0
      ? Math.round(complexList.reduce((s, c) => s + parseHH(c.세대수), 0) / complexList.length)
      : 0;

  const readyCount = compareEntries.filter((e) => e.area !== null).length;
  const canCompare = readyCount >= 2 && !compareLoading;

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* LEFT */}
      <aside className="space-y-5">
        <Panel tag="FILTER" title="조건 입력" bodyClassName="space-y-5 p-4">
          {/* 가격 모드 토글 */}
          <div className="flex rounded-lg border border-border bg-muted p-0.5">
            {(["total", "pyeong"] as PriceMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setPriceMode(m)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium transition-snap",
                  priceMode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "total" ? "아파트 가격" : "평단가"}
              </button>
            ))}
          </div>

          {/* 아파트 가격 슬라이더 */}
          {priceMode === "total" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs text-muted-foreground">최대 가격</label>
                <span className="text-sm font-semibold text-primary">{Math.round(maxPrice / 10000)}억</span>
              </div>
              <input type="range" min={50000} max={600000} step={10000} value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-primary" />
              <div className="mt-2 flex gap-1">
                {PRICE_PRESETS.map((p) => (
                  <button key={p.value} onClick={() => setMaxPrice(p.value)}
                    className={cn("flex-1 rounded-md border border-border px-2 py-1 text-xs transition-snap hover:border-primary/40",
                      maxPrice === p.value && "border-primary bg-primary/10 text-primary")}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 평단가 슬라이더 */}
          {priceMode === "pyeong" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs text-muted-foreground">최대 평단가</label>
                <span className="text-sm font-semibold text-primary">
                  {maxPyeongPrice >= 10000
                    ? `${maxPyeongPrice / 10000}억`
                    : `${(maxPyeongPrice / 1000).toFixed(maxPyeongPrice % 1000 === 0 ? 0 : 1)}천만`}원/평
                </span>
              </div>
              <input type="range" min={500} max={10000} step={100} value={maxPyeongPrice}
                onChange={(e) => setMaxPyeongPrice(Number(e.target.value))} className="w-full accent-primary" />
              <div className="mt-2 flex gap-1">
                {PYEONG_PRESETS.map((p) => (
                  <button key={p.value} onClick={() => setMaxPyeongPrice(p.value)}
                    className={cn("flex-1 rounded-md border border-border px-2 py-1 text-xs transition-snap hover:border-primary/40",
                      maxPyeongPrice === p.value && "border-primary bg-primary/10 text-primary")}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                1평 = 3.3㎡ 기준 · 면적별 최저 거래가로 계산
              </p>
            </div>
          )}

          {/* 세대수 슬라이더 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">최소 세대수</label>
              <span className="text-sm font-semibold text-primary">{minHouseholds.toLocaleString()}↑</span>
            </div>
            <input type="range" min={100} max={10000} step={100} value={minHouseholds}
              onChange={(e) => setMinHouseholds(Number(e.target.value))} className="w-full accent-primary" />
            <div className="mt-2 flex gap-1">
              {HOUSEHOLD_PRESETS.map((p) => (
                <button key={p.min} onClick={() => setMinHouseholds(p.min)}
                  className={cn("flex-1 rounded-md border border-border px-2 py-1 text-xs transition-snap hover:border-primary/40",
                    minHouseholds === p.min && "border-primary bg-primary/10 text-primary")}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSearch} disabled={loading === "list"}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-snap hover:bg-primary-glow disabled:opacity-50">
            {loading === "list" ? "조회 중…" : "단지 목록 조회"}
          </button>

          {!compareMode && error && <div className="text-[12px] text-bear">{error}</div>}
        </Panel>

        {/* Area selection — single mode only */}
        {!compareMode && selectedComplex && (
          <Panel tag="STEP 02" title="전용면적" subtitle={selectedComplex.name} bodyClassName="p-3">
            {loading === "areas" ? (
              <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
                면적 조회 중… (최초 조회 시 수십 초 소요)
              </div>
            ) : areaList.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {error ? <span className="text-bear">{error}</span> : "면적 데이터가 없습니다"}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {areaList.map((a) => (
                  <button key={a.value} onClick={() => handlePickArea(a.value)}
                    className={cn("rounded-sm border border-border px-2 py-2 font-mono text-[11px] transition-snap hover:border-primary/40",
                      selectedArea === a.value && "border-primary bg-primary/10 text-primary")}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {/* Summary */}
        {searched && (
          <Panel tag="META" title="조회 결과 요약" bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="단지 수" value={complexList.length.toString()} accent />
              <StatTile label="평균 세대" value={avgHouseholds > 0 ? avgHouseholds.toLocaleString() : "—"} />
            </div>
          </Panel>
        )}
      </aside>

      {/* RIGHT */}
      <main className="min-w-0 space-y-5">
        {(searched || loading === "list") && (
          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <MapView
              complexes={complexList}
              selected={compareMode ? null : selectedComplex}
              compareEntries={compareMode ? compareEntries : []}
              onSelect={compareMode ? toggleCompareComplex : handlePickComplex}
              isLoading={loading === "list"}
            />
            <ComplexList
              complexes={complexList}
              selected={compareMode ? null : selectedComplex}
              onSelect={compareMode ? toggleCompareComplex : handlePickComplex}
              isLoading={loading === "list"}
              compareMode={compareMode}
              compareEntries={compareEntries}
              compareLoading={compareLoading}
              canCompare={canCompare}
              readyCount={readyCount}
              onEnterCompare={enterCompareMode}
              onExitCompare={exitCompareMode}
              onRunCompare={handleCompare}
              onSelectArea={selectCompareArea}
              onRemoveEntry={removeCompareEntry}
            />
          </div>
        )}

        {/* Compare results */}
        {compareMode && compareData.length >= 2 && (
          <ComparePanel
            results={compareData}
            error={compareError}
            onRemove={removeFromCompareData}
          />
        )}

        {/* Single-select results */}
        {!compareMode && (
          loading === "results" ? (
            <Panel className="bg-grid">
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-5 px-10">
                <div className="animate-pulse text-sm text-muted-foreground">
                  결과 조회 중… (최초 조회 시 1-2분 소요될 수 있습니다)
                </div>
                <div className="w-full max-w-sm space-y-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                      style={{ width: `${fetchProgress}%` }}
                    />
                  </div>
                  <div className="text-right font-mono text-[11px] text-primary">
                    {Math.round(fetchProgress)}%
                  </div>
                </div>
              </div>
            </Panel>
          ) : selectedArea !== null && !results && error ? (
            <Panel className="bg-grid">
              <div className="flex min-h-[200px] items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="text-sm text-bear">{error}</div>
                  <div className="text-xs text-muted-foreground">다른 단지나 면적을 선택하거나 잠시 후 다시 시도해주세요</div>
                </div>
              </div>
            </Panel>
          ) : results ? (
            <>
              <Panel bodyClassName="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="ticker bg-primary/15 text-primary">APT</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {baseParams.City} · {baseParams.District}
                      </span>
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {results.aptName || selectedComplex?.name}
                    </h2>
                    {results.roadAddress && (
                      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {results.roadAddress}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <StatTile label="최근 평균가" value={lastPrice ? formatWonShort(lastPrice) : "—"} accent large />
                    <StatTile label="세대수" value={results.households ? results.households.toLocaleString() : "—"} hint="가구" />
                    <StatTile label="주차" value={results.parking || "—"} hint="대" />
                  </div>
                </div>
              </Panel>

              <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                <PriceCharts
                  priceSeries={results.priceSeries}
                  compareSeries={results.compareSeries}
                  areaComplexBars={results.areaComplexBars}
                  districtBars={results.districtBars}
                  aptName={results.aptName || selectedComplex?.name || ""}
                  district={baseParams.District}
                  aptAvg={results.districtStats?.aptAvg}
                />
                {results.districtStats && (
                  <DistrictGauge stats={results.districtStats} district={baseParams.District} />
                )}
              </div>

              <Panel tag="LEDGER" title="최근 실거래" subtitle={`${results.items.length}건`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="pb-2 pr-4">계약일</th>
                        <th className="pb-2 pr-4">전용면적</th>
                        <th className="pb-2 pr-4 text-center">층</th>
                        <th className="pb-2 pr-4">건축년도</th>
                        <th className="pb-2 pl-4 text-right">거래가</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.items.slice(0, 20).map((t, i) => (
                        <tr key={i} className="border-b border-border/50 transition-snap hover:bg-surface">
                          <td className="py-2.5 pr-4 font-mono text-[12px]">{t.dealDate ? t.dealDate.slice(0, 10) : "—"}</td>
                          <td className="py-2.5 pr-4 font-mono text-[12px]">
                            {t.area != null ? `${Number(t.area).toFixed(2)}㎡` : "—"}
                          </td>
                          <td className="py-2.5 pr-4 text-center font-mono text-[12px]">{t.floor ?? "—"}</td>
                          <td className="py-2.5 pr-4 font-mono text-[12px] text-muted-foreground">{t.buildYear ?? "—"}</td>
                          <td className="py-2.5 pl-4 text-right">
                            <span className="font-mono text-[13px] font-semibold text-foreground">
                              {t.price != null ? formatWon(t.price) : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <NearbyPanel
                roadAddress={results.roadAddress}
                aptName={results.aptName || selectedComplex?.name || ""}
                district={baseParams.District}
                onSubwayFound={handleSubwayFound}
              />

              {subwayCoord && selectedArea !== null && (
                <SubwayPeerChart
                  baseParams={baseParams}
                  complexName={results.aptName || selectedComplex?.name || ""}
                  area={selectedArea}
                  roadAddress={results.roadAddress}
                  subwayLat={subwayCoord.lat}
                  subwayLng={subwayCoord.lng}
                  subwayName={subwayCoord.name}
                />
              )}
            </>
          ) : null
        )}
      </main>
    </div>
  );
};

/* ── Kakao 지도 자동 bounds 조정 ─────────────────────────── */
const KakaoBoundsFitter = ({ complexes }: { complexes: FilterListItem[] }) => {
  const map = useMap();
  useEffect(() => {
    const pts = complexes.filter((c) => c.lat && c.lng);
    if (pts.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const km = (window as any).kakao.maps;
    if (pts.length === 1) {
      map.setCenter(new km.LatLng(pts[0].lat!, pts[0].lng!));
      map.setLevel(5);
      return;
    }
    const bounds = new km.LatLngBounds();
    pts.forEach((c: FilterListItem) => bounds.extend(new km.LatLng(c.lat!, c.lng!)));
    map.setBounds(bounds);
  }, [complexes, map]);
  return null;
};

/* ── Kakao Map View ────────────────────────────────────────── */
const MapView = ({
  complexes, selected, compareEntries, onSelect, isLoading,
}: {
  complexes: FilterListItem[];
  selected: FilterListItem | null;
  compareEntries: CompareEntry[];
  onSelect: (c: FilterListItem) => void;
  isLoading?: boolean;
}) => {
  const [isLoaded, loadError] = useKakaoLoader({
    appkey: import.meta.env.VITE_KAKAO_JS_KEY ?? "",
  });
  const mapped = complexes.filter((c) => c.lat && c.lng);

  return (
    <Panel tag="MAP" title="단지 분포" subtitle="서울특별시"
      actions={<span className="font-mono text-[10px] text-muted-foreground">{mapped.length} markers</span>}
      bodyClassName="p-0">
      <div className="relative h-[420px] overflow-hidden rounded-b-md">
        {isLoading ? (
          <div className="flex h-full items-center justify-center bg-muted/30">
            <span className="animate-pulse text-sm text-muted-foreground">조회 중...</span>
          </div>
        ) : mapped.length === 0 ? (
          <div className="flex h-full items-center justify-center bg-muted/30">
            <span className="text-sm text-muted-foreground">좌표 데이터 없음</span>
          </div>
        ) : loadError ? (
          <div className="flex h-full items-center justify-center bg-muted/30">
            <span className="text-sm text-destructive">지도 로드 실패</span>
          </div>
        ) : !isLoaded ? (
          <div className="flex h-full items-center justify-center bg-muted/30">
            <span className="animate-pulse text-sm text-muted-foreground">지도 로딩 중...</span>
          </div>
        ) : (
          <KakaoMap
            center={{ lat: 37.55, lng: 127.0 }}
            level={7}
            style={{ height: "100%", width: "100%" }}
          >
            <KakaoBoundsFitter complexes={mapped} />
            {mapped.map((c, i) => {
              const isSel =
                selected?.name === c.name ||
                compareEntries.some((e) => e.complex.name === c.name);
              return (
                <React.Fragment key={i}>
                  <CustomOverlayMap
                    position={{ lat: c.lat!, lng: c.lng! }}
                    yAnchor={1}
                    zIndex={isSel ? 10 : 1}
                  >
                    <button
                      onClick={() => onSelect(c)}
                      style={{
                        width: isSel ? "14px" : "10px",
                        height: isSel ? "14px" : "10px",
                        borderRadius: "50%",
                        backgroundColor: isSel ? "#4f46e5" : "#3b82f6",
                        border: "2px solid white",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                        cursor: "pointer",
                        display: "block",
                        padding: 0,
                      }}
                    />
                  </CustomOverlayMap>
                  {selected?.name === c.name && (
                    <CustomOverlayMap
                      position={{ lat: c.lat!, lng: c.lng! }}
                      yAnchor={2.6}
                      zIndex={20}
                    >
                      <div
                        style={{
                          background: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "12px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.최저거래가 != null && (
                          <div style={{ color: "#4f46e5" }}>{formatManwon(c.최저거래가)}</div>
                        )}
                        {c.roadAddress && (
                          <div style={{ color: "#94a3b8", fontSize: "11px" }}>{c.roadAddress}</div>
                        )}
                      </div>
                    </CustomOverlayMap>
                  )}
                </React.Fragment>
              );
            })}
          </KakaoMap>
        )}
      </div>
    </Panel>
  );
};

/* ── Complex List ─────────────────────────────────────────── */
const ComplexList = ({
  complexes, selected, onSelect, isLoading,
  compareMode, compareEntries, compareLoading, canCompare, readyCount,
  onEnterCompare, onExitCompare, onRunCompare, onSelectArea, onRemoveEntry,
}: {
  complexes: FilterListItem[];
  selected: FilterListItem | null;
  onSelect: (c: FilterListItem) => void;
  isLoading?: boolean;
  compareMode: boolean;
  compareEntries: CompareEntry[];
  compareLoading: boolean;
  canCompare: boolean;
  readyCount: number;
  onEnterCompare: () => void;
  onExitCompare: () => void;
  onRunCompare: () => void;
  onSelectArea: (complexName: string, area: number | null) => void;
  onRemoveEntry: (complexName: string) => void;
}) => (
  <Panel
    tag="LIST"
    title="조건 일치 단지"
    subtitle={compareMode ? `${compareEntries.length}개 선택` : `${complexes.length}건`}
    actions={
      compareMode ? (
        <div className="flex items-center gap-1.5">
          <button onClick={onExitCompare}
            className="rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-snap hover:border-border-strong">
            취소
          </button>
          <button onClick={onRunCompare} disabled={!canCompare}
            className="rounded-sm bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold text-primary-foreground transition-snap hover:bg-primary-glow disabled:opacity-40">
            {compareLoading ? "조회 중…" : `비교 분석 (${readyCount})`}
          </button>
        </div>
      ) : (
        <button onClick={onEnterCompare} disabled={complexes.length === 0}
          className="rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-snap hover:border-primary/40 hover:text-primary disabled:opacity-40">
          비교 모드
        </button>
      )
    }
    bodyClassName="p-2"
  >
    <div className="max-h-[420px] space-y-px overflow-y-auto">
      {isLoading ? (
        <div className="grid h-[380px] place-items-center text-xs text-muted-foreground animate-pulse">
          조회 중...
        </div>
      ) : complexes.length === 0 ? (
        <div className="grid h-[380px] place-items-center text-xs text-muted-foreground">
          조건에 맞는 단지가 없습니다
        </div>
      ) : (
        complexes.map((c, i) => {
          const isSel = selected?.name === c.name;
          const entry = compareEntries.find((e) => e.complex.name === c.name);
          const isCompSel = !!entry;
          const entryIdx = compareEntries.findIndex((e) => e.complex.name === c.name);

          return (
            <div key={i}>
              {/* Complex row */}
              <button
                onClick={() => onSelect(c)}
                className={cn(
                  "w-full rounded-sm border border-transparent px-3 py-2.5 text-left transition-snap hover:border-border-strong hover:bg-surface",
                  !compareMode && isSel && "border-primary/40 bg-primary/[0.06]",
                  compareMode && isCompSel && "border-primary/40 bg-primary/[0.06]",
                )}
              >
                <div className="flex items-center gap-2.5">
                  {compareMode && (
                    <div className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-sm border font-mono text-[10px] font-bold transition-snap",
                      isCompSel ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}>
                      {isCompSel ? entryIdx + 1 : ""}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold">{c.name}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {/* Area badge when area is chosen */}
                        {compareMode && entry?.area != null && (
                          <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                            {Number(entry.area).toFixed(1)}㎡
                          </span>
                        )}
                        {c.최저거래가 != null && (
                          <span className="font-mono text-[12px] font-semibold text-primary">
                            {formatManwon(c.최저거래가)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                      <span className="truncate">{c.roadAddress}</span>
                      {parseHH(c.세대수) > 0 && (
                        <span className="shrink-0 pl-2">{parseHH(c.세대수).toLocaleString()}세대</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>

              {/* Inline area picker — shown when entry is added but area not yet chosen */}
              {compareMode && entry && entry.area === null && (
                <div className="mx-2 mb-2 rounded-sm border border-primary/30 bg-primary/[0.04] p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      전용면적 선택
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveEntry(c.name); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {entry.areaLoading ? (
                    <div className="py-2 text-center font-mono text-[10px] text-muted-foreground animate-pulse">
                      면적 조회 중…
                    </div>
                  ) : entry.areaError || entry.areaList.length === 0 ? (
                    <div className="py-2 text-center font-mono text-[10px] text-bear">
                      {entry.areaError ? "면적 조회 실패" : "면적 데이터 없음"}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {entry.areaList.map((a) => (
                        <button
                          key={a.value}
                          onClick={(e) => { e.stopPropagation(); onSelectArea(c.name, a.value); }}
                          className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] transition-snap hover:border-primary hover:bg-primary/10 hover:text-primary"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Chosen area row — click X to reset area */}
              {compareMode && entry && entry.area !== null && (
                <div className="mx-2 mb-2 flex items-center justify-between rounded-sm border border-border/50 bg-surface px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-bull" />
                    <span className="font-mono text-[10px] text-foreground">
                      {Number(entry.area).toFixed(1)}㎡ 선택됨
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectArea(c.name, null); }}
                    className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    변경
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>

    {compareMode && compareEntries.length > 0 && compareEntries.length < 2 && (
      <div className="mt-2 border-t border-border pt-2 text-center font-mono text-[10px] text-muted-foreground">
        1개 더 선택하세요
      </div>
    )}
    {compareMode && compareEntries.length >= 2 && readyCount < compareEntries.length && (
      <div className="mt-2 border-t border-border pt-2 text-center font-mono text-[10px] text-muted-foreground">
        면적을 모두 선택하면 비교 분석이 활성화됩니다
      </div>
    )}
  </Panel>
);
