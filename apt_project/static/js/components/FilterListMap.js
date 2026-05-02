// static/js/components/FilterListMap.js
let _mapInstance = null;

export function FilterListMap(containerId, items, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const withCoords = items.filter(it => it.lat && it.lng);
  if (withCoords.length === 0) { el.style.display = 'none'; return; }

  if (_mapInstance) { _mapInstance.remove(); _mapInstance = null; }

  el.style.display = '';
  const map = L.map(containerId, { zoomControl: true });
  _mapInstance = map;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  const bounds = [];

  withCoords.forEach(item => {
    const name = item.label || item.name || item['단지명'] || '';
    const marker = L.marker([item.lat, item.lng]).addTo(map);
    marker.bindPopup(`<b>${name}</b><br><small>${item.roadAddress || ''}</small>`);
    marker.on('click', () => onSelect(name));
    bounds.push([item.lat, item.lng]);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 16);
  } else {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}