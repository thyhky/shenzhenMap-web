export interface EstateFilters {
  district: string
  street: string
  keyword: string
  pricedOnly: boolean
  missingRefPrice: boolean
  minWan: number
  maxWan: number
  sort: 'price-desc' | 'price-asc' | 'rent-yield'
}

export interface StreetOption {
  name: string
  district: string
  estates: number
  priced: number
  avgPrice: number | null
}

export interface MetaResponse {
  districts: string[]
  streets: StreetOption[]
  totals: { estates: number; priced: number }
  priceRange: { min: number; max: number }
  sourceObservedAt: string | null
  catalog: {
    dataVersion: string | null
    disclaimer: string
  }
}

export interface EstateSummary {
  id: number
  name: string
  district: string
  street: string
  price: number | null
  refPrice: number | null
  rentYield: number | null
  lat: number
  lng: number
}

export interface EstateMapItem extends EstateSummary {
  kind: 'estate'
}

export interface ClusterMapItem {
  kind: 'cluster'
  lat: number
  lng: number
  count: number
  pricedCount: number
  avgPrice: number | null
}

export type MapItem = EstateMapItem | ClusterMapItem

export interface MapResponse {
  scope: 'estates'
  mode: 'clusters' | 'estates'
  items: MapItem[]
  results: EstateSummary[]
  stats: {
    total: number
    priced: number
    averagePrice: number | null
  }
  pagination: {
    page: number
    pageSize: number
    hasMore: boolean
  }
}

export interface Viewport {
  west: number
  south: number
  east: number
  north: number
  zoom: number
}

export type SheetName = 'filters' | 'results' | 'detail' | ''
