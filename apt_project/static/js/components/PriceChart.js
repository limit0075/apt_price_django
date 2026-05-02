// static/js/components/PriceChart.js
import { fmtPrice } from '../utils/format.js';

const _instances = {};

export function drawChart(canvasId, priceSeries, compareSeries, type = 'price', districtCompareSeries = [], districtBars = []) {
  if (_instances[canvasId]) { _instances[canvasId].destroy(); delete _instances[canvasId]; }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  let labels, datasets, chartType;

  if (type === 'price') {
    labels    = priceSeries.map(x => x.date);
    chartType = 'line';
    datasets  = [{
      label:                '단지 평균',
      data:                 priceSeries.map(x => Math.round(x.avgPrice / 10_000)),
      borderColor:          '#1D9E75',
      backgroundColor:      'rgba(29,158,117,0.08)',
      fill:                 true,
      tension:              0.3,
      pointRadius:          4,
      pointBackgroundColor: '#1D9E75',
      borderWidth:          2,
    }];

  } else if (type === 'compare') {
    labels    = compareSeries.map(x => `${Number(x.area).toFixed(1)}㎡`);
    chartType = 'bar';
    datasets  = [{
      label:           '단지 평균',
      data:            compareSeries.map(x => Math.round(x.avgPrice / 10_000)),
      backgroundColor: 'rgba(29,158,117,0.65)',
      borderColor:     '#1D9E75',
      borderWidth:     1,
      borderRadius:    4,
    }];
    if (districtCompareSeries && districtCompareSeries.length > 0) {
      const areaMap = Object.fromEntries(districtCompareSeries.map(x => [x.area, x.avgPrice]));
      datasets.push({
        label:           '구 평균',
        data:            compareSeries.map(x => {
          const v = areaMap[x.area];
          return v != null ? Math.round(v / 10_000) : null;
        }),
        backgroundColor: 'rgba(99,132,255,0.45)',
        borderColor:     '#6384FF',
        borderWidth:     1,
        borderRadius:    4,
      });
    }

  } else if (type === 'districts') {
    labels    = districtBars.map(x => x.district);
    chartType = 'bar';
    datasets  = [{
      label:           '구별 평균',
      data:            districtBars.map(x => Math.round(x.avgPrice / 10_000)),
      backgroundColor: districtBars.map(x => x.isCurrent ? 'rgba(29,158,117,0.85)' : 'rgba(99,132,255,0.45)'),
      borderColor:     districtBars.map(x => x.isCurrent ? '#1D9E75' : '#6384FF'),
      borderWidth:     1,
      borderRadius:    4,
    }];
  }

  _instances[canvasId] = new Chart(canvas, {
    type: chartType,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: type === 'compare', position: 'top', labels: { font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ctx.label}: ${fmtPrice(ctx.raw * 10_000)}` } },
      },
      scales: {
        y: {
          ticks: { callback: v => v >= 10_000 ? `${(v/10_000).toFixed(0)}억` : `${v.toLocaleString()}만` },
          grid:  { color: 'rgba(0,0,0,0.05)' },
        },
        x: { grid: { display: false }, ticks: { maxRotation: 45 } },
      },
    },
  });
}

export function setupChartToggle(toggleId, canvasId, priceSeries, compareSeries, districtCompareSeries = [], districtBars = []) {
  const el = document.getElementById(toggleId);
  if (!el) return;

  el.innerHTML = `
    <button class="btn btn-sm chart-toggle active" data-type="price">시계열</button>
    <button class="btn btn-sm chart-toggle"        data-type="compare">면적별 비교</button>
    <button class="btn btn-sm chart-toggle"        data-type="districts">구별 비교</button>`;

  el.querySelectorAll('.chart-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.chart-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawChart(canvasId, priceSeries, compareSeries, btn.dataset.type, districtCompareSeries, districtBars);
    });
  });

  drawChart(canvasId, priceSeries, compareSeries, 'price', districtCompareSeries, districtBars);
}