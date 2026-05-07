// Mock data for the real-estate analytics platform.
// Replace with Edge Function calls (services.py logic) in a later iteration.

export type SearchMode = "address" | "filter";

export type Trade = {
  date: string;        // YYYY-MM-DD
  price: number;       // 만원
  area: number;        // 전용면적 m²
  floor: number;
  dong?: string;
};

export type Complex = {
  id: string;
  name: string;
  city: string;
  district: string;
  road: string;
  households: number;
  buildYear: number;
  parkingPerHousehold: number;
  lat: number;
  lng: number;
  areas: number[];     // available 전용면적 list
  recentPrice: number; // 만원
  monthlyChange: number; // % vs prev month
  trades: Trade[];
};

export type DistrictBar = {
  district: string;
  avgPrice: number; // 만원
  isCurrent?: boolean;
};

export type DistrictStats = {
  districtMin: number;
  districtMax: number;
  districtAvg: number;
  aptAvg: number;
  percentile: number; // 0-100
};

const SEOUL_DISTRICTS = [
  "강남구", "서초구", "송파구", "강동구", "마포구", "용산구", "성동구",
  "광진구", "중구", "종로구", "영등포구", "동작구", "관악구", "서대문구",
  "은평구", "노원구", "도봉구", "강북구", "성북구", "동대문구",
  "중랑구", "구로구", "금천구", "양천구", "강서구",
];

const seed = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const rand = (s: string, min: number, max: number) =>
  min + (seed(s) % 10000) / 10000 * (max - min);

export const generateTrades = (
  basePriceManwon: number,
  area: number,
  months = 14,
  key = "x",
): Trade[] => {
  const now = new Date();
  const out: Trade[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthsCount = 1 + (seed(`${key}-${i}`) % 4);
    for (let j = 0; j < monthsCount; j++) {
      const noise = (rand(`${key}-${i}-${j}`, -0.08, 0.1));
      const trend = (months - i) * 0.004;
      const price = Math.round(basePriceManwon * (1 + trend + noise));
      const day = 2 + (seed(`${key}-${i}-${j}-d`) % 26);
      out.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        price,
        area,
        floor: 3 + (seed(`${key}-${i}-${j}-f`) % 22),
        dong: `${101 + (seed(`${key}-${j}-dong`) % 8)}동`,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
};

export const MOCK_COMPLEXES: Complex[] = [
  {
    id: "c-1",
    name: "래미안 퍼스티지",
    city: "서울특별시",
    district: "서초구",
    road: "반포대로 275",
    households: 2444,
    buildYear: 2009,
    parkingPerHousehold: 1.6,
    lat: 37.5031,
    lng: 127.0095,
    areas: [59.96, 84.93, 116.92, 135.92, 168.43],
    recentPrice: 385000,
    monthlyChange: 2.4,
    trades: [],
  },
  {
    id: "c-2",
    name: "아크로리버파크",
    city: "서울특별시",
    district: "서초구",
    road: "신반포로 275",
    households: 1612,
    buildYear: 2016,
    parkingPerHousehold: 1.8,
    lat: 37.5108,
    lng: 127.0049,
    areas: [59.98, 84.97, 112.96, 129.92],
    recentPrice: 480000,
    monthlyChange: 3.1,
    trades: [],
  },
  {
    id: "c-3",
    name: "은마아파트",
    city: "서울특별시",
    district: "강남구",
    road: "삼성로 212",
    households: 4424,
    buildYear: 1979,
    parkingPerHousehold: 0.7,
    lat: 37.4998,
    lng: 127.0606,
    areas: [76.79, 84.43],
    recentPrice: 268000,
    monthlyChange: -1.2,
    trades: [],
  },
  {
    id: "c-4",
    name: "잠실엘스",
    city: "서울특별시",
    district: "송파구",
    road: "올림픽로 99",
    households: 5678,
    buildYear: 2008,
    parkingPerHousehold: 1.4,
    lat: 37.5151,
    lng: 127.0826,
    areas: [59.96, 84.88, 119.93, 134.91],
    recentPrice: 235000,
    monthlyChange: 1.8,
    trades: [],
  },
  {
    id: "c-5",
    name: "마포래미안푸르지오",
    city: "서울특별시",
    district: "마포구",
    road: "마포대로 67",
    households: 3885,
    buildYear: 2014,
    parkingPerHousehold: 1.3,
    lat: 37.5466,
    lng: 126.9485,
    areas: [59.92, 84.96, 114.86],
    recentPrice: 168000,
    monthlyChange: 0.9,
    trades: [],
  },
  {
    id: "c-6",
    name: "헬리오시티",
    city: "서울특별시",
    district: "송파구",
    road: "송파대로 345",
    households: 9510,
    buildYear: 2018,
    parkingPerHousehold: 1.5,
    lat: 37.5048,
    lng: 127.1133,
    areas: [59.93, 84.97, 110.86, 130.95],
    recentPrice: 215000,
    monthlyChange: 2.1,
    trades: [],
  },
  {
    id: "c-7",
    name: "반포자이",
    city: "서울특별시",
    district: "서초구",
    road: "신반포로 270",
    households: 3410,
    buildYear: 2008,
    parkingPerHousehold: 1.5,
    lat: 37.5067,
    lng: 127.0064,
    areas: [59.96, 84.94, 116.78, 134.85],
    recentPrice: 312000,
    monthlyChange: 1.5,
    trades: [],
  },
  {
    id: "c-8",
    name: "DMC파크뷰자이",
    city: "서울특별시",
    district: "은평구",
    road: "수색로 100",
    households: 4515,
    buildYear: 2015,
    parkingPerHousehold: 1.2,
    lat: 37.5798,
    lng: 126.8927,
    areas: [59.95, 84.93, 114.84],
    recentPrice: 105000,
    monthlyChange: -0.4,
    trades: [],
  },
  {
    id: "c-9",
    name: "고덕그라시움",
    city: "서울특별시",
    district: "강동구",
    road: "양재대로 1665",
    households: 4932,
    buildYear: 2019,
    parkingPerHousehold: 1.4,
    lat: 37.5544,
    lng: 127.1546,
    areas: [59.96, 84.97, 116.93],
    recentPrice: 158000,
    monthlyChange: 1.2,
    trades: [],
  },
  {
    id: "c-10",
    name: "북한산푸르지오",
    city: "서울특별시",
    district: "성북구",
    road: "정릉로 161",
    households: 1230,
    buildYear: 2012,
    parkingPerHousehold: 1.1,
    lat: 37.6090,
    lng: 127.0150,
    areas: [59.92, 84.88],
    recentPrice: 92000,
    monthlyChange: 0.3,
    trades: [],
  },
];

// hydrate trades
MOCK_COMPLEXES.forEach((c) => {
  c.trades = c.areas.flatMap((a) =>
    generateTrades(c.recentPrice * (a / 84.9), a, 14, c.id + a),
  );
});

export const findComplexById = (id: string) => MOCK_COMPLEXES.find((c) => c.id === id);

export const buildPriceSeries = (trades: Trade[]) => {
  const map = new Map<string, { sum: number; n: number }>();
  trades.forEach((t) => {
    const ym = t.date.slice(0, 7);
    const cur = map.get(ym) ?? { sum: 0, n: 0 };
    cur.sum += t.price;
    cur.n += 1;
    map.set(ym, cur);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, { sum, n }]) => ({ month: ym, avg: Math.round(sum / n) }));
};

export const buildAreaCompare = (trades: Trade[]) => {
  const map = new Map<number, { sum: number; n: number }>();
  trades.forEach((t) => {
    const cur = map.get(t.area) ?? { sum: 0, n: 0 };
    cur.sum += t.price;
    cur.n += 1;
    map.set(t.area, cur);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([area, { sum, n }]) => ({
      area: `${area.toFixed(2)}㎡`,
      avg: Math.round(sum / n),
    }));
};

export const buildDistrictBars = (currentDistrict: string): DistrictBar[] =>
  SEOUL_DISTRICTS.map((d) => ({
    district: d,
    avgPrice: Math.round(60000 + rand(d, 0, 360000)),
    isCurrent: d === currentDistrict,
  })).sort((a, b) => b.avgPrice - a.avgPrice);

export const computeDistrictStats = (
  district: string,
  aptAvg: number,
): DistrictStats => {
  const bars = buildDistrictBars(district).map((b) => b.avgPrice);
  const min = Math.min(...bars);
  const max = Math.max(...bars);
  const avg = Math.round(bars.reduce((a, b) => a + b, 0) / bars.length);
  const ranked = [...bars, aptAvg].sort((a, b) => a - b);
  const idx = ranked.indexOf(aptAvg);
  return {
    districtMin: min,
    districtMax: max,
    districtAvg: avg,
    aptAvg,
    percentile: Math.round((idx / (ranked.length - 1)) * 100),
  };
};

// Address mode helpers
export type AddressCandidate = {
  id: string;
  road: string;
  jibun: string;
  zip: string;
  district: string;
};

export const mockAddressSearch = (q: string): AddressCandidate[] => {
  if (!q.trim()) return [];
  return MOCK_COMPLEXES.slice(0, 8).map((c, i) => ({
    id: `addr-${i}`,
    road: `${c.city} ${c.district} ${c.road}`,
    jibun: `${c.district} ${100 + i}-${seed(c.id) % 30}`,
    zip: `0${6000 + i * 7}`,
    district: c.district,
  }));
};

export const formatManwon = (manwon: number) => {
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok > 0) return `${eok}억`;
  return `${manwon.toLocaleString()}만원`;
};

export const formatManwonShort = (manwon: number) => {
  const eok = manwon / 10000;
  return `${eok.toFixed(1)}억`;
};
