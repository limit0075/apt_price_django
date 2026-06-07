import { Panel } from "./Panel";
import { formatWonShort } from "@/lib/format";
import type { DistrictStats } from "@/lib/djangoTypes";

export const DistrictGauge = ({
  stats,
  district,
}: {
  stats: DistrictStats;
  district: string;
}) => {
  const pct = Math.max(0, Math.min(100, stats.percentile));
  return (
    <Panel tag="GAUGE" title={`${district} 구내 백분위`}>
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              현재 단지 평균
            </div>
            <div className="mt-1 font-mono text-3xl font-semibold tracking-tight">
              {formatWonShort(stats.aptAvg)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              상위
            </div>
            <div className="mt-1 font-mono text-3xl font-semibold gradient-text">
              {(100 - pct).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* gauge bar */}
        <div className="space-y-2">
          <div className="relative h-3 overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-border">
            <div
              className="h-full rounded-full bg-gradient-primary transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute top-1/2 h-5 w-[2px] -translate-y-1/2 bg-primary shadow-[0_0_8px_hsl(17_64%_57%_/_0.4)]"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>최저 {formatWonShort(stats.districtMin)}</span>
            <span>평균 {formatWonShort(stats.districtAvg)}</span>
            <span>최고 {formatWonShort(stats.districtMax)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Stat label="구 최저" value={formatWonShort(stats.districtMin)} />
          <Stat label="구 평균" value={formatWonShort(stats.districtAvg)} />
          <Stat label="구 최고" value={formatWonShort(stats.districtMax)} />
        </div>
      </div>
    </Panel>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </div>
    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</div>
  </div>
);
