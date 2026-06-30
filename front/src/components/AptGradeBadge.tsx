import { cn } from "@/lib/utils";
import { Panel } from "./Panel";
import type { AptGrade } from "@/lib/djangoTypes";

// ── 등급별 색상 ──────────────────────────────────────────────

const GRADE_CFG = {
  S:   { color: 'hsl(38 85% 48%)',  bg: 'hsl(38 85% 48% / 0.12)',  ring: 'hsl(38 85% 48% / 0.30)',  label: '최상위' },
  A:   { color: 'hsl(142 44% 38%)', bg: 'hsl(142 44% 38% / 0.10)', ring: 'hsl(142 44% 38% / 0.28)', label: '우수'   },
  B:   { color: 'hsl(210 62% 50%)', bg: 'hsl(210 62% 50% / 0.10)', ring: 'hsl(210 62% 50% / 0.28)', label: '양호'   },
  C:   { color: 'hsl(20 8% 50%)',   bg: 'hsl(20 8% 50% / 0.10)',   ring: 'hsl(20 8% 50% / 0.24)',   label: '보통'   },
  D:   { color: 'hsl(0 60% 48%)',   bg: 'hsl(0 60% 48% / 0.10)',   ring: 'hsl(0 60% 48% / 0.28)',   label: '미흡'   },
  'N/A': { color: 'hsl(20 8% 65%)', bg: 'hsl(20 8% 65% / 0.08)',  ring: 'hsl(20 8% 65% / 0.20)',   label: '—'     },
} as const;

type GradeKey = keyof typeof GRADE_CFG;

// ── 인라인 뱃지 ───────────────────────────────────────────────
// 필터 목록 row 등 좁은 공간에 사용

interface BadgeProps {
  grade: AptGrade;
  size?: 'sm' | 'md';
  className?: string;
}

export const AptGradeBadge = ({ grade, size = 'sm', className }: BadgeProps) => {
  const key = (grade?.grade ?? 'N/A') as GradeKey;
  const cfg = GRADE_CFG[key] ?? GRADE_CFG['N/A'];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded font-mono font-bold leading-none select-none",
        size === 'sm' ? "h-[22px] w-[22px] text-[11px]" : "h-7 w-7 text-[13px]",
        className,
      )}
      style={{
        color:      cfg.color,
        background: cfg.bg,
        boxShadow:  `0 0 0 1px ${cfg.ring}`,
      }}
      title={`${cfg.label} · ${grade?.normalized?.toFixed(0) ?? '—'}점`}
    >
      {key}
    </span>
  );
};

// ── 등급 패널 ─────────────────────────────────────────────────
// 상세 결과 화면에 사용. 점수 분류 바 포함.

interface PanelProps {
  grade: AptGrade;
  className?: string;
}

const CRITERION_ORDER = ['price', 'infra', 'size', 'volume'] as const;

export const AptGradePanel = ({ grade, className }: PanelProps) => {
  const key = (grade?.grade ?? 'N/A') as GradeKey;
  const cfg = GRADE_CFG[key] ?? GRADE_CFG['N/A'];
  const norm = grade?.normalized ?? 0;

  return (
    <Panel tag="GRADE" title="단지 등급" className={className}>
      <div className="space-y-5">

        {/* 대표 등급 */}
        <div className="flex items-center gap-4">
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-4xl font-bold font-mono"
            style={{
              color:      cfg.color,
              background: cfg.bg,
              boxShadow:  `0 0 0 2px ${cfg.ring}`,
            }}
          >
            {key}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-baseline justify-between">
              <span
                className="text-[13px] font-semibold"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </span>
              <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                {grade?.score?.toFixed(1) ?? '—'} / {grade?.maxScore ?? '—'} pt
              </span>
            </div>

            {/* 종합 점수 바 */}
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width:      `${Math.min(norm, 100)}%`,
                  background: cfg.color,
                }}
              />
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              종합 {norm.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* 기준별 세부 점수 */}
        {grade?.breakdown && Object.keys(grade.breakdown).length > 0 && (
          <div className="space-y-3 border-t border-border pt-4">
            {CRITERION_ORDER.map((k) => {
              const item = grade.breakdown[k];
              if (!item) return null;
              const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
              return (
                <CriterionRow
                  key={k}
                  label={item.label}
                  score={item.score}
                  max={item.max}
                  pct={pct}
                  color={cfg.color}
                />
              );
            })}
          </div>
        )}

        {/* 등급 기준 범례 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3">
          {(Object.entries(GRADE_CFG) as [GradeKey, typeof GRADE_CFG[GradeKey]][])
            .filter(([k]) => k !== 'N/A')
            .map(([k, c]) => (
              <div key={k} className="flex items-center gap-1">
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold font-mono"
                  style={{ color: c.color, background: c.bg }}
                >
                  {k}
                </span>
                <span className="text-[10px] text-muted-foreground">{c.label}</span>
              </div>
            ))}
        </div>
      </div>
    </Panel>
  );
};

// ── 기준 행 ────────────────────────────────────────────────────

const CriterionRow = ({
  label, score, max, pct, color,
}: {
  label: string;
  score: number;
  max: number;
  pct: number;
  color: string;
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-foreground">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {score.toFixed(1)}
        <span className="text-border-strong"> / {max} pt</span>
      </span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: 0.75 }}
      />
    </div>
  </div>
);
