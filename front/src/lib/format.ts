/** 원 단위 → "9.5억" */
export function formatWonShort(won: number): string {
  if (!won || isNaN(won)) return "—";
  const eok = won / 100_000_000;
  return `${eok.toFixed(1)}억`;
}

/** 원 단위 → "9억 5000만" */
export function formatWon(won: number): string {
  if (!won || isNaN(won)) return "—";
  const manwon = won / 10_000;
  const eok = Math.floor(manwon / 10_000);
  const rest = Math.round(manwon % 10_000);
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${Math.round(manwon).toLocaleString()}만원`;
}

/** 만원 단위 → "9.5억" (조건 검색 목록용) */
export function formatManwonShort(manwon: number): string {
  if (!manwon || isNaN(manwon)) return "—";
  const eok = manwon / 10_000;
  return `${eok.toFixed(1)}억`;
}

/** 만원 단위 → "9억 5000만" */
export function formatManwon(manwon: number): string {
  if (!manwon || isNaN(manwon)) return "—";
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${manwon.toLocaleString()}만원`;
}
