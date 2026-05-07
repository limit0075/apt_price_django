import type {
  BaseParams,
  AddressCandidate,
  ComplexItem,
  AreaItem,
  AddressResultsData,
  FilterListItem,
  NearbyInfo,
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
  maxPrice: number,
  minHouseholds: number | null,
  maxHouseholds: number | null,
): Promise<FilterListItem[]> {
  const data = await post<{ ok: boolean; items: FilterListItem[] }>(
    "/filter/list/",
    {
      ...base,
      max_price: maxPrice * 10000,  // 만원 → 원 (parse_price_to_won_scalar expects 원)
      min_households: minHouseholds,
      max_households: maxHouseholds,
    },
  );
  return data.items ?? [];
}

export async function fetchFilterAreas(
  base: BaseParams,
  complexName: string,
  maxPrice: number,
  minHouseholds: number | null,
  maxHouseholds: number | null,
): Promise<{ items: AreaItem[]; roadAddress: string; zipNo: string }> {
  const data = await post<{
    ok: boolean;
    items: AreaItem[];
    roadAddress: string;
    zipNo: string;
  }>("/filter/detail/areas/", {
    ...base,
    selected_complex: complexName,
    max_price: maxPrice * 10000,
    min_households: minHouseholds,
    max_households: maxHouseholds,
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
  maxPrice: number,
  minHouseholds: number | null,
  maxHouseholds: number | null,
): Promise<AddressResultsData> {
  return post<AddressResultsData>("/filter/detail/results/", {
    ...base,
    selected_complex: complexName,
    selected_area: area,
    max_price: maxPrice * 10000,
    min_households: minHouseholds,
    max_households: maxHouseholds,
  });
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
