// static/js/components/ResultTable.js
import { fmtPrice, fmtDate, fmtArea, esc } from '../utils/format.js';

const PAGE_SIZE = 6;

function renderRows(tbody, items, page) {
  const slice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  tbody.innerHTML = slice.map(it => {
    const aptName   = it['단지명'] || it.aptName || '-';
    const dealDate  = fmtDate(it.dealDate);
    const area      = fmtArea(it.area);
    const floor     = it.floor   != null ? `${it.floor}층` : '-';
    const buildYear = it.buildYear || '-';
    const price     = fmtPrice(it.price);
    const roadAddr  = it.roadAddress || '-';
    return `
      <tr>
        <td>${dealDate}</td>
        <td>${esc(aptName)}</td>
        <td>${area}</td>
        <td>${floor}</td>
        <td>${buildYear}</td>
        <td class="price-cell">${price}</td>
        <td class="addr-cell">${esc(roadAddr)}</td>
      </tr>`;
  }).join('');
}

function renderPagination(container, items, currentPage, onPageChange) {
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const pages = [];
  for (let i = 1; i <= totalPages; i++) pages.push(i);

  container.innerHTML = `
    <div class="pagination">
      <button class="pg-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
      ${pages.map(p => `
        <button class="pg-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>
      `).join('')}
      <button class="pg-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>›</button>
    </div>`;

  container.querySelectorAll('.pg-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
}

export function ResultTable(tbodyId, items) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const paginationId = tbodyId + '-pg';
  let pgContainer = document.getElementById(paginationId);
  if (!pgContainer) {
    pgContainer = document.createElement('div');
    pgContainer.id = paginationId;
    tbody.closest('.table-wrap').insertAdjacentElement('afterend', pgContainer);
  }

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">거래 내역이 없습니다.</td></tr>`;
    pgContainer.innerHTML = '';
    return;
  }

  let page = 1;

  function go(p) {
    page = p;
    renderRows(tbody, items, page);
    renderPagination(pgContainer, items, page, go);
  }

  go(1);
}