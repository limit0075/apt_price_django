// static/js/main.js
import { StepIndicator } from './components/StepIndicator.js';
import { initAddressMode } from './pages/AddressMode.js';
import { initFilterMode }  from './pages/FilterMode.js';

document.addEventListener('DOMContentLoaded', () => {
  StepIndicator('steps-addr',   'a', ['주소 검색', '단지 선택', '면적 선택', '결과']);
  StepIndicator('steps-filter', 'f', ['조건 설정', '단지 선택', '면적 선택', '결과']);

  initAddressMode();
  initFilterMode();

  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      document.getElementById('addr-mode').classList.toggle('hidden', mode !== 'address');
      document.getElementById('filter-mode').classList.toggle('hidden', mode !== 'filter');
    });
  });
});
