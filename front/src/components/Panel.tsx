import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tag?: string;
}

export const Panel = ({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  tag,
}: PanelProps) => {
  return (
    <section className={cn("panel animate-fade-up", className)}>
      {(title || actions) && (
        <header className="panel-header">
          <div className="flex items-center gap-3">
            {tag && (
              <span className="ticker bg-primary/15 text-primary">{tag}</span>
            )}
            {title && <h3 className="panel-title">{title}</h3>}
            {subtitle && (
              <span className="text-[11px] text-muted-foreground">{subtitle}</span>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
};
