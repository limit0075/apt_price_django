// static/js/pages/FilterMode.js
import * as api              from '../api/client.js';
import { callApi, show, hide, hideAll, setError } from '../hooks/useApi.js';
import { setStep }           from '../components/StepIndicator.js';
import { CandidateList }     from '../components/CandidateList.js';
import { MetricCards }       from '../components/MetricCards.js';
import { DistrictGauge }     from '../components/DistrictGauge.js';
import { ResultTable }       from '../components/ResultTable.js';
import { setupChartToggle }  from '../components/PriceChart.js';
import { NearbyInfo }        from '../components/NearbyInfo.js';
import { FilterListMap }     from '../components/FilterListMap.js';

const state = { maxPrice: '', minHouseholds: null, maxHouseholds: null, selectedComplex: null, roadAddress: null, zipNo: null };

function getBase() {
  return {
    City:       document.getElementById('city').value.trim(),
    District:   document.getElementById('district').value.trim(),
    start_date: document.getElementById('start-date').value.trim(),
    end_date:   document.getElementById('end-date').value.trim(),
  };
}

function getFilterParams() {
  const maxPrice = document.getElementById('max-price').value.trim();
  const minHH    = document.getElementById('min-households').value.trim();
  const maxHH    = document.getElementById('max-households').value.trim();
  return {
    maxPrice,
    minHouseholds: minHH ? parseInt(minHH, 10) : null,
    maxHouseholds: maxHH ? parseInt(maxHH, 10) : null,
  };
}

export function initFilterMode() {
  document.getElementById('filter-search-btn').addEventListener('click', searchFilter);
}

// ── Step 1: 조건 검색 → 단지 목록 ────────────────────────────
async function searchFilter() {
  const { maxPrice, minHouseholds, maxHouseholds } = getFilterParams();

  if (!maxPrice) { setError('filter-error', '최대 가격을 입력해주세요.'); return; }
  if (minHouseholds == null && maxHouseholds == null) { setError('filter-error', '최소 또는 최대 세대수 중 하나를 입력해주세요.'); return; }

  setStep('f', 1);
  hideAll('complex-card-filter', 'area-card-filter', 'results-filter', 'filter-error');
  Object.assign(state, { maxPrice, minHouseholds, maxHouseholds, selectedComplex: null });

  await callApi({
    loadingId: 'filter-loading', errorId: 'filter-error',
    fn: () => api.filterList(getBase(), maxPrice, minHouseholds, maxHouseholds),
    onSuccess(data) {
      if (!data.ok || !data.items?.length) { setError('filter-error', '조건에 맞는 단지를 찾지 못했습니다.'); return; }
      const countEl = document.getElementById('filter-count');
      if (countEl) countEl.textContent = `— ${data.items.length}개`;
      show('complex-card-filter');
      setStep('f', 2);
      FilterListMap('filter-list-map', data.items, name => selectComplex(name));
      CandidateList('complex-list-filter', data.items,
        item => ({
          main: item.label || item.name || item['단지명'] || '',
          sub: [
            item.roadAddress || item['대표도로명주소'],
            item['최저거래가_억'] != null ? `최저 ${Number(item['최저거래가_억']).toFixed(2)}억` : null,
            item['세대수'] ? `${item['세대수']}` : null,
          ].filter(Boolean).join(' · '),
        }),
        item => selectComplex(item.label || item.name || item['단지명']),
        'grid',
      );
    },
  });
}

// ── Step 2: 단지 선택 → 면적 목록 ────────────────────────────
async function selectComplex(name) {
  state.selectedComplex = name;
  setStep('f', 3);
  show('area-card-filter');
  hide('results-filter');
  document.getElementById('area-list-filter').innerHTML = '';
  const { maxPrice, minHouseholds, maxHouseholds } = state;

  await callApi({
    loadingId: 'area-loading-filter', errorId: '',
    fn: () => api.filterDetailAreas(getBase(), name, maxPrice, minHouseholds, maxHouseholds),
    onSuccess(data) {
      if (data.roadAddress) state.roadAddress = data.roadAddress;
      if (data.zipNo)       state.zipNo       = data.zipNo;
      if (!data.ok || !data.items?.length) {
        document.getElementById('area-list-filter').innerHTML = '<div class="empty">면적 정보를 찾지 못했습니다.</div>';
        return;
      }
      CandidateList('area-list-filter', data.items,
        item => ({ main: item.label }),
        item => selectArea(item.value),
      );
    },
  });
}

// ── Step 3: 면적 선택 → 결과 ─────────────────────────────────
async function selectArea(areaVal) {
  setStep('f', 4);
  const { maxPrice, minHouseholds, maxHouseholds } = state;

  await callApi({
    loadingId: 'area-loading-filter', errorId: '',
    fn: () => api.filterDetailResults(getBase(), state.selectedComplex, areaVal, maxPrice, minHouseholds, maxHouseholds),
    onSuccess(data) {
      if (!data.ok) return;
      show('results-filter');
      MetricCards('metrics-filter', data.items || [], data.aptName || state.selectedComplex, data.roadAddress || state.roadAddress, data.households, data.parking);
      DistrictGauge('district-gauge-filter', data.districtStats || null);
      ResultTable('result-tbody-filter', data.items || []);
      setupChartToggle('chart-toggle-filter', 'price-chart-filter', data.priceSeries || [], data.compareSeries || [], data.districtCompareSeries || [], data.districtBars || []);

      // 주변정보는 비동기로 별도 로드
      api.nearbyInfo(getBase(), data.roadAddress || state.roadAddress, data.aptName || state.selectedComplex)
        .then(nearby => NearbyInfo('nearby-filter', nearby, data.aptName || state.selectedComplex))
        .catch(() => {});
    },
  });
}
