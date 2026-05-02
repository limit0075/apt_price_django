// static/js/utils/format.js
export function fmtPrice(won) {
  if (won == null || won === 0) return '-';
  const eok = Math.floor(won / 100_000_000);
  const man = Math.floor((won % 100_000_000) / 10_000);
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만원`;
}

export function fmtDate(s) {
  if (!s) return '-';
  return String(s).slice(0, 10);
}

export function fmtArea(n) {
  if (n == null) return '-';
  return `${Number(n).toFixed(2)}㎡`;
}

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
