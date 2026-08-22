import type {
  EstateFilters,
  EstateDetail,
  HistoryDays,
  HeatmapResponse,
  MapResponse,
  MetaResponse,
  PriceHistoryResponse,
  RankingResponse,
  RankingSort,
  SchoolFeatureCollection,
  SchoolZoneFeatureCollection,
  StreetFeatureCollection,
  Viewport,
} from '@/domain/types'

let apiBase = ''
let streetBoundaryCache: StreetFeatureCollection | null = null
let schoolCache: SchoolFeatureCollection | null = null
let schoolZoneCache: SchoolZoneFeatureCollection | null = null

// #ifdef MP-WEIXIN
apiBase = 'https://map.okzer.xyz'
// #endif

function requestJson<T>(path: string, data: Record<string, string | number> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${apiBase}${path}`,
      data,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T)
          return
        }
        const payload = response.data as { error?: string } | null
        reject(new Error(payload?.error || `请求失败 (${response.statusCode})`))
      },
      fail: reject,
    })
  })
}

function baseFilterParams(filters: EstateFilters) {
  return {
    district: filters.district,
    street: filters.street,
    q: filters.keyword.trim(),
    pricedOnly: filters.pricedOnly ? 1 : 0,
    missingRefPrice: filters.missingRefPrice ? 1 : 0,
    minPrice: Math.round(filters.minWan * 10000),
    maxPrice: Math.round(filters.maxWan * 10000),
  }
}

function filterParams(filters: EstateFilters) {
  return { ...baseFilterParams(filters), sort: filters.sort }
}

function queryString(data: Record<string, string | number>) {
  return Object.entries(data)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

export function resolveApiUrl(path: string) {
  return `${apiBase}${path}`
}

let metaCache: MetaResponse | null = null

export async function getMeta(): Promise<MetaResponse> {
  if (metaCache) return metaCache
  const response = await requestJson<MetaResponse>('/api/meta')
  metaCache = response
  return response
}

export function getMapData(viewport: Viewport, filters: EstateFilters, page = 1): Promise<MapResponse> {
  return requestJson('/api/estates', {
    ...viewport,
    ...filterParams(filters),
    page,
    pageSize: 20,
  })
}

export function searchEstates(filters: EstateFilters, page = 1): Promise<MapResponse> {
  return requestJson('/api/search', {
    ...filterParams(filters),
    page,
    pageSize: 20,
  })
}

export function getRanking(filters: EstateFilters, sort: RankingSort, page = 1): Promise<RankingResponse> {
  return requestJson('/api/ranking', {
    ...baseFilterParams(filters),
    sort,
    minSamples: 3,
    page,
    pageSize: 20,
  })
}

export function getHeatmap(filters: EstateFilters): Promise<HeatmapResponse> {
  return requestJson('/api/heatmap', {
    ...baseFilterParams(filters),
  })
}

export function getRankingExportUrl(filters: EstateFilters) {
  const query = queryString({
    ...baseFilterParams(filters),
    minSamples: 3,
    limit: 5000,
  })
  return resolveApiUrl(`/api/export/rent-yield.csv?${query}`)
}

export function getEstate(id: number): Promise<EstateDetail> {
  return requestJson(`/api/estates/${id}`)
}

export function getEstatePriceHistory(id: number, days: HistoryDays): Promise<PriceHistoryResponse> {
  return requestJson(`/api/estates/${id}/price-history`, { days, limit: 100 })
}

export async function getStreetBoundaries(): Promise<StreetFeatureCollection> {
  if (streetBoundaryCache) return streetBoundaryCache
  const response = await requestJson<StreetFeatureCollection>('/api/streets')
  streetBoundaryCache = response
  return response
}

export async function getSchools(): Promise<SchoolFeatureCollection> {
  if (schoolCache) return schoolCache
  const response = await requestJson<SchoolFeatureCollection>('/api/schools')
  schoolCache = response
  return response
}

export async function getSchoolZones(): Promise<SchoolZoneFeatureCollection> {
  if (schoolZoneCache) return schoolZoneCache
  const response = await requestJson<SchoolZoneFeatureCollection>('/api/layers/school-zones')
  schoolZoneCache = response
  return response
}

export function getCachedStreetBoundaries() {
  return streetBoundaryCache
}

export function getCachedSchools() {
  return schoolCache
}

export function getCachedSchoolZones() {
  return schoolZoneCache
}
