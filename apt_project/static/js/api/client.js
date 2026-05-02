// static/js/api/client.js
// Django 뷰(/api/...)와 통신하는 클라이언트.
// 장고는 같은 오리진이므로 BASE_URL 설정 불필요.

export async function request(path, body = null) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };

  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const health = () => request('/api/health/');

// 주소 모드
export const addressCandidates = (base, addrKey, topN = 10) =>
  request('/api/address/candidates/', { ...base, addr_key: addrKey, top_n_addr: topN });

export const addressComplexes = (base, selected) =>
  request('/api/address/complexes/', {
    ...base,
    selected_address:       selected.label || selected.roadAddress,
    selected_road_address:  selected.roadAddress,
    selected_jibun_address: selected.jibunAddress,
    zipNo:                  selected.zipNo,
  });

export const addressAreas = (base, selected, complexName) =>
  request('/api/address/areas/', {
    ...base,
    selected_address:       selected.label || selected.roadAddress,
    selected_road_address:  selected.roadAddress,
    selected_jibun_address: selected.jibunAddress,
    zipNo:                  selected.zipNo,
    selected_complex:       complexName,
  });

export const addressResults = (base, selected, complexName, area) =>
  request('/api/address/results/', {
    ...base,
    selected_address:       selected.label || selected.roadAddress,
    selected_road_address:  selected.roadAddress,
    selected_jibun_address: selected.jibunAddress,
    zipNo:                  selected.zipNo,
    selected_complex:       complexName,
    selected_area:          area,
  });

// 조건 모드
export const filterList = (base, maxPrice, minHH, maxHH) =>
  request('/api/filter/list/', { ...base, max_price: maxPrice, min_households: minHH ?? null, max_households: maxHH ?? null });

export const filterDetailAreas = (base, complexName, maxPrice, minHH, maxHH) =>
  request('/api/filter/detail/areas/', { ...base, selected_complex: complexName, max_price: maxPrice, min_households: minHH ?? null, max_households: maxHH ?? null });

export const filterDetailResults = (base, complexName, area, maxPrice, minHH, maxHH) =>
  request('/api/filter/detail/results/', { ...base, selected_complex: complexName, selected_area: area, max_price: maxPrice, min_households: minHH ?? null, max_households: maxHH ?? null });

// 주변 시설 / 임장 블로그
export const nearbyInfo = (base, roadAddress, aptName) =>
  request('/api/nearby/', { ...base, roadAddress, aptName });
