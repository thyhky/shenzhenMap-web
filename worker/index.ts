interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

interface EstateFilters {
  district: string
  street: string
  keyword: string
  pricedOnly: boolean
  missingRefPrice: boolean
  minPrice: number
  maxPrice: number
}

interface QueryFilters extends EstateFilters, Bounds {
  zoom: number
}

interface EstateRow {
  id: number
  name: string
  district: string
  street: string
  area_name: string | null
  place_name: string | null
  price: number | null
  has_price: number
  ref_price: number | null
  price_source: string | null
  rent_price: number | null
  rent_yield: number | null
  rent_samples: number | null
  rent_source: string | null
  rent_observed_at: string | null
  lng: number
  lat: number
  updated_at: string | null
  source_observed_at: string | null
  imported_at: string | null
  record_changed_at: string | null
}

interface SchoolRow {
  id: string
  name: string
  level: 'primary' | 'junior'
  level_label: string
  district: string
  group_name: string | null
  address: string
  zone_text: string
  zones: string
  phones: string
  lng: number
  lat: number
  source_url: string
  source_year: number
  source_published: string
  lyj_school_id: number | null
  lyj_name: string | null
  lyj_level: string | null
  lyj_established: string | null
  lyj_admission_scores: string | null
  lyj_nearby_xq: string | null
  lock_years: number | null
  hold_years_advised: number | null
  degree_policy_note: string | null
}

interface SchoolZoneRow {
  school_id: string
  name: string
  level: 'primary' | 'junior'
  level_label: string
  district: string
  zones: string
  geometry: string
  method: string
}

interface ClusterRow {
  cell_x: number
  cell_y: number
  lat: number
  lng: number
  count: number
  priced_count: number
  avg_price: number | null
}

interface HeatmapPointRow {
  lat: number
  lng: number
  price: number | null
}

interface PriceHistoryRow {
  id: number
  price: number
  source: string
  captured_at: string
  source_observed_at: string | null
}

interface DataScopeRow {
  id: string
  label: string
  kind: 'entity' | 'overlay'
  status: 'active' | 'planned' | 'retired'
  source_key: string | null
  source_name: string | null
  source_url: string | null
  source_version: string | null
  terms_url: string | null
  license_note: string | null
  content_version: string | null
  source_observed_at: string | null
  imported_at: string | null
  disclaimer: string | null
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

const API_CACHE_CONTROL = 'public, max-age=0, s-maxage=300'
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const CACHE_SCHEMA_VERSION = '8'
const VERSION_CACHE_KEY = `https://worker-cache.invalid/${CACHE_SCHEMA_VERSION}/data-version`
const RATE_LIMIT_WINDOW_SECONDS = 10
const RATE_LIMITS: Record<string, number> = { map: 60, search: 30, heatmap: 10, export: 10 }

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: { ...JSON_HEADERS, ...init.headers },
  })
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

function isDirectApiNavigation(request: Request): boolean {
  if (request.method !== 'GET') return false
  const mode = request.headers.get('Sec-Fetch-Mode')
  const destination = request.headers.get('Sec-Fetch-Dest')
  const accept = request.headers.get('Accept') || ''
  return mode === 'navigate' || destination === 'document' || accept.includes('text/html')
}

function finiteParam(params: URLSearchParams, name: string, fallback?: number): number {
  const raw = params.get(name)
  if (raw === null || raw.trim() === '') {
    if (fallback !== undefined) return fallback
    throw new HttpError(400, `缺少参数 ${name}`)
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new HttpError(400, `参数 ${name} 无效`)
  return value
}

function integerParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = finiteParam(params, name, fallback)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, `参数 ${name} 无效`)
  }
  return value
}

function parsePagination(params: URLSearchParams) {
  return {
    page: integerParam(params, 'page', 1, 1, 1000),
    pageSize: integerParam(params, 'pageSize', 20, 1, 50),
  }
}

function parseBounds(params: URLSearchParams): Bounds {
  const bounds = {
    west: finiteParam(params, 'west'),
    south: finiteParam(params, 'south'),
    east: finiteParam(params, 'east'),
    north: finiteParam(params, 'north'),
  }
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new HttpError(400, '地图范围无效')
  }
  if (bounds.west < -180 || bounds.east > 180 || bounds.south < -90 || bounds.north > 90) {
    throw new HttpError(400, '地图坐标超出有效范围')
  }
  if (bounds.east - bounds.west > 2 || bounds.north - bounds.south > 1.5) {
    throw new HttpError(400, '地图范围过大')
  }
  if (bounds.west < 113.2 || bounds.south < 21.8 || bounds.east > 115.2 || bounds.north > 23.5) {
    throw new HttpError(400, '地图范围超出服务区域')
  }
  return bounds
}

function parseKeyword(params: URLSearchParams): string {
  const keyword = (params.get('q') || '').trim().slice(0, 40)
  const escapedPattern = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`
  if (new TextEncoder().encode(escapedPattern).length > 50) throw new HttpError(400, '搜索关键词过长')
  return keyword
}

const SORT_CLAUSES: Record<string, string> = {
  'price-desc': 'has_price DESC, price DESC, id ASC',
  'price-asc': 'has_price DESC, price ASC, id ASC',
  'rent-yield': 'has_price DESC, rent_yield DESC, id ASC',
}

function parseSort(params: URLSearchParams): string {
  const sort = params.get('sort') || ''
  return SORT_CLAUSES[sort] ? sort : 'price-desc'
}

function parseEstateFilters(params: URLSearchParams): EstateFilters {
  const minPrice = Math.max(0, finiteParam(params, 'minPrice', 0))
  const maxPrice = Math.min(1_000_000, finiteParam(params, 'maxPrice', 1_000_000))
  if (minPrice > maxPrice) throw new HttpError(400, '价格范围无效')
  return {
    district: (params.get('district') || '').slice(0, 30),
    street: (params.get('street') || '').slice(0, 30),
    keyword: parseKeyword(params),
    pricedOnly: params.get('pricedOnly') === '1',
    missingRefPrice: params.get('missingRefPrice') === '1',
    minPrice,
    maxPrice,
  }
}

function parseFilters(params: URLSearchParams): QueryFilters {
  const zoom = Math.max(6, Math.min(18, finiteParam(params, 'zoom', 10)))
  const bounds = parseBounds(params)
  const gridSize = zoom <= 9 ? 0.05 : zoom <= 11 ? 0.02 : zoom <= 13 ? 0.01 : 0.005
  const snapped = {
    west: Math.floor(bounds.west / gridSize) * gridSize,
    south: Math.floor(bounds.south / gridSize) * gridSize,
    east: Math.ceil(bounds.east / gridSize) * gridSize,
    north: Math.ceil(bounds.north / gridSize) * gridSize,
  }
  return {
    ...parseEstateFilters(params),
    ...snapped,
    zoom,
  }
}

function buildWhere(filters: EstateFilters, bounds?: Bounds): { sql: string; values: unknown[] } {
  const conditions: string[] = ['is_listed = 1']
  const values: unknown[] = []
  if (bounds) {
    conditions.push('lng BETWEEN ? AND ?', 'lat BETWEEN ? AND ?')
    values.push(bounds.west, bounds.east, bounds.south, bounds.north)
  }
  if (filters.district) {
    conditions.push('district = ?')
    values.push(filters.district)
  }
  if (filters.street) {
    conditions.push('street = ?')
    values.push(filters.street)
  }
  if (filters.keyword) {
    conditions.push("name LIKE ? ESCAPE '\\'")
    values.push(`%${filters.keyword.replace(/[\\%_]/g, '\\$&')}%`)
  }
  if (filters.pricedOnly) conditions.push('has_price = 1')
  if (filters.missingRefPrice) conditions.push('ref_price IS NULL')
  conditions.push('((has_price = 0 AND ? = 0) OR (has_price = 1 AND price BETWEEN ? AND ?))')
  values.push(filters.pricedOnly ? 1 : 0)
  values.push(filters.minPrice, filters.maxPrice)
  return { sql: conditions.join(' AND '), values }
}

function buildEstateWhere(filters: EstateFilters, alias: string, bounds?: Bounds): { sql: string; values: unknown[] } {
  const prefix = alias ? `${alias}.` : ''
  const conditions: string[] = [`${prefix}is_listed = 1`]
  const values: unknown[] = []
  if (bounds) {
    conditions.push(`${prefix}lng BETWEEN ? AND ?`, `${prefix}lat BETWEEN ? AND ?`)
    values.push(bounds.west, bounds.east, bounds.south, bounds.north)
  }
  if (filters.district) {
    conditions.push(`${prefix}district = ?`)
    values.push(filters.district)
  }
  if (filters.street) {
    conditions.push(`${prefix}street = ?`)
    values.push(filters.street)
  }
  if (filters.keyword) {
    conditions.push(`${prefix}name LIKE ? ESCAPE '\\'`)
    values.push(`%${filters.keyword.replace(/[\\%_]/g, '\\$&')}%`)
  }
  if (filters.pricedOnly) conditions.push(`${prefix}has_price = 1`)
  if (filters.missingRefPrice) conditions.push(`${prefix}ref_price IS NULL`)
  conditions.push(`((${prefix}has_price = 0 AND ? = 0) OR (${prefix}has_price = 1 AND ${prefix}price BETWEEN ? AND ?))`)
  values.push(filters.pricedOnly ? 1 : 0)
  values.push(filters.minPrice, filters.maxPrice)
  return { sql: conditions.join(' AND '), values }
}

function estateSummary(row: EstateRow) {
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    street: row.street,
    placeName: row.place_name,
    price: row.price,
    hasPrice: Boolean(row.has_price),
    refPrice: row.ref_price ?? null,
    rentPrice: row.rent_price ?? null,
    rentYield: row.rent_yield ?? null,
    rentSamples: row.rent_samples ?? 0,
    lng: row.lng,
    lat: row.lat,
    sourceObservedAt: row.source_observed_at,
    importedAt: row.imported_at,
    recordChangedAt: row.record_changed_at,
    updatedAt: row.record_changed_at ?? row.updated_at,
  }
}

function stringList(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}

function schoolFeature(row: SchoolRow) {
  return {
    type: 'Feature' as const,
    properties: {
      id: row.id,
      name: row.name,
      level: row.level,
      levelLabel: row.level_label,
      district: row.district,
      groupName: row.group_name,
      address: row.address,
      zoneText: row.zone_text,
      zones: stringList(row.zones),
      phones: stringList(row.phones),
      sourceUrl: row.source_url,
      sourceYear: row.source_year,
      sourcePublished: row.source_published,
      lockYears: row.lock_years,
      holdYearsAdvised: row.hold_years_advised,
      degreePolicyNote: row.degree_policy_note,
      leyoujia: row.lyj_school_id ? {
        id: row.lyj_school_id,
        name: row.lyj_name,
        level: row.lyj_level,
        established: row.lyj_established,
        admissionScores: row.lyj_admission_scores,
        nearbyEstates: stringList(row.lyj_nearby_xq),
      } : null,
    },
    geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] },
  }
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = Math.PI / 180
  const latDistance = (lat2 - lat1) * toRadians
  const lngDistance = (lng2 - lng1) * toRadians
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(lat1 * toRadians) * Math.cos(lat2 * toRadians) * Math.sin(lngDistance / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function handleMeta(env: Env): Promise<Response> {
  const [districts, streets, totals, range, update, scopes, metadata] = await env.DB.batch([
    env.DB.prepare('SELECT DISTINCT district FROM estates WHERE is_listed = 1 AND district <> ? ORDER BY district').bind(''),
    env.DB.prepare(`SELECT street AS name, district,
      COUNT(*) AS estates, SUM(has_price) AS priced,
      ROUND(AVG(price)) AS avg_price
      FROM estates WHERE is_listed = 1 AND street <> ''
      GROUP BY street, district ORDER BY district, street`),
    env.DB.prepare('SELECT COUNT(*) AS estates, SUM(has_price) AS priced FROM estates WHERE is_listed = 1'),
    env.DB.prepare('SELECT MIN(price) AS min, MAX(price) AS max FROM estates WHERE is_listed = 1 AND has_price = 1'),
    env.DB.prepare(`SELECT MAX(source_observed_at) AS source_observed_at,
      MAX(imported_at) AS imported_at, MAX(record_changed_at) AS record_changed_at
      FROM estates WHERE is_listed = 1`),
    env.DB.prepare(`SELECT id, label, kind, status, source_key, source_name, source_url,
      source_version, terms_url, license_note, content_version, source_observed_at,
      imported_at, disclaimer FROM data_scopes ORDER BY kind, id`),
    env.DB.prepare(`SELECT key, value FROM app_metadata
      WHERE key IN ('data_version', 'global_disclaimer')`),
  ])
  const totalsRow = totals.results[0] as { estates?: number; priced?: number } | undefined
  const rangeRow = range.results[0] as { min?: number; max?: number } | undefined
  const updateRow = update.results[0] as {
    source_observed_at?: string
    imported_at?: string
    record_changed_at?: string
  } | undefined
  const districtRows = districts.results as { district: string }[]
  const streetRows = streets.results as { name: string; district: string; estates?: number; priced?: number; avg_price?: number }[]
  const scopeRows = scopes.results as unknown as DataScopeRow[]
  const metadataRows = Object.fromEntries(
    (metadata.results as { key: string; value: string }[]).map((row) => [row.key, row.value]),
  )
  return json({
    districts: districtRows.map((row) => row.district),
    streets: streetRows.map((row) => ({
      name: row.name,
      district: row.district,
      estates: row.estates ?? 0,
      priced: row.priced ?? 0,
      avgPrice: row.avg_price ?? null,
    })),
    totals: { estates: totalsRow?.estates ?? 0, priced: totalsRow?.priced ?? 0 },
    priceRange: { min: rangeRow?.min ?? 0, max: rangeRow?.max ?? 0 },
    sourceObservedAt: updateRow?.source_observed_at ?? null,
    importedAt: updateRow?.imported_at ?? null,
    recordChangedAt: updateRow?.record_changed_at ?? null,
    updatedAt: updateRow?.record_changed_at ?? null,
    catalog: {
      dataVersion: metadataRows.data_version ?? null,
      disclaimer: metadataRows.global_disclaimer ?? '',
      scopes: scopeRows.map((row) => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
        status: row.status,
        source: row.source_name ? {
          key: row.source_key,
          name: row.source_name,
          url: row.source_url,
        } : null,
        sourceVersion: row.source_version,
        termsUrl: row.terms_url,
        licenseNote: row.license_note,
        contentVersion: row.content_version,
        sourceObservedAt: row.source_observed_at,
        importedAt: row.imported_at,
        disclaimer: row.disclaimer,
      })),
    },
  }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600' } })
}

async function handleEstates(url: URL, env: Env): Promise<Response> {
  const filters = parseFilters(url.searchParams)
  const sort = parseSort(url.searchParams)
  const pagination = parsePagination(url.searchParams)
  const offset = (pagination.page - 1) * pagination.pageSize
  const where = buildWhere(filters, filters)
  const broadViewport = filters.east - filters.west > 0.45 || filters.north - filters.south > 0.35
  const shouldCluster = (filters.zoom < 13 || broadViewport) && !filters.keyword
  const cellSize = filters.zoom <= 9 ? 0.035 : filters.zoom <= 11 ? 0.015 : 0.006
  const orderBy = SORT_CLAUSES[sort]

  const statsStatement = env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(has_price) AS priced,
      AVG(CASE WHEN has_price = 1 THEN price END) AS average_price,
      MIN(lng) AS west, MIN(lat) AS south, MAX(lng) AS east, MAX(lat) AS north,
      MAX(source_observed_at) AS source_observed_at,
      MAX(imported_at) AS imported_at, MAX(record_changed_at) AS record_changed_at
     FROM estates WHERE ${where.sql}`,
  ).bind(...where.values)

  const resultsStatement = env.DB.prepare(
    `SELECT id, name, district, street, place_name, price, has_price, ref_price,
      rent_price, rent_yield, rent_samples, lng, lat, updated_at,
      source_observed_at, imported_at, record_changed_at
     FROM estates WHERE ${where.sql}
     ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
  ).bind(...where.values, pagination.pageSize, offset)

  const mapStatement = shouldCluster
    ? env.DB.prepare(
      `SELECT CAST((lng - ?) / ? AS INTEGER) AS cell_x,
        CAST((lat - ?) / ? AS INTEGER) AS cell_y,
        AVG(lat) AS lat, AVG(lng) AS lng, COUNT(*) AS count,
        SUM(has_price) AS priced_count,
        AVG(CASE WHEN has_price = 1 THEN price END) AS avg_price
       FROM estates WHERE ${where.sql}
       GROUP BY cell_x, cell_y LIMIT 601`,
    ).bind(filters.west, cellSize, filters.south, cellSize, ...where.values)
    : env.DB.prepare(
      `SELECT id, name, district, street, place_name, price, has_price, ref_price,
        rent_price, rent_yield, rent_samples, lng, lat, updated_at,
        source_observed_at, imported_at, record_changed_at
       FROM estates WHERE ${where.sql}
       ORDER BY ${orderBy} LIMIT 1001`,
    ).bind(...where.values)

  const [statsResult, resultsResult, mapResult] = await env.DB.batch([
    statsStatement,
    resultsStatement,
    mapStatement,
  ])
  const stats = statsResult.results[0] as {
    total?: number
    priced?: number
    average_price?: number
    updated_at?: string
    west?: number
    south?: number
    east?: number
    north?: number
    source_observed_at?: string
    imported_at?: string
    record_changed_at?: string
  } | undefined
  const estateResults = (resultsResult.results as unknown as EstateRow[]).map(estateSummary)

  const items = shouldCluster
    ? (mapResult.results as unknown as ClusterRow[]).slice(0, 600).map((row) => ({
      kind: 'cluster' as const,
      lat: row.lat,
      lng: row.lng,
      count: row.count,
      pricedCount: row.priced_count,
      avgPrice: row.avg_price,
    }))
    : (mapResult.results as unknown as EstateRow[]).slice(0, 1000).map((row) => ({
      kind: 'estate' as const,
      ...estateSummary(row),
    }))

  return json({
    scope: 'estates',
    mode: shouldCluster ? 'clusters' : 'estates',
    items,
    results: estateResults,
    stats: {
      total: stats?.total ?? 0,
      priced: stats?.priced ?? 0,
      averagePrice: stats?.average_price ?? null,
    },
    pagination: {
      ...pagination,
      hasMore: pagination.page * pagination.pageSize < (stats?.total ?? 0),
    },
    matchBounds: stats?.west == null ? null : {
      west: stats.west,
      south: stats.south,
      east: stats.east,
      north: stats.north,
    },
    truncated: mapResult.results.length > (shouldCluster ? 600 : 1000),
    sourceObservedAt: stats?.source_observed_at ?? null,
    importedAt: stats?.imported_at ?? null,
    recordChangedAt: stats?.record_changed_at ?? null,
    updatedAt: stats?.record_changed_at ?? null,
  }, { headers: { 'Cache-Control': API_CACHE_CONTROL } })
}

async function handleSearch(url: URL, env: Env): Promise<Response> {
  const filters = parseEstateFilters(url.searchParams)
  const sort = parseSort(url.searchParams)
  const pagination = parsePagination(url.searchParams)
  const offset = (pagination.page - 1) * pagination.pageSize
  if (!filters.keyword) throw new HttpError(400, '请输入搜索关键词')
  const where = buildWhere(filters)
  const orderBy = SORT_CLAUSES[sort]
  const [statsResult, resultsResult, mapResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(has_price) AS priced,
        AVG(CASE WHEN has_price = 1 THEN price END) AS average_price,
        MIN(lng) AS west, MIN(lat) AS south, MAX(lng) AS east, MAX(lat) AS north,
        MAX(source_observed_at) AS source_observed_at,
        MAX(imported_at) AS imported_at, MAX(record_changed_at) AS record_changed_at
       FROM estates WHERE ${where.sql}`,
    ).bind(...where.values),
    env.DB.prepare(
       `SELECT id, name, district, street, place_name, price, has_price, ref_price,
         rent_price, rent_yield, rent_samples, lng, lat, updated_at,
        source_observed_at, imported_at, record_changed_at
       FROM estates WHERE ${where.sql}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ).bind(...where.values, pagination.pageSize, offset),
    env.DB.prepare(
       `SELECT id, name, district, street, place_name, price, has_price, ref_price,
         rent_price, rent_yield, rent_samples, lng, lat, updated_at,
        source_observed_at, imported_at, record_changed_at
       FROM estates WHERE ${where.sql}
       ORDER BY ${orderBy} LIMIT 201`,
    ).bind(...where.values),
  ])
  const stats = statsResult.results[0] as {
    total?: number
    priced?: number
    average_price?: number
    updated_at?: string
    west?: number
    south?: number
    east?: number
    north?: number
    source_observed_at?: string
    imported_at?: string
    record_changed_at?: string
  } | undefined
  const mapRows = mapResult.results as unknown as EstateRow[]
  return json({
    scope: 'estates',
    mode: 'estates',
    items: mapRows.slice(0, 200).map((row) => ({ kind: 'estate' as const, ...estateSummary(row) })),
    results: (resultsResult.results as unknown as EstateRow[]).map(estateSummary),
    stats: {
      total: stats?.total ?? 0,
      priced: stats?.priced ?? 0,
      averagePrice: stats?.average_price ?? null,
    },
    pagination: {
      ...pagination,
      hasMore: pagination.page * pagination.pageSize < (stats?.total ?? 0),
    },
    matchBounds: stats?.west == null ? null : {
      west: stats.west,
      south: stats.south,
      east: stats.east,
      north: stats.north,
    },
    truncated: mapRows.length > 200,
    sourceObservedAt: stats?.source_observed_at ?? null,
    importedAt: stats?.imported_at ?? null,
    recordChangedAt: stats?.record_changed_at ?? null,
    updatedAt: stats?.record_changed_at ?? null,
  }, { headers: { 'Cache-Control': API_CACHE_CONTROL } })
}

async function handleHeatmap(url: URL, env: Env): Promise<Response> {
  const filters = parseEstateFilters(url.searchParams)
  if (!filters.district) throw new HttpError(400, '导出热力图前请选择行政区')
  const where = buildWhere(filters)
  const [statsResult, cellsResult, boundariesResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(has_price) AS priced,
        AVG(CASE WHEN has_price = 1 THEN price END) AS average_price,
        MIN(lng) AS west, MIN(lat) AS south, MAX(lng) AS east, MAX(lat) AS north
       FROM estates WHERE ${where.sql}`,
    ).bind(...where.values),
    env.DB.prepare(
      `SELECT lng, lat, price FROM estates WHERE ${where.sql}
       ORDER BY id LIMIT 10000`,
    ).bind(...where.values),
    env.DB.prepare(
      `SELECT name, district, geometry FROM streets
       WHERE is_current = 1 AND district = ? AND (? = '' OR name = ?)
       ORDER BY name`,
    ).bind(filters.district, filters.street, filters.street),
  ])
  const stats = statsResult.results[0] as {
    total?: number
    priced?: number
    average_price?: number
    west?: number
    south?: number
    east?: number
    north?: number
  } | undefined
  const points = (cellsResult.results as unknown as HeatmapPointRow[]).map((row) => ({
    lng: row.lng,
    lat: row.lat,
    price: row.price,
  }))
  const boundaries = (boundariesResult.results as { name: string; district: string; geometry: string }[]).flatMap((row) => {
    try {
      return [{
        type: 'Feature' as const,
        properties: { name: row.name, district: row.district },
        geometry: JSON.parse(row.geometry),
      }]
    } catch {
      return []
    }
  })
  return json({
    scope: 'estates-heatmap',
    label: filters.street ? `${filters.district} · ${filters.street}` : filters.district,
    bounds: stats?.west == null ? null : {
      west: stats.west,
      south: stats.south,
      east: stats.east,
      north: stats.north,
    },
    total: stats?.total ?? 0,
    priced: stats?.priced ?? 0,
    averagePrice: stats?.average_price ?? null,
    points,
    boundaries,
  }, { headers: { 'Cache-Control': API_CACHE_CONTROL } })
}

async function handleEstateDetail(id: number, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, name, district, street, area_name, place_name, price, has_price,
      ref_price, price_source, rent_price, rent_yield, rent_samples, rent_source, rent_observed_at,
      lng, lat, updated_at, source_observed_at, imported_at, record_changed_at
      FROM estates WHERE id = ? AND is_listed = 1`,
  ).bind(id).first<EstateRow>()
  if (!row) throw new HttpError(404, '未找到该小区')
  const nearbySchools = (await env.DB.prepare(`SELECT id, name, level, level_label, district, group_name, address, zone_text,
      zones, phones, lng, lat, source_url, source_year, source_published, lyj_school_id, lyj_name,
      lyj_level, lyj_established, lyj_admission_scores, lyj_nearby_xq,
      lock_years, hold_years_advised, degree_policy_note
      FROM schools WHERE is_current = 1 AND district = ?`).bind(row.district).all<SchoolRow>()).results
    .map((school) => ({
      id: school.id,
      name: school.name,
      level: school.level,
      levelLabel: school.level_label,
      distanceMeters: Math.round(distanceMeters(row.lat, row.lng, school.lat, school.lng)),
      lockYears: school.lock_years,
      holdYearsAdvised: school.hold_years_advised,
      degreePolicyNote: school.degree_policy_note,
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 3)
  const bestSchool = nearbySchools[0] ?? null
  return json({
    scope: 'estates',
    ...estateSummary(row),
    areaName: row.area_name,
    priceSource: row.price_source,
    rentSource: row.rent_source,
    rentObservedAt: row.rent_observed_at,
    bestSchool,
    nearbySchools,
  }, { headers: { 'Cache-Control': API_CACHE_CONTROL } })
}

async function handleRanking(url: URL, env: Env): Promise<Response> {
  const filters = parseEstateFilters(url.searchParams)
  const pagination = parsePagination(url.searchParams)
  const sort = url.searchParams.get('sort') === 'price' ? 'price' : 'rentYield'
  const minSamples = integerParam(url.searchParams, 'minSamples', 3, 0, 60)
  const offset = (pagination.page - 1) * pagination.pageSize
  const where = buildWhere(filters)
  const rankingFilterSql = sort === 'price'
    ? 'has_price = 1'
    : 'rent_yield IS NOT NULL AND rent_samples >= ?'
  const rankingFilterValues = sort === 'price' ? [] : [minSamples]
  const orderBy = sort === 'price' ? 'price DESC, id ASC' : 'rent_yield DESC, id ASC'
  const [statsResult, resultsResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
        AVG(rent_yield) AS average_rent_yield,
        AVG(CASE WHEN has_price = 1 THEN price END) AS average_price
       FROM estates WHERE ${where.sql} AND ${rankingFilterSql}`,
    ).bind(...where.values, ...rankingFilterValues),
    env.DB.prepare(
      `SELECT id, name, district, street, place_name, price, has_price, ref_price,
        rent_price, rent_yield, rent_samples, lng, lat, updated_at,
        source_observed_at, imported_at, record_changed_at
       FROM estates WHERE ${where.sql} AND ${rankingFilterSql}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ).bind(...where.values, ...rankingFilterValues, pagination.pageSize, offset),
  ])
  const stats = statsResult.results[0] as {
    total?: number
    average_rent_yield?: number | null
    average_price?: number | null
  } | undefined
  const rows = resultsResult.results as unknown as EstateRow[]
  return json({
    scope: 'estates-ranking',
    sort,
    items: rows.map((row, index) => ({
      rank: offset + index + 1,
      ...estateSummary(row),
    })),
    stats: {
      total: stats?.total ?? 0,
      averageRentYield: stats?.average_rent_yield ?? null,
      averagePrice: stats?.average_price ?? null,
    },
    pagination: {
      ...pagination,
      hasMore: pagination.page * pagination.pageSize < (stats?.total ?? 0),
    },
  }, { headers: { 'Cache-Control': API_CACHE_CONTROL } })
}

async function handleRankingExport(url: URL, env: Env): Promise<Response> {
  const filters = parseEstateFilters(url.searchParams)
  const minSamples = integerParam(url.searchParams, 'minSamples', 3, 0, 60)
  const limit = integerParam(url.searchParams, 'limit', 5000, 1, 10000)
  const where = buildEstateWhere(filters, 'e')
  const result = await env.DB.prepare(
    `SELECT
      e.id,
      e.name,
      e.district,
      e.street,
      e.place_name,
      e.price,
      e.rent_price,
      e.rent_yield,
      e.rent_samples,
      e.lng,
      e.lat,
      ROW_NUMBER() OVER (ORDER BY e.rent_yield DESC, e.id ASC) AS global_rank,
      ROW_NUMBER() OVER (PARTITION BY e.district ORDER BY e.rent_yield DESC, e.id ASC) AS district_rank
    FROM estates e
    WHERE ${where.sql} AND e.rent_yield IS NOT NULL AND e.rent_samples >= ?
    ORDER BY e.district ASC, district_rank ASC, e.id ASC
    LIMIT ?`,
  ).bind(...where.values, minSamples, limit).all<{
    id: number
    name: string
    district: string
    street: string
    place_name: string | null
    price: number | null
    rent_price: number | null
    rent_yield: number | null
    rent_samples: number | null
    lng: number
    lat: number
    global_rank: number
    district_rank: number
  }>()

  const schoolsResult = await env.DB.prepare(
    `SELECT id, name, district, level_label, lock_years, hold_years_advised, lng, lat
     FROM schools WHERE is_current = 1`,
  ).all<{
    id: string
    name: string
    district: string
    level_label: string
    lock_years: number | null
    hold_years_advised: number | null
    lng: number
    lat: number
  }>()

  const schoolsByDistrict = new Map<string, typeof schoolsResult.results>()
  for (const school of schoolsResult.results) {
    const list = schoolsByDistrict.get(school.district)
    if (list) list.push(school)
    else schoolsByDistrict.set(school.district, [school])
  }

  const nearestSchool = (row: { district: string; lng: number; lat: number }) => {
    const schools = schoolsByDistrict.get(row.district) || []
    let best = null as (typeof schools)[number] | null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const school of schools) {
      const dx = school.lng - row.lng
      const dy = school.lat - row.lat
      const dist = dx * dx + dy * dy
      if (dist < bestDistance) {
        bestDistance = dist
        best = school
      }
    }
    return best
  }

  const header = [
    'global_rank',
    'district_rank',
    'district',
    'street',
    'estate_id',
    'estate_name',
    'place_name',
    'price_yuan_per_sqm',
    'rent_yuan_per_sqm_per_month',
    'rent_yield_percent',
    'rent_samples',
    'best_school_name',
    'best_school_level',
    'best_school_lock_years',
    'best_school_hold_years_advised',
  ].join(',')

  const rows = result.results.map((row) => {
    const school = nearestSchool(row)
    return [
    row.global_rank,
    row.district_rank,
    row.district,
    row.street,
    row.id,
    row.name,
    row.place_name,
    row.price,
    row.rent_price,
    row.rent_yield,
    row.rent_samples,
    school?.name ?? null,
    school?.level_label ?? null,
    school?.lock_years ?? null,
    school?.hold_years_advised ?? null,
  ].map(csvValue).join(',')
  })

  const csv = `\ufeff${header}\n${rows.join('\n')}`
  const filename = 'rent-yield-best-school.csv'
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

async function handlePriceHistory(id: number, url: URL, env: Env): Promise<Response> {
  const days = integerParam(url.searchParams, 'days', 30, 1, 90)
  const limit = integerParam(url.searchParams, 'limit', 100, 1, 200)
  const [estateResult, historyResult] = await env.DB.batch([
    env.DB.prepare('SELECT id FROM estates WHERE id = ? AND is_listed = 1').bind(id),
    env.DB.prepare(`SELECT id, price, source, captured_at, source_observed_at
      FROM price_history WHERE estate_id = ?
        AND captured_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
      ORDER BY captured_at DESC, id DESC LIMIT ?`).bind(id, `-${days} days`, limit + 1),
  ])
  if (!estateResult.results.length) throw new HttpError(404, '未找到该小区')
  const rows = historyResult.results as unknown as PriceHistoryRow[]
  return json({
    estateId: id,
    history: rows.slice(0, limit).reverse().map((row) => ({
      price: row.price,
      source: row.source,
      capturedAt: row.captured_at,
      sourceObservedAt: row.source_observed_at,
    })),
    truncated: rows.length > limit,
  }, { headers: { 'Cache-Control': API_CACHE_CONTROL } })
}

async function handleStreets(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT s.name, s.district, s.geometry,
       COUNT(e.id) AS estates,
       COALESCE(SUM(e.has_price), 0) AS priced,
       ROUND(AVG(e.price)) AS avg_price
     FROM streets s
     LEFT JOIN estates e
       ON e.street = s.name AND e.district = s.district AND e.is_listed = 1
     WHERE s.is_current = 1
     GROUP BY s.name, s.district
     ORDER BY s.district, s.name LIMIT 100`,
  ).all<{
    name: string
    district: string
    geometry: string
    estates: number
    priced: number
    avg_price: number | null
  }>()
  return json({
    type: 'FeatureCollection',
    scope: 'streets',
    features: result.results.map((row) => ({
      type: 'Feature',
      properties: {
        name: row.name,
        district: row.district,
        estates: row.estates,
        priced: row.priced,
        avgPrice: row.avg_price,
      },
      geometry: JSON.parse(row.geometry),
    })),
  }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400' } })
}

async function handleSchools(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT id, name, level, level_label, district, group_name, address,
    zone_text, zones, phones, lng, lat, source_url, source_year, source_published, lyj_school_id, lyj_name,
    lyj_level, lyj_established, lyj_admission_scores, lyj_nearby_xq,
    lock_years, hold_years_advised, degree_policy_note
    FROM schools WHERE is_current = 1 ORDER BY level, name`).all<SchoolRow>()
  return json({
    type: 'FeatureCollection',
    scope: 'school-scopes',
    features: result.results.map(schoolFeature),
  }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400' } })
}

async function handleSchoolZones(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT school_id, name, level, level_label, district, zones, geometry, method
     FROM school_zones WHERE is_current = 1 ORDER BY level, name`,
  ).all<SchoolZoneRow>()
  return json({
    type: 'FeatureCollection',
    scope: 'school-scopes',
    features: result.results.map((row) => ({
      type: 'Feature',
      properties: {
        schoolId: row.school_id,
        name: row.name,
        level: row.level,
        levelLabel: row.level_label,
        district: row.district,
        zones: stringList(row.zones),
        method: row.method,
      },
      geometry: JSON.parse(row.geometry),
    })),
  }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400' } })
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (isDirectApiNavigation(request) && !url.pathname.startsWith('/api/export/')) {
    return json({ error: 'API 仅供站点页面内部调用' }, { status: 404, headers: NO_STORE_HEADERS })
  }
  if (request.method !== 'GET') {
    return json({ error: '仅支持 GET 请求' }, { status: 405, headers: { ...NO_STORE_HEADERS, Allow: 'GET' } })
  }
  if (url.pathname === '/api/health') return json({ status: 'ok' }, { headers: NO_STORE_HEADERS })
  if (url.pathname === '/api/meta') return handleMeta(env)
  if (url.pathname === '/api/estates') return handleEstates(url, env)
  if (url.pathname === '/api/search') return handleSearch(url, env)
  if (url.pathname === '/api/ranking') return handleRanking(url, env)
  if (url.pathname === '/api/export/rent-yield.csv') return handleRankingExport(url, env)
  if (url.pathname === '/api/heatmap') return handleHeatmap(url, env)
  if (url.pathname === '/api/streets' || url.pathname === '/api/layers/streets') return handleStreets(env)
  if (url.pathname === '/api/schools' || url.pathname === '/api/layers/school-scopes') return handleSchools(env)
  if (url.pathname === '/api/layers/school-zones') return handleSchoolZones(env)
  const plannedLayer = url.pathname.match(/^\/api\/layers\/(transit|planning)$/)
  if (plannedLayer) throw new HttpError(404, '该数据层尚未开放')
  const historyMatch = url.pathname.match(/^\/api\/estates\/(\d+)\/price-history$/)
  if (historyMatch) {
    const id = Number(historyMatch[1])
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, '小区 ID 无效')
    return handlePriceHistory(id, url, env)
  }
  const detailMatch = url.pathname.match(/^\/api\/estates\/(\d+)$/)
  if (detailMatch) {
    const id = Number(detailMatch[1])
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, '小区 ID 无效')
    return handleEstateDetail(id, env)
  }
  throw new HttpError(404, '接口不存在')
}

function canonicalCachePath(url: URL): string | null {
  if (url.pathname === '/api/meta') return url.pathname
  if (url.pathname === '/api/streets' || url.pathname === '/api/layers/streets') return '/api/streets'
  if (url.pathname === '/api/schools' || url.pathname === '/api/layers/school-scopes') return '/api/schools'
  if (url.pathname === '/api/layers/school-zones') return '/api/layers/school-zones'
  if (url.pathname === '/api/heatmap') {
    const filters = parseEstateFilters(url.searchParams)
    const params = new URLSearchParams({
      q: filters.keyword,
      district: filters.district,
      street: filters.street,
      pricedOnly: filters.pricedOnly ? '1' : '0',
      missingRefPrice: filters.missingRefPrice ? '1' : '0',
      minPrice: String(filters.minPrice),
      maxPrice: String(filters.maxPrice),
    })
    return `/api/heatmap?${params}`
  }
  if (url.pathname === '/api/search') {
    const filters = parseEstateFilters(url.searchParams)
    if (!filters.keyword) return null
    const pagination = parsePagination(url.searchParams)
    const params = new URLSearchParams({
      q: filters.keyword,
      district: filters.district,
      street: filters.street,
      pricedOnly: filters.pricedOnly ? '1' : '0',
      missingRefPrice: filters.missingRefPrice ? '1' : '0',
      minPrice: String(filters.minPrice),
      maxPrice: String(filters.maxPrice),
      sort: parseSort(url.searchParams),
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    })
    return `/api/search?${params}`
  }
  if (url.pathname === '/api/estates') {
    const filters = parseFilters(url.searchParams)
    const pagination = parsePagination(url.searchParams)
    const params = new URLSearchParams({
      west: filters.west.toFixed(6),
      south: filters.south.toFixed(6),
      east: filters.east.toFixed(6),
      north: filters.north.toFixed(6),
      zoom: String(Math.round(filters.zoom)),
      district: filters.district,
      street: filters.street,
      q: filters.keyword,
      pricedOnly: filters.pricedOnly ? '1' : '0',
      missingRefPrice: filters.missingRefPrice ? '1' : '0',
      minPrice: String(filters.minPrice),
      maxPrice: String(filters.maxPrice),
      sort: parseSort(url.searchParams),
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
    })
    return `/api/estates?${params}`
  }
  if (url.pathname === '/api/ranking') {
    const filters = parseEstateFilters(url.searchParams)
    const pagination = parsePagination(url.searchParams)
    const params = new URLSearchParams({
      sort: url.searchParams.get('sort') === 'price' ? 'price' : 'rentYield',
      district: filters.district,
      street: filters.street,
      q: filters.keyword,
      pricedOnly: filters.pricedOnly ? '1' : '0',
      missingRefPrice: filters.missingRefPrice ? '1' : '0',
      minPrice: String(filters.minPrice),
      maxPrice: String(filters.maxPrice),
      page: String(pagination.page),
      pageSize: String(pagination.pageSize),
      minSamples: String(integerParam(url.searchParams, 'minSamples', 3, 0, 60)),
    })
    return `/api/ranking?${params}`
  }
  const historyMatch = url.pathname.match(/^\/api\/estates\/(\d+)\/price-history$/)
  if (historyMatch) {
    const id = Number(historyMatch[1])
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, '小区 ID 无效')
    const limit = integerParam(url.searchParams, 'limit', 100, 1, 200)
    const days = integerParam(url.searchParams, 'days', 30, 1, 90)
    return `/api/estates/${id}/price-history?days=${days}&limit=${limit}`
  }
  const detailMatch = url.pathname.match(/^\/api\/estates\/(\d+)$/)
  if (detailMatch) {
    const id = Number(detailMatch[1])
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, '小区 ID 无效')
    return `/api/estates/${id}`
  }
  return null
}

async function cachedDataVersion(): Promise<string | null> {
  try {
    const cached = await caches.default.match(VERSION_CACHE_KEY)
    if (!cached) return null
    const entry = (await cached.json()) as { value?: unknown } | null
    return typeof entry?.value === 'string' ? entry.value : null
  } catch {
    return null
  }
}

async function dataVersion(env: Env, ctx: ExecutionContext): Promise<string> {
  try {
    const row = await env.DB.prepare(
      'SELECT value FROM app_metadata WHERE key = ?',
    ).bind('data_version').first<{ value: string }>()
    if (!row?.value) throw new Error('Data version is unavailable')
    ctx.waitUntil(
      caches.default.put(VERSION_CACHE_KEY, json({ value: row.value }, {
        headers: { 'Cache-Control': 'public, max-age=86400' },
      })).catch(() => {}),
    )
    return row.value
  } catch (error) {
    const fallback = await cachedDataVersion()
    if (fallback) return fallback
    throw error
  }
}

function rateLimitGroup(url: URL): string {
  if (url.pathname === '/api/search') return 'search'
  if (url.pathname === '/api/heatmap') return 'heatmap'
  if (url.pathname.startsWith('/api/export/')) return 'export'
  return 'map'
}

async function rateLimit(request: Request, url: URL): Promise<void> {
  const group = rateLimitGroup(url)
  const limit = RATE_LIMITS[group]
  if (!limit) return
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const bucket = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS)
  const key = `https://worker-cache.invalid/rate/${group}/${ip}/${bucket}`
  let count = 1
  try {
    const cached = await caches.default.match(key)
    if (cached) {
      const parsed = Number(await cached.text())
      if (Number.isFinite(parsed)) count = parsed + 1
    }
    if (count > limit) throw new HttpError(429, '请求过于频繁，请稍后再试')
    await caches.default.put(key, new Response(String(count), {
      headers: { 'Cache-Control': `public, max-age=${RATE_LIMIT_WINDOW_SECONDS}` },
    }))
  } catch (error) {
    if (error instanceof HttpError) throw error
  }
}

function withCacheHeaders(response: Response, status: 'HIT' | 'MISS', version: string): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Worker-Cache', status)
  headers.set('X-Data-Version', version)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }
    if (isDirectApiNavigation(request) && !url.pathname.startsWith('/api/export/')) {
      return json({ error: 'API 仅供站点页面内部调用' }, { status: 404, headers: NO_STORE_HEADERS })
    }
    try {
      if (request.method !== 'GET') return await handleApi(request, env)
      await rateLimit(request, url)
      const canonicalPath = canonicalCachePath(url)
      if (!canonicalPath) return await handleApi(request, env)
      const version = await dataVersion(env, ctx)
      const cacheKey = new Request(
        `https://worker-cache.invalid/${CACHE_SCHEMA_VERSION}/${version}${canonicalPath}`,
      )
      const cache = caches.default
      const cached = await cache.match(cacheKey)
      if (cached) return withCacheHeaders(cached, 'HIT', version)
      const response = await handleApi(request, env)
      if (response.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()))
      return withCacheHeaders(response, 'MISS', version)
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS })
      }
      console.error(error)
      return json({ error: '服务暂时不可用' }, { status: 500, headers: NO_STORE_HEADERS })
    }
  },
} satisfies ExportedHandler<Env>
