// static/js/pages/AddressMode.js
import * as api              from '../api/client.js';
import { callApi, show, hide, hideAll, setError } from '../hooks/useApi.js';
import { setStep }           from '../components/StepIndicator.js';
import { CandidateList }     from '../components/CandidateList.js';
import { MetricCards }       from '../components/MetricCards.js';
import { DistrictGauge }     from '../components/DistrictGauge.js';
import { ResultTable }       from '../components/ResultTable.js';
import { setupChartToggle }  from '../components/PriceChart.js';
import { NearbyInfo }        from '../components/NearbyInfo.js';

const state = { selectedCand: null, roadAddress: null, zipNo: null, selectedComplex: null };

function getBase() {
  return {
    City:       document.getElementById('city').value.trim(),
    District:   document.getElementById('district').value.trim(),
    start_date: document.getElementById('start-date').value.trim(),
    end_date:   document.getElementById('end-date').value.trim(),
  };
}

export function initAddressMode() {
  document.getElementById('addr-search-btn').addEventListener('click', searchAddr);
  document.getElementById('addr-key-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchAddr(); });
}

// ── Step 1: 주소 검색 ────────────────────────────────────────
async function searchAddr() {
  const addrKey = document.getElementById('addr-key-input').value.trim();
  if (!addrKey) return;
  setStep('a', 1);
  hideAll('addr-cands', 'complex-card-addr', 'area-card-addr', 'results-addr');
  Object.assign(state, { selectedCand: null, roadAddress: null, zipNo: null, selectedComplex: null });

  await callApi({
    loadingId: 'addr-loading', errorId: 'addr-error',
    fn: () => api.addressCandidates(getBase(), addrKey),
    onSuccess(data) {
      if (!data.ok || !data.items?.length) { setError('addr-error', '주소 후보를 찾지 못했습니다.'); return; }
      show('addr-cands');
      CandidateList('addr-cand-list', data.items,
        item => ({
          main: item.label || item.roadAddress || item.jibunAddress,
          sub:  [item.jibunAddress, item.zipNo ? '우편번호 ' + item.zipNo : ''].filter(Boolean).join(' · '),
        }),
        item => selectCandidate(item),
      );
    },
  });
}

// ── Step 2: 주소 선택 → 단지 목록 ────────────────────────────
async function selectCandidate(cand) {
  Object.assign(state, { selectedCand: cand, roadAddress: cand.roadAddress, zipNo: cand.zipNo });
  setStep('a', 2);
  show('complex-card-addr');
  hideAll('area-card-addr', 'results-addr');
  document.getElementById('complex-list-addr').innerHTML = '';

  await callApi({
    loadingId: 'complex-loading-addr', errorId: 'complex-error-addr',
    fn: () => api.addressComplexes(getBase(), cand),
    onSuccess(data) {
      if (!data.ok || !data.items?.length) { setError('complex-error-addr', '해당 주소의 단지를 찾지 못했습니다.'); return; }
      if (data.roadAddress) state.roadAddress = data.roadAddress;
      if (data.zipNo)       state.zipNo       = data.zipNo;
      CandidateList('complex-list-addr', data.items,
        item => ({ main: item.label || item.name }),
        item => selectComplex(item.name || item.label),
      );
    },
  });
}

// ── Step 3: 단지 선택 → 면적 목록 ────────────────────────────
async function selectComplex(name) {
  state.selectedComplex = name;
  setStep('a', 3);
  show('area-card-addr');
  hide('results-addr');
  document.getElementById('area-list-addr').innerHTML = '';

  await callApi({
    loadingId: 'area-loading-addr', errorId: '',
    fn: () => api.addressAreas(getBase(), state.selectedCand, name),
    onSuccess(data) {
      if (!data.ok || !data.items?.length) {
        document.getElementById('area-list-addr').innerHTML = '<div class="empty">면적 정보를 찾지 못했습니다.</div>';
        return;
      }
      CandidateList('area-list-addr', data.items,
        item => ({ main: item.label }),
        item => selectArea(item.value),
      );
    },
  });
}

// ── Step 4: 면적 선택 → 결과 ─────────────────────────────────
async function selectArea(areaVal) {
  setStep('a', 4);
  await callApi({
    loadingId: 'area-loading-addr', errorId: '',
    fn: () => api.addressResults(getBase(), state.selectedCand, state.selectedComplex, areaVal),
    onSuccess(data) {
      if (!data.ok) return;
      show('results-addr');
      MetricCards('metrics-addr', data.items || [], data.aptName || state.selectedComplex, data.roadAddress || state.roadAddress, data.households, data.parking);
      DistrictGauge('district-gauge-addr', data.districtStats || null);
      ResultTable('result-tbody-addr', data.items || []);
      setupChartToggle('chart-toggle-addr', 'price-chart-addr', data.priceSeries || [], data.compareSeries || [], data.districtCompareSeries || [], data.districtBars || []);

      // 주변정보는 비동기로 별도 로드
      api.nearbyInfo(getBase(), data.roadAddress || state.roadAddress, data.aptName || state.selectedComplex)
        .then(nearby => NearbyInfo('nearby-addr', nearby, data.aptName || state.selectedComplex))
        .catch(() => {});
    },
  });
}
