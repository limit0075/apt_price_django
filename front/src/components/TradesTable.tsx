import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel } from "./Panel";
import { formatWon } from "@/lib/format";
import type { TradeItem } from "@/lib/djangoTypes";

const PAGE_SIZE = 10;

interface Props {
  items: TradeItem[];
}

export const TradesTable = ({ items }: Props) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [items]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

  return (
    <Panel tag="LEDGER" title="실거래 내역" subtitle={`총 ${items.length}건`}>
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
            {pageItems.map((t, i) => (
              <tr
                key={i}
                className="border-b border-border/50 transition-snap hover:bg-surface"
              >
                <td className="py-2.5 pr-4 font-mono text-[12px]">
                  {t.dealDate ? String(t.dealDate).slice(0, 10) : "—"}
                </td>
                <td className="py-2.5 pr-4 font-mono text-[12px]">
                  {t.area != null ? `${Number(t.area).toFixed(2)}㎡` : "—"}
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

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, items.length)} / {items.length}건
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-sm border border-border p-1 transition-snap hover:bg-surface disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[52px] text-center font-mono text-[12px]">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-sm border border-border p-1 transition-snap hover:bg-surface disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
};
