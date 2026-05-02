// static/js/hooks/useApi.js
export async function callApi({ loadingId, errorId, fn, onSuccess, onError }) {
  show(loadingId);
  hide(errorId);
  try {
    const data = await fn();
    hide(loadingId);
    if (onSuccess) onSuccess(data);
  } catch (err) {
    hide(loadingId);
    if (onError) onError(err);
    else setError(errorId, err.message || '알 수 없는 오류가 발생했습니다.');
  }
}

export function show(id)          { document.getElementById(id)?.classList.remove('hidden'); }
export function hide(id)          { document.getElementById(id)?.classList.add('hidden'); }
export function hideAll(...ids)   { ids.forEach(hide); }
export function setError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
export function clearEl(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
}
