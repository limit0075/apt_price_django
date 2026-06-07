export type BaseParams = {
  City: string;
  District: string;
  start_date: string;
  end_date: string;
};

export type AddressCandidate = {
  zipNo: string;
  roadAddress: string;
  jibunAddress: string;
  label: string;
};

export type ComplexItem = {
  label: string;
  name: string;
};

export type AreaItem = {
  label: string;
  value: number;
};

export type TradeItem = {
  dealDate: string | null;
  price: number | null;         // 원
  area: number | null;
  floor: number | string | null;
  buildYear?: number | string | null;
  roadAddress?: string | null;
  [key: string]: unknown;
};

export type PriceSeries = {
  date: string;       // YYYY-MM
  avgPrice: number;   // 원
  volume?: number;    // 거래건수
};

export type CompareSeries = {
  area: number;
  avgPrice: number;   // 원
};

export type DistrictBar = {
  district: string;
  avgPrice: number;   // 원
  isCurrent?: boolean;
};

export type AreaComplexBar = {
  name: string;
  avgPrice: number;   // 원
  isCurrent?: boolean;
};

export type DistrictStats = {
  districtMin: number;  // 원
  districtMax: number;  // 원
  districtAvg: number;  // 원
  aptAvg: number;       // 원
  percentile: number;   // 0-100
};

export type AddressResultsData = {
  ok: boolean;
  items: TradeItem[];
  priceSeries: PriceSeries[];
  compareSeries: CompareSeries[];
  areaComplexBars?: AreaComplexBar[];
  districtBars: DistrictBar[];
  districtCompareSeries?: CompareSeries[];
  aptName: string;
  roadAddress: string;
  households: number | null;
  parking: string | null;
  districtStats: DistrictStats | null;
};

export type FilterListItem = {
  label: string;
  name: string;
  roadAddress: string;
  zipNo: string;
  lat?: number;
  lng?: number;
  세대수?: number | string;
  최저거래가?: number;  // 만원
  거래건수?: number;
  [key: string]: unknown;
};

export type BlogItem = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string;
};

export type NearbyItem = {
  name: string;
  distance: number;   // 미터
  walkMins: number;   // 도보 분
  address?: string;
  lat?: number;
  lng?: number;
};

export type NearbyInfo = {
  coords: { lat: number; lng: number } | null;
  schools: NearbyItem[];
  marts: NearbyItem[];
  hospitals: NearbyItem[];
  subways: NearbyItem[];
  blogs: BlogItem[];
};

export type SubwayPeerItem = {
  name: string;
  subwayDist: number;    // 미터
  pricePerPyeong: number; // 만원/평
  avgPrice: number;      // 원
  isCurrent: boolean;
  lat?: number;
  lng?: number;
};
