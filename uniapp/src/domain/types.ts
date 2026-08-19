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
  placeName: string | null
  price: number | null
  hasPrice: boolean
  refPrice: number | null
  rentPrice: number | null
  rentYield: number | null
  rentSamples: number
  lat: number
  lng: number
  sourceObservedAt: string | null
  importedAt: string | null
  recordChangedAt: string | null
  updatedAt: string | null
}

export interface NearbySchool {
  id: string
  name: string
  level: 'primary' | 'junior'
  levelLabel: string
  distanceMeters: number
  lockYears: number | null
  holdYearsAdvised: number | null
  degreePolicyNote: string | null
}

export interface EstateDetail extends EstateSummary {
  scope: 'estates'
  areaName: string | null
  priceSource: string | null
  rentSource: string | null
  rentObservedAt: string | null
  bestSchool: NearbySchool | null
  nearbySchools: NearbySchool[]
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

export type HistoryDays = 7 | 30 | 90

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

export type Position = [number, number]

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: Position[][]
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: Position[][][]
}

export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry

export interface StreetFeature {
  type: 'Feature'
  properties: {
    name: string
    district: string
    estates: number
    priced: number
    avgPrice: number | null
  }
  geometry: AreaGeometry
}

export interface StreetFeatureCollection {
  type: 'FeatureCollection'
  scope: 'streets'
  features: StreetFeature[]
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
    lockYears: number | null
    holdYearsAdvised: number | null
    degreePolicyNote: string | null
    leyoujia: SchoolSupplement | null
  }
  geometry: {
    type: 'Point'
    coordinates: Position
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
  geometry: AreaGeometry
}

export interface SchoolZoneFeatureCollection {
  type: 'FeatureCollection'
  scope: 'school-scopes'
  features: SchoolZoneFeature[]
}

export type MapSelection = MapItem | SchoolFeature | SchoolZoneFeature

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

export interface MapViewport extends Viewport {
  latitude: number
  longitude: number
}

export type MapLayerName = 'boundaries' | 'schools' | 'zones'

export type SheetName = 'filters' | 'results' | 'detail' | ''
