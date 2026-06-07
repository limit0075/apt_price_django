import { useState, useEffect, useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "./Panel";
import { fetchSubwayPeer } from "@/lib/djangoApi";
import type { BaseParams, SubwayPeerItem } from "@/lib/djangoTypes";

// ── 선형 회귀 ──────────────────────────────────────────────────

function linearRegression(data: SubwayPeerItem[]) {
  const n = data.length;
  if (n < 3) return null;
  const sumX  = data.reduce((s, d) => s + d.subwayDist, 0);
  const sumY  = data.reduce((s, d) => s + d.pricePerPyeong, 0);
  const sumXY = data.reduce((s, d) => s + d.subwayDist * d.pricePerPyeong, 0);
  const sumX2 = data.reduce((s, d) => s + d.subwayDist * d.subwayDist, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope     = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── 커스텀 도트 ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomDot = (props: any) => {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: SubwayPeerItem };
  if (!cx || !cy) return null;
  const r      = payload.isCurrent ? 9 : 5;
  const fill   = payload.isCurrent ? "hsl(17 64% 57%)"  : "hsl(215 15% 78%)";
  const stroke = payload.isCurrent ? "hsl(0 0% 100%)"   : "hsl(215 20% 62%)";
  const sw     = payload.isCurrent ? 2.5 : 1;
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />;
};

// ── 컴포넌트 ───────────────────────────────────────────────────

interface Props {
  baseParams: BaseParams;
  complexName: string;
  area: number;
  roadAddress: string;
  subwayLat: number;
  subwayLng: number;
  subwayName: string;
}

export const SubwayPeerChart = ({
  baseParams,
  complexName,
  area,
  roadAddress,
  subwayLat,
  subwayLng,
  subwayName,
}: Props) => {
  const [items, setItems]   = useState<SubwayPeerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    fetchSubwayPeer(baseParams, complexName, area, roadAddress, subwayLat, subwayLng)
      .then((data) => { if (!cancelled) setItems(data); })
      .catch(() => { if (!cancelled) setError("역세권 비교 데이터를 불러오는 데 실패했습니다"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [baseParams, complexName, area, roadAddress, subwayLat, subwayLng]);

  // ── 파생 계산 ─────────────────────────────────────────────────

  const { currentItem, trendLine, bandX1, bandX2, evaluation } = useMemo(() => {
    const currentItem = items.find((d) => d.isCurrent) ?? null;

    // 추세선
    const reg = linearRegression(items);
    let trendLine: { subwayDist: number; pricePerPyeong: number }[] | null = null;
    if (reg) {
      const xs = items.map((d) => d.subwayDist);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      trendLine = [
        { subwayDist: minX, pricePerPyeong: Math.round(reg.slope * minX + reg.intercept) },
        { subwayDist: maxX, pricePerPyeong: Math.round(reg.slope * maxX + reg.intercept) },
      ];
    }

    // 비슷한 거리 대역 (±30%, 최소 ±300m)
    let bandX1 = 0, bandX2 = 0;
    if (currentItem) {
      const band = Math.max(300, currentItem.subwayDist * 0.3);
      bandX1 = Math.max(0, currentItem.subwayDist - band);
      bandX2 = currentItem.subwayDist + band;
    }

    // 평가: 대역 내 유사 단지와 비교
    let evaluation: {
      peers: number; rank: number; total: number;
      diffPct: number; diffAbs: number; avgPeer: number;
      verdict: "cheap" | "fair" | "expensive";
    } | null = null;

    if (currentItem && bandX1 < bandX2) {
      const peerItems = items.filter(
        (d) => !d.isCurrent && d.subwayDist >= bandX1 && d.subwayDist <= bandX2,
      );
      if (peerItems.length >= 2) {
        const avgPeer = peerItems.reduce((s, d) => s + d.pricePerPyeong, 0) / peerItems.length;
        const diff    = currentItem.pricePerPyeong - avgPeer;
        const diffPct = (diff / avgPeer) * 100;
        const sorted  = [...peerItems, currentItem].sort((a, b) => a.pricePerPyeong - b.pricePerPyeong);
        const rank    = sorted.findIndex((d) => d.isCurrent) + 1;
        evaluation = {
          peers:    peerItems.length,
          rank,
          total:    sorted.length,
          diffPct:  Math.round(diffPct * 10) / 10,
          diffAbs:  Math.round(Math.abs(diff)),
          avgPeer:  Math.round(avgPeer),
          verdict:  diffPct <= -10 ? "cheap" : diffPct >= 10 ? "expensive" : "fair",
        };
      }
    }

    return { currentItem, trendLine, bandX1, bandX2, evaluation };
  }, [items]);

  const tooltipStyle = {
    backgroundColor: "hsl(0 0% 100%)",
    border: "1px solid hsl(36 22% 88%)",
    borderRadius: "8px",
    padding: "0",
    boxShadow: "0 4px 16px hsl(20 15% 11% / 0.10)",
  };

  return (
    <Panel
      tag="PEER"
      title="역세권 비교 분석"
      subtitle={`${subwayName} 기준 · ${Number(area).toFixed(1)}㎡ 전후 단지`}
      bodyClassName="p-2 pt-4"
    >
      {loading ? (
        <div className="flex h-[320px] items-center justify-center">
          <span className="animate-pulse text-sm text-muted-foreground">
            단지 좌표 조회 중… (최초 조회 시 수십 초 소요)
          </span>
        </div>
      ) : error ? (
        <div className="flex h-[320px] items-center justify-center text-sm text-bear">
          {error}
        </div>
      ) : items.length < 2 ? (
        <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
          비교 데이터가 부족합니다
        </div>
      ) : (
        <>
          {/* ── 평가 요약 카드 ───────────────────────────────── */}
          {evaluation && (
            <div className={[
              "mx-2 mb-4 rounded-lg border px-4 py-3",
              evaluation.verdict === "cheap"     && "border-[hsl(142_44%_38%/0.4)] bg-[hsl(142_44%_38%/0.06)]",
              evaluation.verdict === "fair"      && "border-primary/30 bg-primary/[0.04]",
              evaluation.verdict === "expensive" && "border-bear/30 bg-bear/[0.05]",
            ].filter(Boolean).join(" ")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className={[
                    "text-[13px] font-semibold",
                    evaluation.verdict === "cheap"     && "text-[hsl(142_44%_32%)]",
                    evaluation.verdict === "fair"      && "text-primary",
                    evaluation.verdict === "expensive" && "text-bear",
                  ].filter(Boolean).join(" ")}>
                    {evaluation.verdict === "cheap"     && "▼ 역세권 대비 저평가"}
                    {evaluation.verdict === "fair"      && "● 역세권 대비 적정 수준"}
                    {evaluation.verdict === "expensive" && "▲ 역세권 대비 고평가"}
                  </span>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    비슷한 역세권 {evaluation.peers}개 단지 평균 대비{" "}
                    <span className="font-semibold text-foreground">
                      {Math.abs(evaluation.diffPct)}%{" "}
                      {evaluation.diffPct < 0 ? "저렴" : "비쌈"}
                    </span>
                    {" "}· 평단가 {evaluation.diffAbs.toLocaleString()}만원 차이
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-foreground">
                    {evaluation.rank}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      /{evaluation.total}위
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    가격 순위 (낮을수록 저렴)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 산점도 ──────────────────────────────────────── */}
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 28 }}>
                <CartesianGrid stroke="hsl(36 22% 88%)" strokeDasharray="2 4" />

                <XAxis
                  dataKey="subwayDist"
                  type="number"
                  name="역 거리"
                  tick={{ fill: "hsl(20 8% 50%)", fontSize: 10, fontFamily: "Inter, system-ui" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(36 22% 88%)" }}
                  tickFormatter={(v: number) => `${v}m`}
                  label={{
                    value: `← ${subwayName}에서 가까운`,
                    position: "insideBottom",
                    offset: -12,
                    fontSize: 10,
                    fill: "hsl(20 8% 50%)",
                  }}
                />
                <YAxis
                  dataKey="pricePerPyeong"
                  type="number"
                  name="평단가"
                  tick={{ fill: "hsl(20 8% 50%)", fontSize: 10, fontFamily: "Inter, system-ui" }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={(v: number) => `${v.toLocaleString()}만`}
                />

                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ strokeDasharray: "3 3", stroke: "hsl(36 22% 88%)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as SubwayPeerItem;
                    return (
                      <div className="rounded-lg border border-border bg-background p-3 shadow-elegant text-[12px]">
                        <div className={`font-semibold ${d.isCurrent ? "text-primary" : "text-foreground"}`}>
                          {d.isCurrent ? "★ " : ""}
                          {d.name}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          역까지{" "}
                          <span className="text-foreground">{d.subwayDist.toLocaleString()}m</span>
                          {" · 도보 "}
                          <span className="text-foreground">
                            {Math.max(1, Math.round(d.subwayDist / 67))}분
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          평단가{" "}
                          <span className="font-semibold text-foreground">
                            {d.pricePerPyeong.toLocaleString()}만원
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />

                {/* 비슷한 거리 대역 */}
                {currentItem && (
                  <ReferenceArea
                    x1={bandX1}
                    x2={bandX2}
                    fill="hsl(17 64% 57% / 0.07)"
                    stroke="hsl(17 64% 57% / 0.25)"
                    strokeDasharray="3 3"
                    label={{
                      value: "비교 대역",
                      position: "insideTop",
                      fontSize: 9,
                      fill: "hsl(17 64% 57% / 0.7)",
                    }}
                  />
                )}

                {/* 선택 단지 수직선 */}
                {currentItem && (
                  <ReferenceLine
                    x={currentItem.subwayDist}
                    stroke="hsl(17 64% 57%)"
                    strokeDasharray="4 2"
                    strokeOpacity={0.6}
                    label={{
                      value: complexName,
                      position: "top",
                      fontSize: 9,
                      fill: "hsl(17 64% 57%)",
                    }}
                  />
                )}

                {/* 추세선 (회귀선) — 별도 Scatter로 선만 표시 */}
                {trendLine && (
                  <Scatter
                    data={trendLine}
                    line={{
                      stroke: "hsl(215 15% 65%)",
                      strokeWidth: 1.5,
                      strokeDasharray: "5 3",
                    }}
                    shape={() => null as unknown as React.ReactElement}
                    legendType="none"
                  >
                    {trendLine.map((_, i) => <Cell key={i} fill="none" />)}
                  </Scatter>
                )}

                {/* 데이터 산점 */}
                <Scatter data={items} shape={<CustomDot />}>
                  {items.map((_, i) => <Cell key={i} fill="none" />)}
                </Scatter>

              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* ── 범례 ────────────────────────────────────────── */}
          <div className="mt-2 flex flex-wrap items-center gap-4 px-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-[hsl(17_64%_57%)]" />
              <span>선택 단지</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-[hsl(215_15%_78%)]" />
              <span>동일 구 내 단지 ({items.length - (currentItem ? 1 : 0)}개)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 border-t border-dashed border-[hsl(215_15%_65%)] w-5" />
              <span>추세선 (가격↔거리 상관)</span>
            </div>
            <div className="ml-auto font-mono text-[10px]">
              X: 역 거리(m) · Y: 평단가(만원/평)
            </div>
          </div>
        </>
      )}
    </Panel>
  );
};
