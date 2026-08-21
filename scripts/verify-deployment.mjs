import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const baseUrl = process.argv[2] || 'https://map.okzer.xyz'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY) && !process.execArgv.includes('--use-env-proxy')) {
  execFileSync(process.execPath, ['--use-env-proxy', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  process.exit(0)
}
const sourceRoot = resolve(projectRoot, 'data')
const expectedManifest = process.env.EXPECTED_UPDATE_RUN_ID
  ? JSON.parse(await readFile(resolve(projectRoot, 'seed', 'update-parts', 'manifest.json'), 'utf8'))
  : null
if (expectedManifest && expectedManifest.runId !== process.env.EXPECTED_UPDATE_RUN_ID) {
  throw new Error('Update manifest was replaced before production verification')
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(90_000) })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  return response
}

async function get(path) {
  return (await request(path)).text()
}

async function api(path) {
  return (await request(path)).json()
}

const sourceEstates = JSON.parse(await readFile(resolve(sourceRoot, 'estates.geojson'), 'utf8'))
const sourceSchools = JSON.parse(await readFile(resolve(sourceRoot, 'schools.geojson'), 'utf8'))
const expectedEstates = sourceEstates.features.length
const expectedPriced = sourceEstates.features.filter((feature) => feature.properties.has_price).length
const expectedSchools = sourceSchools.features.length
const localEstateObservedAt = sourceEstates.features.reduce(
  (latest, feature) => feature.properties.source_observed_at > latest
    ? feature.properties.source_observed_at
    : latest,
  '',
)
const localEstateObservedTime = Date.parse(localEstateObservedAt)
if (!Number.isFinite(localEstateObservedTime)) throw new Error('Local estate snapshot has no valid source_observed_at timestamp')
const guangmingEstate = sourceEstates.features.find((feature) => feature.properties.district === '光明区')
if (!guangmingEstate) throw new Error('No Guangming estate exists in the source data')
const health = await api('/api/health')
const metaResponse = await request('/api/meta')
const meta = await metaResponse.json()
const remoteEstateObservedTime = Date.parse(meta.sourceObservedAt)
const remoteEstateSnapshotIsNewer = Number.isFinite(remoteEstateObservedTime)
  && remoteEstateObservedTime > localEstateObservedTime
let cachedMetaResponse
for (let attempt = 0; attempt < 4; attempt += 1) {
  cachedMetaResponse = await request('/api/meta')
  await cachedMetaResponse.body?.cancel()
  if (cachedMetaResponse.headers.get('X-Worker-Cache') === 'HIT') break
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
}
const search = await api('/api/search?q=%E5%8F%AF%E5%9B%AD&minPrice=0&maxPrice=500000')
const newSearch = await api('/api/search?q=%E6%B5%B7%E5%BE%B7%E5%9B%AD&minPrice=0&maxPrice=500000')
const map = await api('/api/estates?west=113.7&south=22.4&east=114.4&north=22.9&zoom=10&minPrice=20000&maxPrice=320000')
const detail = await api('/api/estates/2')
const history = await api('/api/estates/2/price-history?limit=100')
const currentHistorySource = expectedManifest
  ? sourceEstates.features.find((feature) => feature.properties.has_price)
  : null
const currentHistory = currentHistorySource
  ? await api(`/api/estates/${currentHistorySource.properties.id}/price-history?limit=100`)
  : null
const pageOne = await api('/api/search?q=%E5%8F%AF%E5%9B%AD&minPrice=0&maxPrice=500000&page=1&pageSize=2')
const pageTwo = await api('/api/search?q=%E5%8F%AF%E5%9B%AD&minPrice=0&maxPrice=500000&page=2&pageSize=2')
const priceRanking = await api('/api/ranking?sort=price&page=1&pageSize=2')
const yieldRanking = await api('/api/ranking?sort=rentYield&minSamples=3&page=1&pageSize=2')
const exportResponse = await request('/api/export/rent-yield.csv?district=%E5%85%89%E6%98%8E%E5%8C%BA&minSamples=3&limit=2')
const exportedCsv = await exportResponse.text()
const streets = await api('/api/streets')
const layerStreets = await api('/api/layers/streets')
const schools = await api('/api/schools')
const layerSchools = await api('/api/layers/school-scopes')
const schoolZones = await api('/api/layers/school-zones')
const schoolEstate = await api(`/api/estates/${guangmingEstate.properties.id}`)
const plannedLayerResponse = await fetch(`${baseUrl}/api/layers/transit`)
await plannedLayerResponse.body?.cancel()
const html = await get('/')
const assetPath = html.match(/src="([^"]+\.js)"/)?.[1]
if (!assetPath) throw new Error('Unable to locate the frontend JavaScript asset')
const javascriptPaths = new Set([assetPath])
const javascriptBodies = []
const queue = [assetPath]
while (queue.length && javascriptPaths.size <= 40) {
  const currentPath = queue.shift()
  const body = await get(currentPath)
  javascriptBodies.push(body)
  const dependencies = body.matchAll(/["']([^"']+\.js)["']/g)
  for (const match of dependencies) {
    const source = match[1]
    const resolved = source.startsWith('assets/')
      ? `/${source}`
      : new URL(source, `${baseUrl}${currentPath}`).pathname
    if (!resolved.startsWith('/assets/') || javascriptPaths.has(resolved)) continue
    javascriptPaths.add(resolved)
    queue.push(resolved)
  }
}
const javascript = javascriptBodies.join('\n')
const legacyLegendColors = ['#315b6d', '#2d817c', '#79a86b', '#e3b657', '#df7b45', '#bb3e45']
const uniLegendColors = ['#2f5fb3', '#10a09a', '#79a82f', '#e3b657', '#df7b45', '#bb3e45']
const legacyPaths = ['/estates.js', '/streets.js', '/estates.geojson', '/streets.geojson']

const result = {
  health: health.status,
  meta: {
    districts: meta.districts.length,
    estates: meta.totals.estates,
    priced: meta.totals.priced,
    sourceObservedAt: meta.sourceObservedAt,
    importedAt: meta.importedAt,
    recordChangedAt: meta.recordChangedAt,
    localExpectedEstates: expectedEstates,
    localObservedAt: localEstateObservedAt,
    remoteSnapshotIsNewer: remoteEstateSnapshotIsNewer,
  },
  cache: {
    first: metaResponse.headers.get('X-Worker-Cache'),
    second: cachedMetaResponse.headers.get('X-Worker-Cache'),
    version: cachedMetaResponse.headers.get('X-Data-Version'),
  },
  catalog: {
    scopes: meta.catalog.scopes.map((scope) => ({ id: scope.id, status: scope.status })),
    hasDisclaimer: Boolean(meta.catalog.disclaimer),
    layerStreetFeatures: layerStreets.features.length,
    schoolFeatures: schools.features.length,
    layerSchoolFeatures: layerSchools.features.length,
    schoolZoneFeatures: schoolZones.features.length,
    plannedLayerStatus: plannedLayerResponse.status,
  },
  search: {
    total: search.stats.total,
    firstResult: search.results[0]?.name ?? null,
  },
  newSearch: {
    total: newSearch.stats.total,
    firstResult: newSearch.results[0]?.name ?? null,
  },
  map: {
    mode: map.mode,
    items: map.items.length,
    total: map.stats.total,
  },
  detail: {
    id: detail.id,
    name: detail.name,
    price: detail.price,
    refPrice: detail.refPrice,
  },
  schoolEstate: {
    id: schoolEstate.id,
    nearbySchools: schoolEstate.nearbySchools?.length ?? 0,
  },
  history: {
    count: history.history.length,
    truncated: history.truncated,
    currentImportVerified: !expectedManifest || Boolean(currentHistory?.history?.some((entry) => (
      entry.price === currentHistorySource.properties.price
      && entry.sourceObservedAt === currentHistorySource.properties.source_observed_at
      && entry.capturedAt?.slice(0, 10) === expectedManifest.importedAt.slice(0, 10)
    ))),
  },
  pagination: {
    firstPage: pageOne.results.map((estate) => estate.id),
    secondPage: pageTwo.results.map((estate) => estate.id),
    hasMore: pageOne.pagination.hasMore,
  },
  ranking: {
    priceItems: priceRanking.items.length,
    priceFirstRank: priceRanking.items[0]?.rank ?? null,
    yieldItems: yieldRanking.items.length,
    yieldFirstRank: yieldRanking.items[0]?.rank ?? null,
  },
  export: {
    contentType: exportResponse.headers.get('Content-Type'),
    disposition: exportResponse.headers.get('Content-Disposition'),
    hasHeader: /^\uFEFF?global_rank,district_rank/.test(exportedCsv),
  },
  streetFeatures: streets.features.length,
  frontend: {
    hasApp: html.includes('<div id="app"></div>'),
    hasSixLegendBands: [legacyLegendColors, uniLegendColors].some((colors) => colors.every((color) => javascript.includes(color))),
    hasMethodologyPanel: javascript.includes('数据来源与方法'),
    hasSchoolLayer: javascript.includes('显示学校') || javascript.includes('学校…'),
    hasSchoolZoneLayer: javascript.includes('显示学区范围') || javascript.includes('学区…'),
    hasRanking: javascript.includes('小区榜单') || javascript.includes('租售比排行'),
    hasPriceHistory: javascript.includes('价格记录'),
  },
  legacyPaths: await Promise.all(legacyPaths.map(async (path) => {
    const body = await get(path)
    return {
      path,
      servesSpaFallback: body.includes('<div id="app"></div>'),
      exposesDataset: /__ESTATES__|__STREETS__|"FeatureCollection"/.test(body),
    }
  })),
}

console.log(JSON.stringify(result, null, 2))

if (
  result.health !== 'ok' ||
  (!remoteEstateSnapshotIsNewer && result.meta.estates !== expectedEstates) ||
  (!remoteEstateSnapshotIsNewer && result.meta.priced !== expectedPriced) ||
  !result.meta.sourceObservedAt ||
  !result.meta.importedAt ||
  !result.meta.recordChangedAt ||
  result.cache.second !== 'HIT' ||
  !result.cache.version ||
  (expectedManifest && result.cache.version !== expectedManifest.dataVersion) ||
  (expectedManifest && meta.catalog.dataVersion !== expectedManifest.dataVersion) ||
  result.catalog.scopes.length !== 6 ||
  result.catalog.scopes.filter((scope) => scope.status === 'active').length !== 4 ||
  !result.catalog.hasDisclaimer ||
  result.catalog.layerStreetFeatures !== 78 ||
  result.catalog.schoolFeatures !== expectedSchools ||
  result.catalog.layerSchoolFeatures !== expectedSchools ||
  result.catalog.schoolZoneFeatures !== expectedSchools ||
  result.catalog.plannedLayerStatus !== 404 ||
  result.schoolEstate.nearbySchools < 1 ||
  !detail.refPrice ||
  result.search.firstResult !== '可园三期' ||
  result.newSearch.firstResult !== '海德园' ||
  result.history.count < 1 ||
  !result.history.currentImportVerified ||
  result.pagination.firstPage.some((id) => result.pagination.secondPage.includes(id)) ||
  result.ranking.priceItems !== 2 ||
  result.ranking.priceFirstRank !== 1 ||
  result.ranking.yieldItems !== 2 ||
  result.ranking.yieldFirstRank !== 1 ||
  !result.export.contentType?.startsWith('text/csv') ||
  !result.export.disposition?.includes('attachment;') ||
  !result.export.hasHeader ||
  result.streetFeatures !== 78 ||
  !result.frontend.hasApp ||
  !result.frontend.hasSixLegendBands ||
  !result.frontend.hasMethodologyPanel ||
  !result.frontend.hasSchoolLayer ||
  !result.frontend.hasSchoolZoneLayer ||
  !result.frontend.hasRanking ||
  !result.frontend.hasPriceHistory ||
  result.legacyPaths.some((item) => item.exposesDataset)
) {
  process.exitCode = 1
}
