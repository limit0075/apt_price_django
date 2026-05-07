import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  large?: boolean;
  accent?: boolean;
  className?: string;
}

export const StatTile = ({
  label,
  value,
  delta,
  hint,
  large,
  accent,
  className,
}: StatTileProps) => {
  const up = delta !== undefined && delta >= 0;
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-sm border border-border bg-surface px-4 py-3 transition-snap hover:border-border-strong",
        accent && "border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent",
        className,
      )}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono font-semibold tabular-nums tracking-tight text-foreground",
            large ? "text-2xl" : "text-lg",
            accent && "gradient-text",
          )}
        >
          {value}
        </span>
        {delta !== undefined && (
          <span
            className={cn(
              "font-mono text-[11px] font-semibold",
              up ? "text-bull" : "text-bear",
            )}
          >
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
};
