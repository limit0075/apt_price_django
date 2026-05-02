// static/js/components/AptMap.js
const _mapInstances = {};

export function AptMap(containerId, coords, aptName) {
  const el = document.getElementById(containerId);
  if (!el || !coords || !coords.lat || !coords.lng) return;

  // 기존 인스턴스 제거
  if (_mapInstances[containerId]) {
    _mapInstances[containerId].remove();
    delete _mapInstances[containerId];
  }

  el.style.display = '';

  const map = L.map(containerId, { zoomControl: true }).setView([coords.lat, coords.lng], 16);
  _mapInstances[containerId] = map;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  const marker = L.marker([coords.lat, coords.lng]).addTo(map);
  if (aptName) {
    marker.bindPopup(`<b>${aptName}</b>`).openPopup();
  }
}