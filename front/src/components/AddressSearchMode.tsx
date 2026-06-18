import { useState, useCallback } from "react";
import { ChevronRight, MapPin, Search } from "lucide-react";
import { Panel } from "./Panel";
import { StatTile } from "./StatTile";
import { PriceCharts } from "./PriceCharts";
import { DistrictGauge } from "./DistrictGauge";
import { NearbyPanel } from "./NearbyPanel";
import { SubwayPeerChart } from "./SubwayPeerChart";
import { cn } from "@/lib/utils";
import { formatWon, formatWonShort } from "@/lib/format";
import {
  fetchCandidates,
  fetchComplexes,
  fetchAreas,
  fetchResults,
} from "@/lib/djangoApi";
import type {
  BaseParams,
  AddressCandidate,
  ComplexItem,
  AreaItem,
  AddressResultsData,
} from "@/lib/djangoTypes";

type SubwayCoord = { lat: number; lng: number; name: string };

type Step = 1 | 2 | 3 | 4;

interface Props {
  baseParams: BaseParams;
}

export const AddressSearchMode = ({ baseParams }: Props) => {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [picked, setPicked] = useState<AddressCandidate | null>(null);
  const [complexList, setComplexList] = useState<ComplexItem[]>([]);
  const [selectedComplex, setSelectedComplex] = useState<string | null>(null);
  const [areaList, setAreaList] = useState<AreaItem[]>([]);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [results, setResults] = useState<AddressResultsData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subwayCoord, setSubwayCoord] = useState<SubwayCoord | null>(null);

  const step: Step = !picked ? 1 : !selectedComplex ? 2 : !selectedArea ? 3 : 4;

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading("candidates");
    setError(null);
    setCandidates([]);
    setPicked(null);
    setComplexList([]);
    setSelectedComplex(null);
    setAreaList([]);
    setSelectedArea(null);
    setResults(null);
    try {
      const items = await fetchCandidates(baseParams, query.trim());
      setCandidates(items);
      if (items.length === 0) setError("검색 결과가 없습니다");
    } catch {
      setError("주소 검색 중 오류가 발생했습니다");
    } finally {
      setLoading(null);
    }
  }, [query, baseParams]);

  const handlePickCandidate = useCallback(
    async (candidate: AddressCandidate) => {
      setPicked(candidate);
      setSelectedComplex(null);
      setAreaList([]);
      setSelectedArea(null);
      setResults(null);
      setLoading("complexes");
      setError(null);
      try {
        const { items } = await fetchComplexes(baseParams, candidate);
        setComplexList(items);
        if (items.length === 0) setError("해당 주소에 단지가 없습니다");
      } catch {
        setError("단지 조회 중 오류가 발생했습니다");
      } finally {
        setLoading(null);
      }
    },
    [baseParams],
  );

  const handlePickComplex = useCallback(
    async (complexName: string) => {
      if (!picked) return;
      setSelectedComplex(complexName);
      setAreaList([]);
      setSelectedArea(null);
      setResults(null);
      setLoading("areas");
      setError(null);
      try {
        const items = await fetchAreas(baseParams, picked, complexName);
        setAreaList(items);
      } catch {
        setError("면적 조회 중 오류가 발생했습니다");
      } finally {
        setLoading(null);
      }
    },
    [baseParams, picked],
  );

  const handlePickArea = useCallback(
    async (area: number) => {
      if (!picked || !selectedComplex) return;
      setSelectedArea(area);
      setResults(null);
      setSubwayCoord(null);
      setLoading("results");
      setError(null);
      try {
        const data = await fetchResults(baseParams, picked, selectedComplex, area);
        setResults(data);
      } catch {
        setError("결과 조회 중 오류가 발생했습니다");
      } finally {
        setLoading(null);
      }
    },
    [baseParams, picked, selectedComplex],
  );

  const lastPrice = results?.priceSeries?.length
    ? results.priceSeries[results.priceSeries.length - 1].avgPrice
    : null;
  const prevPrice = results?.priceSeries && results.priceSeries.length >= 2
    ? results.priceSeries[results.priceSeries.length - 2].avgPrice
    : null;
  const monthlyChange =
    lastPrice && prevPrice ? ((lastPrice - prevPrice) / prevPrice) * 100 : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      {/* LEFT — search funnel */}
      <aside className="space-y-5">
        {/* Step 1 */}
        <Panel tag="STEP 01" title="주소 검색" bodyClassName="p-3">
          <div className="flex items-center gap-2 rounded-sm border border-input-border bg-input px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="도로명·지번·우편번호"
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={loading === "candidates"}
              className="rounded-sm bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary-foreground transition-snap hover:bg-primary-glow disabled:opacity-50"
            >
              {loading === "candidates" ? "…" : "GO"}
            </button>
          </div>

          {error && (
            <div className="mt-2 text-[12px] text-bear">{error}</div>
          )}

          <div className="mt-3 max-h-[220px] space-y-1 overflow-y-auto">
            {loading === "candidates" ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                검색 중...
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                검색어를 입력하세요
              </div>
            ) : (
              candidates.map((c, i) => (
                <button
                  key={i}
                  onClick={() => handlePickCandidate(c)}
                  className={cn(
                    "group w-full rounded-sm border border-transparent px-3 py-2 text-left transition-snap hover:border-border-strong hover:bg-surface",
                    picked?.zipNo === c.zipNo &&
                      picked?.roadAddress === c.roadAddress &&
                      "border-primary/40 bg-primary/[0.06]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium">
                      {c.roadAddress || c.label}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {c.zipNo}
                    </span>
                  </div>
                  {c.jibunAddress && (
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      지번 · {c.jibunAddress}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </Panel>

        {/* Step 2 */}
        {picked && (
          <Panel
            tag="STEP 02"
            title="단지 선택"
            subtitle={baseParams.District}
            bodyClassName="p-2"
          >
            {loading === "complexes" ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                단지 조회 중...
              </div>
            ) : (
              <div className="max-h-[260px] space-y-1 overflow-y-auto">
                {complexList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    단지가 없습니다
                  </div>
                ) : (
                  complexList.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => handlePickComplex(c.name)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-sm px-3 py-2 text-left transition-snap hover:bg-surface",
                        selectedComplex === c.name &&
                          "bg-primary/[0.08] ring-1 ring-inset ring-primary/30",
                      )}
                    >
                      <div className="text-[13px] font-medium">{c.label}</div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            )}
          </Panel>
        )}

        {/* Step 3 */}
        {selectedComplex && (
          <Panel tag="STEP 03" title="전용면적" bodyClassName="p-3">
            {loading === "areas" ? (
              <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
                면적 조회 중...
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {areaList.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => handlePickArea(a.value)}
                    className={cn(
                      "rounded-sm border border-border px-2 py-2 font-mono text-[11px] transition-snap hover:border-primary/40",
                      selectedArea === a.value &&
                        "border-primary bg-primary/10 text-primary",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}
      </aside>

      {/* RIGHT — results */}
      <main className="min-w-0 space-y-5">
        {loading === "results" ? (
          <Panel className="bg-grid">
            <div className="flex min-h-[480px] flex-col items-center justify-center">
              <div className="animate-pulse text-sm text-muted-foreground">
                데이터 조회 중… (수십 초 소요될 수 있습니다)
              </div>
            </div>
          </Panel>
        ) : !results ? (
          <EmptyState step={step} />
        ) : (
          <>
            {/* Complex header */}
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
                    {results.aptName || selectedComplex}
                  </h2>
                  {results.roadAddress && (
                    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {results.roadAddress}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatTile
                    label="최근 평균가"
                    value={lastPrice ? formatWonShort(lastPrice) : "—"}
                    accent
                    large
                  />
                  {monthlyChange !== null && (
                    <StatTile
                      label="최근 변동"
                      value={`${monthlyChange >= 0 ? "+" : ""}${monthlyChange.toFixed(1)}%`}
                      delta={monthlyChange}
                    />
                  )}
                  <StatTile
                    label="세대수"
                    value={
                      results.households
                        ? results.households.toLocaleString()
                        : "—"
                    }
                    hint="가구"
                  />
                  <StatTile
                    label="주차"
                    value={results.parking || "—"}
                    hint="대"
                  />
                </div>
              </div>
            </Panel>

            {/* Charts + Gauge */}
            <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
              <PriceCharts
                priceSeries={results.priceSeries}
                compareSeries={results.compareSeries}
                areaComplexBars={results.areaComplexBars}
                districtBars={results.districtBars}
                aptName={results.aptName || selectedComplex || ""}
                district={baseParams.District}
                aptAvg={results.districtStats?.aptAvg}
              />
              {results.districtStats && (
                <DistrictGauge
                  stats={results.districtStats}
                  district={baseParams.District}
                />
              )}
            </div>

            {/* Trades table */}
            <Panel
              tag="LEDGER"
              title="최근 실거래"
              subtitle={`${results.items.length}건`}
            >
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
                      <tr
                        key={i}
                        className="border-b border-border/50 transition-snap hover:bg-surface"
                      >
                        <td className="py-2.5 pr-4 font-mono text-[12px]">
                          {t.dealDate ? t.dealDate.slice(0, 10) : "—"}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-[12px]">
                          {t.area != null
                            ? `${Number(t.area).toFixed(2)}㎡`
                            : "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-center font-mono text-[12px]">
                          {t.floor ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-[12px] text-muted-foreground">
                          {t.buildYear ?? "—"}
                        </td>
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

            {/* Map + Blog */}
            <NearbyPanel
              roadAddress={results.roadAddress}
              aptName={results.aptName || selectedComplex || ""}
              district={baseParams.District}
              onSubwayFound={(lat, lng, name) => setSubwayCoord({ lat, lng, name })}
            />

            {/* 역세권 비교 */}
            {subwayCoord && selectedArea !== null && (
              <SubwayPeerChart
                baseParams={baseParams}
                complexName={results.aptName || selectedComplex || ""}
                area={selectedArea}
                roadAddress={results.roadAddress}
                subwayLat={subwayCoord.lat}
                subwayLng={subwayCoord.lng}
                subwayName={subwayCoord.name}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

const EmptyState = ({ step }: { step: Step }) => {
  const steps = [
    "도로명·지번·우편번호로 주소를 검색하세요",
    "후보 중에서 정확한 주소를 선택하세요",
    "해당 위치의 단지를 선택하세요",
    "전용면적을 선택하면 결과가 표시됩니다",
  ];
  return (
    <Panel className="bg-grid">
      <div className="flex min-h-[480px] flex-col items-center justify-center px-6 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full border border-primary/30 bg-primary/10 shadow-glow">
          <Search className="h-6 w-6 text-primary" />
        </div>
        <h3 className="mt-5 text-xl font-semibold tracking-tight">
          주소를 입력해 실거래를 분석하세요
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          국토교통부 실거래가 + KAPT 단지정보를 매칭해 가격 추이, 면적·구별
          비교, 백분위 분석까지 한 화면에 제공합니다.
        </p>
        <ol className="mt-8 space-y-2.5 text-left">
          {steps.map((s, i) => {
            const idx = (i + 1) as Step;
            const active = step === idx;
            const done = step > idx;
            return (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border font-mono text-[11px]",
                    done && "border-bull/50 bg-bull/10 text-bull",
                    active &&
                      "border-primary bg-primary text-primary-foreground shadow-glow",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? "✓" : idx}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s}
                </span>
                {active && <ChevronRight className="h-4 w-4 text-primary" />}
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
};
