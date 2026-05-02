// static/js/components/NearbyInfo.js
import { AptMap } from './AptMap.js';

export function NearbyInfo(containerId, data, aptName = '') {
  const el = document.getElementById(containerId);
  if (!el) return;

  // 데이터가 없거나 ok가 false면 숨김
  if (!data || !data.ok) {
    el.style.display = 'none';
    return;
  }

  el.style.display = '';

  const facilitysections = [
    { key: 'schools',   icon: '🏫', label: '학교' },
    { key: 'marts',     icon: '🛒', label: '마트' },
    { key: 'hospitals', icon: '🏥', label: '병원' },
    { key: 'subways',   icon: '🚇', label: '지하철' },
  ];

  function renderFacilityItems(items) {
    if (!items || items.length === 0) {
      return '<li class="nearby-list-empty">정보 없음</li>';
    }
    return items.map(item => {
      const dist = item.distance ? `<span class="nearby-dist">${item.distance}m</span>` : '';
      return `<li>${_esc(item.name)}${dist ? ' · ' + dist : ''}</li>`;
    }).join('');
  }

  function renderBlogItems(blogs) {
    if (!blogs || blogs.length === 0) {
      return '<li class="nearby-list-empty">정보 없음</li>';
    }
    return blogs.map(b => {
      const date = b.postdate
        ? b.postdate.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')
        : '';
      return `
        <li class="blog-item">
          <a href="${_esc(b.link)}" target="_blank" rel="noopener noreferrer">${_esc(b.title)}</a>
          <div class="blog-item-meta">${_esc(b.bloggername)}${date ? ' · ' + date : ''}</div>
          ${b.description ? `<div class="blog-item-desc">${_esc(b.description)}</div>` : ''}
        </li>`;
    }).join('');
  }

  const gridHTML = facilitysections.map(({ key, icon, label }) => `
    <div class="nearby-section">
      <div class="nearby-section-title">${icon} ${label}</div>
      <ul class="nearby-list">
        ${renderFacilityItems(data[key])}
      </ul>
    </div>`).join('');

  const mapId = containerId + '-map';
  el.innerHTML = `
    <div class="nearby-wrap card">
      <div class="card-title">주변 시설 및 임장 정보</div>
      ${data.coords ? `<div id="${mapId}" class="apt-map"></div>` : ''}
      <div class="nearby-grid">
        ${gridHTML}
      </div>
      <div class="nearby-blogs">
        <div class="nearby-section-title">📝 임장 블로그</div>
        <ul class="blog-list">
          ${renderBlogItems(data.blogs)}
        </ul>
      </div>
    </div>`;

  if (data.coords) {
    AptMap(mapId, data.coords, aptName);
  }
}

function _esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}