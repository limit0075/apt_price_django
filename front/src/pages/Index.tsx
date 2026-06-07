import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AddressSearchMode } from "@/components/AddressSearchMode";
import { FilterSearchMode } from "@/components/FilterSearchMode";
import type { BaseParams } from "@/lib/djangoTypes";

type SearchMode = "address" | "filter";

const ParamInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <div className="flex items-center gap-2">
    <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-28 rounded-sm border border-border bg-input px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
    />
  </div>
);

const Index = () => {
  const [mode, setMode] = useState<SearchMode>("address");
  const [city, setCity] = useState("서울특별시");
  const [district, setDistrict] = useState("노원구");
  const [startDate, setStartDate] = useState("202501");
  const [endDate, setEndDate] = useState("202512");

  const baseParams: BaseParams = {
    City: city,
    District: district,
    start_date: startDate,
    end_date: endDate,
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader mode={mode} onModeChange={setMode} baseParams={baseParams} />

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Base params + page banner */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-primary">
              {mode === "address" ? "주소 검색" : "조건 검색"}
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {mode === "address"
                ? "단지를 정확히 찾고, 가격을 깊게 분석합니다"
                : "원하는 가격·세대 조건의 단지를 한 번에 찾습니다"}
            </h2>
          </div>

          {/* Query params */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 shadow-sm">
            <span className="text-xs text-muted-foreground">
              기준
            </span>
            <ParamInput label="시/도" value={city} onChange={setCity} />
            <ParamInput label="구/군" value={district} onChange={setDistrict} />
            <ParamInput
              label="시작월"
              value={startDate}
              onChange={setStartDate}
              placeholder="202501"
            />
            <ParamInput
              label="종료월"
              value={endDate}
              onChange={setEndDate}
              placeholder="202512"
            />
          </div>
        </div>

        {mode === "address" ? (
          <AddressSearchMode baseParams={baseParams} />
        ) : (
          <FilterSearchMode baseParams={baseParams} />
        )}
      </main>

      <footer className="mt-12 border-t border-border bg-surface/30 py-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            부동산 실거래 분석 · 국토교통부 실거래가 + KAPT 데이터 기반
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            © 2025 · Django + React
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
