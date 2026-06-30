import { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "./Panel";
import { cn } from "@/lib/utils";
import { formatWonShort } from "@/lib/format";
import type { PriceSeries, CompareSeries, DistrictBar, AreaComplexBar } from "@/lib/djangoTypes";

type ChartTab = "timeseries" | "area" | "district";

const tabs: { id: ChartTab; label: string }[] = [
  { id: "timeseries", label: "월별 시계열" },
  { id: "area", label: "면적별 비교" },
  { id: "district", label: "구별 비교" },
];

const tooltipStyle = {
  backgroundColor: "hsl(0 0% 100%)",
  border: "1px solid hsl(36 22% 88%)",
  borderRadius: "8px",
  fontSize: "12px",
  fontFamily: "Inter, system-ui, sans-serif",
  padding: "8px 12px",
  boxShadow: "0 4px 16px hsl(20 15% 11% / 0.10)",
};

const labelStyle = {
  color: "hsl(20 8% 50%)",
  fontSize: "10px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
};

interface Props {
  priceSeries: PriceSeries[];
  compareSeries: CompareSeries[];
  areaComplexBars?: AreaComplexBar[];
  districtBars: DistrictBar[];
  districtBarsLoading?: boolean;
  aptName: string;
  district: string;
  aptAvg?: number;
  startDate?: string;   // YYYYMM
  endDate?: string;     // YYYYMM
}

function genMonthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let y = parseInt(start.slice(0, 4), 10);
  let m = parseInt(start.slice(4, 6), 10);
  const ey = parseInt(end.slice(0, 4), 10);
  const em = parseInt(end.slice(4, 6), 10);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

export const PriceCharts = ({
  priceSeries,
  compareSeries: _compareSeries,
  areaComplexBars = [],
  districtBars,
  districtBarsLoading = false,
  aptName,
  aptAvg,
  startDate,
  endDate,
}: Props) => {
  const [tab, setTab] = useState<ChartTab>("timeseries");

  // Build timeseries: full range but trim leading null months so chart starts at first trade
  const timeseriesData = useMemo(() => {
    const existing = new Map(priceSeries.map((p) => [p.date, p.avgPrice]));
    if (startDate && endDate) {
      const allMonths = genMonthRange(startDate, endDate);
      const firstIdx = allMonths.findIndex((m) => existing.has(m));
      const months = firstIdx > 0 ? allMonths.slice(firstIdx) : allMonths;
      return months.map((month) => ({
        month,
        avg: existing.get(month) ?? null,
      }));
    }
    return priceSeries.map((p) => ({ month: p.date, avg: p.avgPrice as number | null }));
  }, [priceSeries, startDate, endDate]);

  // Show ~8 tick labels regardless of range length
  const xTickInterval = timeseriesData.length <= 12
    ? 0
    : Math.floor(timeseriesData.length / 8);

  // 구별 비교: 서울 전체 구 평균가 + 내 단지 표시
  type DistrictEntry = { district: string; avgPrice: number; isCurrent?: boolean; isApt?: boolean };
  const districtData: DistrictEntry[] = useMemo(
    () =>
      aptAvg != null
        ? [...districtBars, { district: aptName, avgPrice: aptAvg, isApt: true }].sort(
            (a, b) => a.avgPrice - b.avgPrice,
          )
        : districtBars,
    [districtBars, aptName, aptAvg],
  );

  return (
    <Panel
      tag="CHARTS"
      title="가격 분석"
      subtitle={aptName}
      actions={
        <div className="flex items-center gap-1 rounded-sm border border-border bg-background p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-[3px] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-snap",
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
      bodyClassName="p-2 pt-4"
    >
      <div className="h-[320px] w-full">
        {tab === "district" && districtBarsLoading ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            구별 데이터 조회 중… (수 분 소요될 수 있습니다)
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          {tab === "timeseries" ? (
            <AreaChart
              data={timeseriesData}
              margin={{ top: 10, right: 24, left: 8, bottom: 8 }}
            >
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(17 64% 57%)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(17 64% 57%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="hsl(36 22% 88%)"
                vertical={false}
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="month"
                tick={{
                  fill: "hsl(20 8% 50%)",
                  fontSize: 10,
                  fontFamily: "Inter, system-ui",
                }}
                tickLine={false}
                axisLine={{ stroke: "hsl(36 22% 88%)" }}
                interval={xTickInterval}
              />
              <YAxis
                tick={{
                  fill: "hsl(20 8% 50%)",
                  fontSize: 10,
                  fontFamily: "Inter, system-ui",
                }}
                tickFormatter={(v) => formatWonShort(v)}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                cursor={{
                  stroke: "hsl(17 64% 57%)",
                  strokeOpacity: 0.3,
                  strokeDasharray: "3 3",
                }}
                formatter={(v: number) => [formatWonShort(v), "평균가"]}
              />
              <Area
                type="monotone"
                dataKey="avg"
                stroke="hsl(17 64% 57%)"
                strokeWidth={2}
                fill="url(#priceFill)"
                connectNulls
                dot={{ r: 3, fill: "hsl(17 64% 57%)", strokeWidth: 0 }}
                activeDot={{
                  r: 4,
                  stroke: "hsl(0 0% 100%)",
                  strokeWidth: 2,
                  fill: "hsl(17 64% 57%)",
                }}
              />
            </AreaChart>
          ) : tab === "area" ? (
            /* 면적별 비교: 같은 구·같은 면적의 인근 단지 평균가 비교 */
            <BarChart
              data={areaComplexBars}
              margin={{ top: 10, right: 24, left: 8, bottom: 30 }}
            >
              <CartesianGrid
                stroke="hsl(36 22% 88%)"
                vertical={false}
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="name"
                tick={(props) => {
                  const { x, y, payload } = props;
                  const entry = areaComplexBars.find((b) => b.name === payload.value);
                  const color = entry?.isCurrent ? "hsl(17 64% 57%)" : "hsl(20 8% 50%)";
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text
                        x={0} y={0} dy={4}
                        textAnchor="end"
                        fill={color}
                        fontSize={entry?.isCurrent ? 10 : 9}
                        fontWeight={entry?.isCurrent ? 600 : 400}
                        fontFamily="Inter, system-ui"
                        transform="rotate(-40)"
                      >
                        {payload.value}
                      </text>
                    </g>
                  );
                }}
                tickLine={false}
                axisLine={{ stroke: "hsl(36 22% 88%)" }}
                interval={0}
                height={50}
              />
              <YAxis
                tick={{
                  fill: "hsl(20 8% 50%)",
                  fontSize: 10,
                  fontFamily: "Inter, system-ui",
                }}
                tickFormatter={(v) => formatWonShort(v)}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                cursor={{ fill: "hsl(17 64% 57% / 0.06)" }}
                formatter={(v: number, _n, props) => [
                  formatWonShort(v),
                  props.payload?.isCurrent ? "선택 단지" : "구내 단지",
                ]}
              />
              <Bar dataKey="avgPrice" radius={[4, 4, 0, 0]}>
                {areaComplexBars.map((b, i) => (
                  <Cell
                    key={i}
                    fill={b.isCurrent ? "hsl(17 64% 57%)" : "hsl(215 15% 78%)"}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            /* 구별 비교: 서울 전체 구 평균가 중 내 단지 위치 확인 */
            <BarChart
              data={districtData}
              margin={{ top: 10, right: 24, left: 8, bottom: 30 }}
            >
              <CartesianGrid
                stroke="hsl(36 22% 88%)"
                vertical={false}
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="district"
                tick={(props) => {
                  const { x, y, payload } = props;
                  const entry = districtData.find((d) => d.district === payload.value);
                  const color = entry?.isApt
                    ? "hsl(210 62% 50%)"
                    : entry?.isCurrent
                    ? "hsl(17 64% 57%)"
                    : "hsl(20 8% 50%)";
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text
                        x={0} y={0} dy={4}
                        textAnchor="end"
                        fill={color}
                        fontSize={entry?.isApt ? 10 : 9}
                        fontWeight={entry?.isApt || entry?.isCurrent ? 600 : 400}
                        fontFamily="Inter, system-ui"
                        transform="rotate(-40)"
                      >
                        {payload.value}
                      </text>
                    </g>
                  );
                }}
                tickLine={false}
                axisLine={{ stroke: "hsl(36 22% 88%)" }}
                interval={0}
                height={50}
              />
              <YAxis
                tick={{
                  fill: "hsl(20 8% 50%)",
                  fontSize: 10,
                  fontFamily: "Inter, system-ui",
                }}
                tickFormatter={(v) => formatWonShort(v)}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                cursor={{ fill: "hsl(17 64% 57% / 0.06)" }}
                formatter={(v: number, _n, props) => [
                  formatWonShort(v),
                  props.payload?.isApt ? "단지 평균" : "구 평균",
                ]}
              />
              <Bar dataKey="avgPrice" radius={[4, 4, 0, 0]}>
                {districtData.map((b, i) => (
                  <Cell
                    key={i}
                    fill={
                      b.isApt
                        ? "hsl(210 62% 50%)"
                        : b.isCurrent
                        ? "hsl(17 64% 57%)"
                        : "hsl(215 15% 78%)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
};
