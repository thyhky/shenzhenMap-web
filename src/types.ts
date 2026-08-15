export interface EstateFilters {
  district: string
  street: string
  keyword: string
  pricedOnly: boolean
  minWan: number
  maxWan: number
}

export interface StreetOption {
  name: string
  district: string
}

export interface DataScopeMetadata {
  id: string
  label: string
  kind: 'entity' | 'overlay'
  status: 'active' | 'planned' | 'retired'
  source: {
    key: string | null
    name: string
    url: string | null
  } | null
  sourceVersion: string | null
  termsUrl: string | null
  licenseNote: string | null
  contentVersion: string | null
  sourceObservedAt: string | null
  importedAt: string | null
  disclaimer: string | null
}

export interface MetaResponse {
  districts: string[]
  streets: StreetOption[]
  totals: {
    estates: number
    priced: number
  }
  priceRange: {
    min: number
    max: number
  }
  sourceObservedAt: string | null
  importedAt: string | null
  recordChangedAt: string | null
  updatedAt: string | null
  catalog: {
    dataVersion: string | null
    disclaimer: string
    scopes: DataScopeMetadata[]
  }
}

export interface EstateSummary {
  id: number
  name: string
  district: string
  street: string
  placeName: string | null
  price: number | null
  hasPrice: boolean
  refPrice: number | null
  lat: number
  lng: number
  sourceObservedAt: string | null
  importedAt: string | null
  recordChangedAt: string | null
  updatedAt: string | null
}

export interface EstateDetail extends EstateSummary {
  scope: 'estates'
  areaName: string | null
  priceSource: string | null
  nearbySchools: NearbySchool[]
}

export interface NearbySchool {
  id: string
  name: string
  levelLabel: string
  distanceMeters: number
}

export interface PriceHistoryPoint {
  price: number
  source: string
  capturedAt: string
  sourceObservedAt: string | null
}

export interface PriceHistoryResponse {
  estateId: number
  history: PriceHistoryPoint[]
  truncated: boolean
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
  matchBounds: {
    west: number
    south: number
    east: number
    north: number
  } | null
  truncated: boolean
  sourceObservedAt: string | null
  importedAt: string | null
  recordChangedAt: string | null
  updatedAt: string | null
}

export interface HeatmapResponse {
  scope: 'estates-heatmap'
  label: string
  bounds: {
    west: number
    south: number
    east: number
    north: number
  } | null
  total: number
  priced: number
  averagePrice: number | null
  points: Array<{
    lng: number
    lat: number
    price: number | null
  }>
  boundaries: StreetFeatureCollection['features']
}

export interface StreetFeatureCollection {
  type: 'FeatureCollection'
  scope: 'streets'
  features: Array<{
    type: 'Feature'
    properties: {
      name: string
      district: string
    }
    geometry: GeoJSON.Geometry
  }>
}

export interface SchoolSupplement {
  id: number
  name: string | null
  level: string | null
  established: string | null
  admissionScores: string | null
  nearbyEstates: string[]
}

export interface SchoolFeature {
  type: 'Feature'
  properties: {
    id: string
    name: string
    level: 'primary' | 'junior'
    levelLabel: string
    district: string
    groupName: string | null
    address: string
    zoneText: string
    zones: string[]
    phones: string[]
    sourceUrl: string
    sourceYear: number
    sourcePublished: string
    leyoujia: SchoolSupplement | null
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
}

export interface SchoolFeatureCollection {
  type: 'FeatureCollection'
  scope: 'school-scopes'
  features: SchoolFeature[]
}

export interface SchoolZoneFeature {
  type: 'Feature'
  properties: {
    schoolId: string
    name: string
    level: 'primary' | 'junior'
    levelLabel: string
    district: string
    zones: string[]
    method: string
  }
  geometry: GeoJSON.Geometry
}

export interface SchoolZoneFeatureCollection {
  type: 'FeatureCollection'
  scope: 'school-scopes'
  features: SchoolZoneFeature[]
}
