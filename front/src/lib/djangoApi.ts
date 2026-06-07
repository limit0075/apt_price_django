import type {
  BaseParams,
  AddressCandidate,
  ComplexItem,
  AreaItem,
  AddressResultsData,
  FilterListItem,
  NearbyInfo,
  SubwayPeerItem,
} from "./djangoTypes";

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data && data.ok === false) {
    throw new Error(data.error ?? "API 오류");
  }
  return data as T;
}

export async function fetchCandidates(
  base: BaseParams,
  addrKey: string,
): Promise<AddressCandidate[]> {
  const data = await post<{ ok: boolean; items: AddressCandidate[] }>(
    "/address/candidates/",
    { ...base, addr_key: addrKey },
  );
  return data.items ?? [];
}

export async function fetchComplexes(
  base: BaseParams,
  candidate: AddressCandidate,
): Promise<{ items: ComplexItem[]; roadAddress: string; zipNo: string }> {
  const data = await post<{
    ok: boolean;
    items: ComplexItem[];
    roadAddress: string;
    zipNo: string;
  }>("/address/complexes/", {
    ...base,
    selected_address: candidate.roadAddress || candidate.label,
    selected_road_address: candidate.roadAddress,
    selected_jibun_address: candidate.jibunAddress,
    zipNo: candidate.zipNo,
  });
  return {
    items: data.items ?? [],
    roadAddress: data.roadAddress ?? "",
    zipNo: data.zipNo ?? "",
  };
}

export async function fetchAreas(
  base: BaseParams,
  candidate: AddressCandidate,
  complexName: string,
): Promise<AreaItem[]> {
  const data = await post<{ ok: boolean; items: AreaItem[] }>(
    "/address/areas/",
    {
      ...base,
      selected_address: candidate.roadAddress || candidate.label,
      selected_road_address: candidate.roadAddress,
      selected_jibun_address: candidate.jibunAddress,
      zipNo: candidate.zipNo,
      selected_complex: complexName,
    },
  );
  return data.items ?? [];
}

export async function fetchResults(
  base: BaseParams,
  candidate: AddressCandidate,
  complexName: string,
  area: number,
): Promise<AddressResultsData> {
  return post<AddressResultsData>("/address/results/", {
    ...base,
    selected_address: candidate.roadAddress || candidate.label,
    selected_road_address: candidate.roadAddress,
    selected_jibun_address: candidate.jibunAddress,
    zipNo: candidate.zipNo,
    selected_complex: complexName,
    selected_area: area,
  });
}

export async function fetchFilterList(
  base: BaseParams,
  maxPrice: number | null,
  minHouseholds: number | null,
  maxHouseholds: number | null,
  maxPyeongPrice: number | null = null,
): Promise<FilterListItem[]> {
  const data = await post<{ ok: boolean; items: FilterListItem[] }>(
    "/filter/list/",
    {
      ...base,
      max_price: maxPrice !== null ? maxPrice * 10000 : null,
      min_households: minHouseholds,
      max_households: maxHouseholds,
      max_pyeong_price: maxPyeongPrice !== null ? maxPyeongPrice * 10000 : null, // 만원/평 → 원/평
    },
  );
  return data.items ?? [];
}

export async function fetchFilterAreas(
  base: BaseParams,
  complexName: string,
  maxPrice: number | null,
  minHouseholds: number | null,
  maxHouseholds: number | null,
  maxPyeongPrice: number | null = null,
): Promise<{ items: AreaItem[]; roadAddress: string; zipNo: string }> {
  const data = await post<{
    ok: boolean;
    items: AreaItem[];
    roadAddress: string;
    zipNo: string;
  }>("/filter/detail/areas/", {
    ...base,
    selected_complex: complexName,
    max_price: maxPrice !== null ? maxPrice * 10000 : null,
    min_households: minHouseholds,
    max_households: maxHouseholds,
    max_pyeong_price: maxPyeongPrice !== null ? maxPyeongPrice * 10000 : null,
  });
  return {
    items: data.items ?? [],
    roadAddress: data.roadAddress ?? "",
    zipNo: data.zipNo ?? "",
  };
}

export async function fetchFilterResults(
  base: BaseParams,
  complexName: string,
  area: number,
  maxPrice: number | null,
  minHouseholds: number | null,
  maxHouseholds: number | null,
  maxPyeongPrice: number | null = null,
): Promise<AddressResultsData> {
  return post<AddressResultsData>("/filter/detail/results/", {
    ...base,
    selected_complex: complexName,
    selected_area: area,
    max_price: maxPrice !== null ? maxPrice * 10000 : null,
    min_households: minHouseholds,
    max_households: maxHouseholds,
    max_pyeong_price: maxPyeongPrice !== null ? maxPyeongPrice * 10000 : null,
  });
}

export async function fetchSubwayPeer(
  base: BaseParams,
  complexName: string,
  area: number,
  roadAddress: string,
  subwayLat: number,
  subwayLng: number,
): Promise<SubwayPeerItem[]> {
  const data = await post<{ ok: boolean; items: SubwayPeerItem[] }>("/subway_peer/", {
    ...base,
    selected_complex: complexName,
    selected_area: area,
    road_address: roadAddress,
    subway_lat: subwayLat,
    subway_lng: subwayLng,
  });
  return data.items ?? [];
}

export async function fetchNearbyInfo(
  roadAddress: string,
  aptName: string,
  district: string,
): Promise<NearbyInfo> {
  const data = await post<{ ok: boolean } & NearbyInfo>("/nearby/", {
    roadAddress,
    aptName,
    District: district,
  });
  return {
    coords: data.coords ?? null,
    schools: data.schools ?? [],
    marts: data.marts ?? [],
    hospitals: data.hospitals ?? [],
    subways: data.subways ?? [],
    blogs: data.blogs ?? [],
  };
}
