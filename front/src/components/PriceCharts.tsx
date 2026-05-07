import { useState } from "react";
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
import type { PriceSeries, CompareSeries, DistrictBar } from "@/lib/djangoTypes";

type ChartTab = "timeseries" | "area" | "district";

const tabs: { id: ChartTab; label: string }[] = [
  { id: "timeseries", label: "월별 시계열" },
  { id: "area", label: "면적별 비교" },
  { id: "district", label: "구별 비교" },
];

const tooltipStyle = {
  backgroundColor: "hsl(222 22% 9%)",
  border: "1px solid hsl(222 16% 24%)",
  borderRadius: "4px",
  fontSize: "12px",
  fontFamily: "JetBrains Mono, monospace",
  padding: "8px 12px",
  boxShadow: "0 8px 24px hsl(0 0% 0% / 0.6)",
};

const labelStyle = {
  color: "hsl(215 14% 58%)",
  fontSize: "10px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
};

interface Props {
  priceSeries: PriceSeries[];
  compareSeries: CompareSeries[];
  districtBars: DistrictBar[];
  aptName: string;
  district: string;
}

export const PriceCharts = ({
  priceSeries,
  compareSeries,
  districtBars,
  aptName,
}: Props) => {
  const [tab, setTab] = useState<ChartTab>("timeseries");

  // Transform to recharts format
  const timeseriesData = priceSeries.map((p) => ({
    month: p.date,
    avg: p.avgPrice,
  }));

  const areaData = compareSeries.map((s) => ({
    area: `${Number(s.area).toFixed(2)}㎡`,
    avg: s.avgPrice,
  }));

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
        <ResponsiveContainer width="100%" height="100%">
          {tab === "timeseries" ? (
            <AreaChart
              data={timeseriesData}
              margin={{ top: 10, right: 24, left: 8, bottom: 8 }}
            >
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(38 96% 56%)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(38 96% 56%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="hsl(222 16% 18%)"
                vertical={false}
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="month"
                tick={{
                  fill: "hsl(215 14% 58%)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono",
                }}
                tickLine={false}
                axisLine={{ stroke: "hsl(222 16% 18%)" }}
              />
              <YAxis
                tick={{
                  fill: "hsl(215 14% 58%)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono",
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
                  stroke: "hsl(38 96% 56%)",
                  strokeOpacity: 0.3,
                  strokeDasharray: "3 3",
                }}
                formatter={(v: number) => [formatWonShort(v), "평균가"]}
              />
              <Area
                type="monotone"
                dataKey="avg"
                stroke="hsl(38 96% 56%)"
                strokeWidth={2}
                fill="url(#priceFill)"
                activeDot={{
                  r: 4,
                  stroke: "hsl(222 24% 6%)",
                  strokeWidth: 2,
                  fill: "hsl(38 96% 56%)",
                }}
              />
            </AreaChart>
          ) : tab === "area" ? (
            <BarChart
              data={areaData}
              margin={{ top: 10, right: 24, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                stroke="hsl(222 16% 18%)"
                vertical={false}
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="area"
                tick={{
                  fill: "hsl(215 14% 58%)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono",
                }}
                tickLine={false}
                axisLine={{ stroke: "hsl(222 16% 18%)" }}
              />
              <YAxis
                tick={{
                  fill: "hsl(215 14% 58%)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono",
                }}
                tickFormatter={(v) => formatWonShort(v)}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                cursor={{ fill: "hsl(38 96% 56% / 0.06)" }}
                formatter={(v: number) => [formatWonShort(v), "평균가"]}
              />
              <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                {areaData.map((_, i) => (
                  <Cell key={i} fill={`hsl(var(--chart-${(i % 6) + 1}))`} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              data={districtBars}
              margin={{ top: 10, right: 24, left: 8, bottom: 30 }}
            >
              <CartesianGrid
                stroke="hsl(222 16% 18%)"
                vertical={false}
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="district"
                tick={{
                  fill: "hsl(215 14% 58%)",
                  fontSize: 9,
                  fontFamily: "JetBrains Mono",
                }}
                tickLine={false}
                axisLine={{ stroke: "hsl(222 16% 18%)" }}
                interval={0}
                angle={-40}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{
                  fill: "hsl(215 14% 58%)",
                  fontSize: 10,
                  fontFamily: "JetBrains Mono",
                }}
                tickFormatter={(v) => formatWonShort(v)}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                cursor={{ fill: "hsl(38 96% 56% / 0.06)" }}
                formatter={(v: number) => [formatWonShort(v), "구 평균"]}
              />
              <Bar dataKey="avgPrice" radius={[3, 3, 0, 0]}>
                {districtBars.map((b, i) => (
                  <Cell
                    key={i}
                    fill={
                      b.isCurrent
                        ? "hsl(38 96% 56%)"
                        : "hsl(222 16% 28%)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Panel>
  );
};
