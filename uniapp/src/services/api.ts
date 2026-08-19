import type { EstateFilters, MapResponse, MetaResponse, Viewport } from '@/domain/types'

let apiBase = ''

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

function filterParams(filters: EstateFilters) {
  return {
    district: filters.district,
    street: filters.street,
    q: filters.keyword.trim(),
    pricedOnly: filters.pricedOnly ? 1 : 0,
    missingRefPrice: filters.missingRefPrice ? 1 : 0,
    minPrice: Math.round(filters.minWan * 10000),
    maxPrice: Math.round(filters.maxWan * 10000),
    sort: filters.sort,
  }
}

export function getMeta(): Promise<MetaResponse> {
  return requestJson('/api/meta')
}

export function getMapData(viewport: Viewport, filters: EstateFilters): Promise<MapResponse> {
  return requestJson('/api/estates', {
    ...viewport,
    ...filterParams(filters),
    page: 1,
    pageSize: 20,
  })
}
