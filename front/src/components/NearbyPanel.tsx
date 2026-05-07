import { useEffect, useRef, useState } from "react";
import { ExternalLink, BookOpen } from "lucide-react";
import { Panel } from "./Panel";
import { fetchNearbyInfo } from "@/lib/djangoApi";
import type { NearbyInfo } from "@/lib/djangoTypes";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const aptIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#8B5CF6;box-shadow:0 0 0 4px rgba(139,92,246,0.25),0 0 12px rgba(139,92,246,0.5);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  popupAnchor: [0, -12],
});

interface Props {
  roadAddress: string;
  aptName: string;
  district: string;
}

export const NearbyPanel = ({ roadAddress, aptName, district }: Props) => {
  const [info, setInfo] = useState<NearbyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!roadAddress) return;
    setLoading(true);
    setInfo(null);
    fetchNearbyInfo(roadAddress, aptName, district)
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roadAddress, aptName, district]);

  useEffect(() => {
    if (!mapContainerRef.current || !info?.coords) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }
    const { lat, lng } = info.coords;
    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(
      [lat, lng],
      15,
    );
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© CartoDB", maxZoom: 19 },
    ).addTo(map);
    L.marker([lat, lng], { icon: aptIcon })
      .addTo(map)
      .bindPopup(`<b style="font-size:12px">${aptName}</b>`)
      .openPopup();
    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [info?.coords, aptName]);

  const blogs = info?.blogs ?? [];
  const naverUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(
    `${district} ${aptName} 임장`,
  )}`;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      {/* Map */}
      <Panel tag="MAP" title="위치" subtitle={aptName} bodyClassName="p-0">
        <div className="relative h-[280px] overflow-hidden rounded-b-md">
          <div
            ref={mapContainerRef}
            className="absolute inset-0"
            style={{ background: "#0d1117" }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
              <span className="animate-pulse text-xs text-muted-foreground">
                위치 조회 중...
              </span>
            </div>
          )}
          {!loading && !info?.coords && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">
                위치 정보를 가져올 수 없습니다
              </span>
            </div>
          )}
        </div>
      </Panel>

      {/* Naver blog */}
      <Panel
        tag="BLOG"
        title="임장 블로그"
        subtitle="네이버"
        actions={
          <a
            href={naverUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition-snap hover:border-primary/40 hover:text-primary"
          >
            <ExternalLink className="h-3 w-3" />
            더보기
          </a>
        }
        bodyClassName="space-y-2 p-3"
      >
        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
            블로그 조회 중...
          </div>
        ) : blogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            임장 블로그가 없습니다
          </div>
        ) : (
          blogs.slice(0, 5).map((b, i) => (
            <a
              key={i}
              href={b.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-sm border border-border/50 p-3 transition-snap hover:border-border-strong hover:bg-surface"
            >
              <div className="flex items-start gap-2">
                <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-medium leading-snug"
                    dangerouslySetInnerHTML={{ __html: b.title }}
                  />
                  <div
                    className="mt-1 line-clamp-2 text-[11px] text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: b.description }}
                  />
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>{b.bloggername}</span>
                    <span>·</span>
                    <span>{b.postdate}</span>
                  </div>
                </div>
              </div>
            </a>
          ))
        )}
      </Panel>
    </div>
  );
};
