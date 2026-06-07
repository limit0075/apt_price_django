import { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import { Panel } from "./Panel";
import { cn } from "@/lib/utils";
import { formatWonShort } from "@/lib/format";
import type { PriceSeries } from "@/lib/djangoTypes";

export type CompareResult = {
  name: string;
  area: number;
  priceSeries: PriceSeries[];
  households: number | null;
  roadAddress: string;
};

interface Props {
  results: CompareResult[];
  error?: string | null;
  onRemove?: (name: string) => void;
}

const COLORS = [
  "hsl(17 64% 57%)",
  "hsl(210 62% 50%)",
  "hsl(142 44% 38%)",
  "hsl(270 48% 55%)",
  "hsl(345 58% 52%)",
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

const axisTick = {
  fill: "hsl(20 8% 50%)",
  fontSize: 10,
  fontFamily: "Inter, system-ui",
};

// Y축 너비와 좌우 margin을 두 차트 동일하게 유지해서 X 격자가 정렬되게 함
const MARGIN = { top: 10, right: 24, left: 8, bottom: 0 } as const;
const YAXIS_W = 52;

export const ComparePanel = ({ results, error, onRemove }: Props) => {
  const [tab, setTab] = useState<"timeseries" | "avgprice">("timeseries");

  // 모든 날짜 합집합 — 두 차트가 동일한 배열을 사용해 X 위치가 일치
  const allDates = [
    ...new Set(results.flatMap((r) => r.priceSeries.map((p) => p.date))),
  ].sort();

  // 가격·거래량을 하나의 배열에 병합 (null 대신 0 사용 → stacked bar 정상 동작)
  const merged = allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const r of results) {
      const p = r.priceSeries.find((x) => x.date === date);
      row[r.name] = p?.avgPrice ?? 0;
      row[`${r.name}__v`] = p?.volume ?? 0;
    }
    return row;
  });

  // 기간 평균가 바차트 데이터
  const avgData = results.map((r, i) => {
    const prices = r.priceSeries
      .map((p) => p.avgPrice)
      .filter((v) => v > 0);
    const avg = prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : 0;
    return { name: r.name, avg, color: COLORS[i % COLORS.length] };
  });

  // 커스텀 툴팁: 가격과 거래량을 한 박스에 표시
  const PriceTooltip = ({
    active,
    label,
  }: {
    active?: boolean;
    label?: string;
  }) => {
    if (!active || !label) return null;
    const row = merged.find((d) => d.date === label);
    if (!row) return null;
    return (
      <div style={tooltipStyle}>
        <div
          style={{
            color: "hsl(20 8% 50%)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 6,
          }}
        >
          {label}
        </div>
        {results.map((r, i) => {
          const price = row[r.name] as number;
          const vol = row[`${r.name}__v`] as number;
          if (!price) return null;
          return (
            <div
              key={r.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 3,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: COLORS[i % COLORS.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 600, minWidth: 0 }}>{r.name}</span>
              <span style={{ marginLeft: "auto", paddingLeft: 12 }}>
                {formatWonShort(price)}
              </span>
              {vol > 0 && (
                <span style={{ color: "hsl(20 8% 50%)", fontSize: 10 }}>
                  {vol}건
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Panel
      tag="COMPARE"
      title="단지 비교"
      subtitle={`${results.length}개 단지`}
      actions={
        <div className="flex items-center gap-1 rounded-sm border border-border bg-background p-0.5">
          <TabBtn
            active={tab === "timeseries"}
            onClick={() => setTab("timeseries")}
          >
            월별 추이
          </TabBtn>
          <TabBtn
            active={tab === "avgprice"}
            onClick={() => setTab("avgprice")}
          >
            평균가 비교
          </TabBtn>
        </div>
      }
      bodyClassName="space-y-4 p-4"
    >
      {/* 범례 칩 */}
      <div className="flex flex-wrap gap-2">
        {results.map((r, i) => {
          const last = r.priceSeries.length
            ? r.priceSeries[r.priceSeries.length - 1].avgPrice
            : null;
          return (
            <div
              key={r.name}
              className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-1.5"
            >
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <div>
                <div className="text-[12px] font-semibold">{r.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {Number(r.area).toFixed(1)}㎡
                  {r.households
                    ? ` · ${r.households.toLocaleString()}세대`
                    : ""}
                  {last ? ` · ${formatWonShort(last)}` : ""}
                </div>
              </div>
              {onRemove && (
                <button
                  onClick={() => onRemove(r.name)}
                  className="ml-1 rounded-sm p-0.5 text-muted-foreground transition-snap hover:bg-border hover:text-foreground"
                  title="비교에서 제거"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="text-[12px] text-bear">{error}</div>}

      {tab === "timeseries" ? (
        /* ── 2-패널: 가격 선(위) / 거래량 누적 바(아래) ── */
        <div>
          {/* 가격 패널 — 툴팁 여기에만 */}
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={merged}
                syncId="cmp"
                margin={{ ...MARGIN }}
              >
                <CartesianGrid
                  stroke="hsl(36 22% 88%)"
                  vertical={false}
                  strokeDasharray="2 4"
                />
                {/* X축 라벨 숨김 — 하단 차트와 공유 */}
                <XAxis
                  dataKey="date"
                  tick={false}
                  axisLine={{ stroke: "hsl(36 22% 88%)" }}
                  tickLine={false}
                  height={12}
                />
                <YAxis
                  tick={axisTick}
                  tickFormatter={formatWonShort}
                  tickLine={false}
                  axisLine={false}
                  width={YAXIS_W}
                />
                <Tooltip
                  content={<PriceTooltip />}
                  cursor={{
                    stroke: "hsl(215 14% 58%)",
                    strokeWidth: 1,
                    strokeDasharray: "3 3",
                  }}
                />
                {results.map((r, i) => (
                  <Line
                    key={r.name}
                    type="monotone"
                    dataKey={r.name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 거래량 패널 — 툴팁 없음, syncId로 커서만 동기화 */}
          <div className="h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={merged}
                syncId="cmp"
                margin={{ ...MARGIN, top: 0, bottom: 8 }}
                barCategoryGap="30%"
              >
                <CartesianGrid
                  stroke="hsl(36 22% 88%)"
                  vertical={false}
                  strokeDasharray="2 4"
                />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(36 22% 88%)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={axisTick}
                  tickFormatter={(v) => `${v}건`}
                  tickLine={false}
                  axisLine={false}
                  width={YAXIS_W}
                  allowDecimals={false}
                  tickCount={3}
                />
                {/* 툴팁 비활성화 — 가격 패널 툴팁에 거래량이 포함됨 */}
                <Tooltip content={() => null} cursor={false} />
                {/* 누적 막대 — 단지별 색상, stackId로 합산 */}
                {results.map((r, i) => (
                  <Bar
                    key={`${r.name}__v`}
                    dataKey={`${r.name}__v`}
                    stackId="vol"
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.7}
                    radius={i === results.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 범례 설명 */}
          <div className="flex items-center gap-4 pt-1 font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded bg-foreground/40" />
              평균 거래가 (상단)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-foreground/25" />
              거래건수 누적 (하단)
            </span>
          </div>
        </div>
      ) : (
        /* ── 기간 평균가 바차트 ── */
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={avgData}
              margin={{ top: 10, right: 24, left: 8, bottom: 40 }}
            >
              <CartesianGrid
                stroke="hsl(36 22% 88%)"
                vertical={false}
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="name"
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: "hsl(36 22% 88%)" }}
                angle={-25}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis
                tick={axisTick}
                tickFormatter={formatWonShort}
                tickLine={false}
                axisLine={false}
                width={YAXIS_W}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [formatWonShort(v), "기간 평균가"]}
              />
              <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                {avgData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
};

const TabBtn = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "rounded-[3px] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-snap",
      active
        ? "bg-primary text-primary-foreground shadow-glow"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);
