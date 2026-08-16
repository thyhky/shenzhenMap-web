import type {
  EstateDetail,
  EstateFilters,
  HeatmapResponse,
  MapResponse,
  MetaResponse,
  PriceHistoryResponse,
  RankingResponse,
  SchoolFeatureCollection,
  SchoolZoneFeatureCollection,
  StreetFeatureCollection,
} from './types'

export interface MapRequest extends EstateFilters {
  west: number
  south: number
  east: number
  north: number
  zoom: number
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || `请求失败 (${response.status})`)
  }
  return response.json() as Promise<T>
}

function mapParams(request: MapRequest, page: number): URLSearchParams {
  const params = new URLSearchParams({
    west: request.west.toFixed(6),
    south: request.south.toFixed(6),
    east: request.east.toFixed(6),
    north: request.north.toFixed(6),
    zoom: String(Math.round(request.zoom)),
    minPrice: String(Math.round(request.minWan * 10000)),
    maxPrice: String(Math.round(request.maxWan * 10000)),
    page: String(page),
    pageSize: '20',
  })
  if (request.district) params.set('district', request.district)
  if (request.street) params.set('street', request.street)
  if (request.keyword.trim()) params.set('q', request.keyword.trim())
  if (request.pricedOnly) params.set('pricedOnly', '1')
  return params
}

function filterParams(filters: EstateFilters, page: number): URLSearchParams {
  const params = new URLSearchParams({
    q: filters.keyword.trim(),
    minPrice: String(Math.round(filters.minWan * 10000)),
    maxPrice: String(Math.round(filters.maxWan * 10000)),
    page: String(page),
    pageSize: '20',
  })
  if (filters.district) params.set('district', filters.district)
  if (filters.street) params.set('street', filters.street)
  if (filters.pricedOnly) params.set('pricedOnly', '1')
  return params
}

export function getMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return requestJson('/api/meta', signal)
}

export function getMapData(request: MapRequest, signal?: AbortSignal, page = 1): Promise<MapResponse> {
  return requestJson(`/api/estates?${mapParams(request, page)}`, signal)
}

export function searchEstates(filters: EstateFilters, signal?: AbortSignal, page = 1): Promise<MapResponse> {
  return requestJson(`/api/search?${filterParams(filters, page)}`, signal)
}

export function getStreetBoundaries(signal?: AbortSignal): Promise<StreetFeatureCollection> {
  return requestJson('/api/streets', signal)
}

export function getSchools(signal?: AbortSignal): Promise<SchoolFeatureCollection> {
  return requestJson('/api/schools', signal)
}

export function getSchoolZones(signal?: AbortSignal): Promise<SchoolZoneFeatureCollection> {
  return requestJson('/api/layers/school-zones', signal)
}

export function getHeatmap(filters: EstateFilters, signal?: AbortSignal): Promise<HeatmapResponse> {
  const params = new URLSearchParams({
    district: filters.district,
    street: filters.street,
    pricedOnly: filters.pricedOnly ? '1' : '0',
    minPrice: String(Math.round(filters.minWan * 10000)),
    maxPrice: String(Math.round(filters.maxWan * 10000)),
  })
  return requestJson(`/api/heatmap?${params}`, signal)
}

export function getEstate(id: number, signal?: AbortSignal): Promise<EstateDetail> {
  return requestJson(`/api/estates/${id}`, signal)
}

export function getEstatePriceHistory(
  id: number,
  signal?: AbortSignal,
  limit = 100,
): Promise<PriceHistoryResponse> {
  return requestJson(`/api/estates/${id}/price-history?limit=${limit}`, signal)
}

export function getRanking(
  filters: EstateFilters,
  sort: 'price' | 'rentYield',
  signal?: AbortSignal,
  page = 1,
): Promise<RankingResponse> {
  const params = filterParams(filters, page)
  params.set('sort', sort)
  params.set('minSamples', '3')
  return requestJson(`/api/ranking?${params}`, signal)
}

export function getRankingExportUrl(filters: EstateFilters): string {
  const params = filterParams(filters, 1)
  params.set('minSamples', '3')
  params.set('limit', '5000')
  return `/api/export/rent-yield.csv?${params}`
}
