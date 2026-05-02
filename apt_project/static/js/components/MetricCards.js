// static/js/components/MetricCards.js
import { fmtPrice, esc } from '../utils/format.js';

export function MetricCards(containerId, items, aptName, roadAddress, households, parking) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const prices = items.map(x => x.price).filter(p => p != null && !isNaN(p));
  const count  = items.length;
  const avg    = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const max    = prices.length ? Math.max(...prices) : null;
  const min    = prices.length ? Math.min(...prices) : null;

  const hhVal  = households != null ? `${Number(households).toLocaleString()}<span class="metric-unit">세대</span>` : '-';
  const prkVal = parking   != null ? esc(String(parking)) : '-';

  el.innerHTML = `
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">단지명</div>
        <div class="metric-value metric-name">${esc(aptName || '-')}</div>
        <div class="metric-sub">${esc(roadAddress || '')}</div>
      </div>
      <div class="metric">
        <div class="metric-label">거래 건수</div>
        <div class="metric-value">${count}<span class="metric-unit">건</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">평균 거래금액</div>
        <div class="metric-value">${fmtPrice(avg)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">최고 / 최저</div>
        <div class="metric-value metric-range">${fmtPrice(max)} <span class="metric-sep">/</span> ${fmtPrice(min)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">세대수</div>
        <div class="metric-value">${hhVal}</div>
      </div>
      <div class="metric">
        <div class="metric-label">주차</div>
        <div class="metric-value metric-parking">${prkVal}</div>
      </div>
    </div>`;
}
