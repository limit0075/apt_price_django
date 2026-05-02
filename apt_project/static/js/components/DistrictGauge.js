// static/js/components/DistrictGauge.js
import { fmtPrice } from '../utils/format.js';

export function DistrictGauge(containerId, stats) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!stats) { el.innerHTML = ''; return; }

  const { districtMin, districtMax, districtAvg, aptAvg, percentile } = stats;
  const range = districtMax - districtMin;
  if (range <= 0) { el.innerHTML = ''; return; }

  const aptPos  = Math.max(2, Math.min(98, (aptAvg  - districtMin) / range * 100));
  const avgPos  = Math.max(2, Math.min(98, (districtAvg - districtMin) / range * 100));
  const topPct  = (100 - percentile).toFixed(0);
  const higherLower = aptAvg >= districtAvg ? '높음' : '낮음';
  const diff = Math.abs(((aptAvg - districtAvg) / districtAvg) * 100).toFixed(1);

  el.innerHTML = `
    <div class="district-gauge card">
      <div class="card-title">구 전체 가격 분포 대비 위치</div>
      <div class="gauge-summary">
        구 평균 대비 <strong>${diff}% ${higherLower}</strong>
        &nbsp;·&nbsp; 전체 거래 중 <strong>상위 ${topPct}%</strong>
      </div>
      <div class="gauge-track-wrap">
        <div class="gauge-track">
          <div class="gauge-range-fill"></div>
          <div class="gauge-avg-pin" style="left:${avgPos}%">
            <div class="gauge-pin-line"></div>
            <div class="gauge-pin-label top">구 평균<br>${fmtPrice(districtAvg)}</div>
          </div>
          <div class="gauge-apt-pin" style="left:${aptPos}%">
            <div class="gauge-apt-dot"></div>
            <div class="gauge-pin-label bottom">이 아파트<br>${fmtPrice(aptAvg)}</div>
          </div>
        </div>
        <div class="gauge-ends">
          <span>${fmtPrice(districtMin)}</span>
          <span>${fmtPrice(districtMax)}</span>
        </div>
      </div>
    </div>`;
}