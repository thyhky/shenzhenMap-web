import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import worker from '../worker/index.ts'
import { dataScopes, globalDisclaimer } from '../scripts/data-catalog.mjs'
import { appMetadataUpsert, dataScopeUpsert, dataVersionUpsert, estateInsert, schoolInsert, schoolZoneInsert, streetInsert } from '../scripts/data-sql.mjs'

class Statement {
  constructor(database, sql, values = []) {
    this.database = database
    this.sql = sql
    this.values = values
  }

  bind(...values) {
    return new Statement(this.database, this.sql, values)
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values)
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) }
  }
}

class D1Mock {
  constructor(database) {
    this.database = database
  }

  prepare(sql) {
    return new Statement(this.database, sql)
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.all()))
  }
}

class MemoryCache {
  values = new Map()

  keyOf(request) {
    return typeof request === 'string' ? request : request.url
  }

  async match(request) {
    return this.values.get(this.keyOf(request))?.clone()
  }

  async put(request, response) {
    if (response.headers.get('Cache-Control')?.includes('no-store')) return
    this.values.set(this.keyOf(request), response.clone())
  }
}

async function setup() {
  const database = new DatabaseSync(':memory:')
  for (const name of [
    '0001_initial.sql',
    '0002_price_history_triggers.sql',
    '0003_estate_listing_status.sql',
    '0004_data_timestamps.sql',
    '0005_app_metadata.sql',
    '0006_street_status.sql',
    '0007_data_catalog.sql',
    '0008_ref_price.sql',
    '0009_schools.sql',
    '0010_school_zones.sql',
    '0011_estate_rent.sql',
    '0012_school_degree_policy.sql',
    '0013_estates_listing_price_index.sql',
    '0014_daily_price_snapshots.sql',
  ]) {
    database.exec(await readFile(resolve('migrations', name), 'utf8'))
  }
  const importedAt = '2026-08-14T00:00:00.000Z'
  for (let id = 1; id <= 25; id += 1) {
    database.exec(estateInsert({
      geometry: { type: 'Point', coordinates: [114 + id / 1000, 22.5 + id / 1000] },
      properties: {
        id,
        name: `测试小区${id}`,
        district: id === 1 ? '光明区' : '测试区',
        street: '测试街道',
        areaName: '测试片区',
        placeName: '测试地点',
        price: 30000 + id,
        has_price: true,
        price_source: 'test',
        source_observed_at: '2026-08-13T00:00:00.000Z',
      },
    }, importedAt))
  }
  database.exec(streetInsert({
    geometry: {
      type: 'Polygon',
      coordinates: [[[114, 22.5], [114.1, 22.5], [114.1, 22.6], [114, 22.5]]],
    },
    properties: { street_name: '测试街道', district: '测试区' },
  }, importedAt))
  database.exec(schoolInsert({
    geometry: { type: 'Point', coordinates: [114.001, 22.501] },
    properties: {
      id: 'gm-j-1',
      name: '测试光明中学',
      level: 'junior',
      level_label: '初中',
      district: '光明区',
      group: '测试教育集团',
      address: '测试路 1 号',
      zone_text: '测试社区',
      zones: ['测试社区'],
      phones: ['12345678'],
      source_url: 'https://example.test/schools',
      source_year: 2026,
      source_published: '2026-06-11',
      lyj_school_id: 1,
      lyj_name: '测试光明中学',
      lyj_level: '公办 / 初中',
      lyj_established: '2020年',
      lyj_admission_scores: '2026年-其他-80分',
      lyj_nearby_xq: ['测试小区'],
    },
  }, importedAt))
  database.exec(schoolZoneInsert({
    geometry: {
      type: 'Polygon',
      coordinates: [[[114.0, 22.5], [114.0, 22.6], [114.1, 22.6], [114.1, 22.5], [114.0, 22.5]]],
    },
    properties: {
      school_id: 'gm-j-1',
      name: '测试光明中学',
      level: 'junior',
      level_label: '初中',
      district: '光明区',
      zones: ['测试社区'],
      method: 'community-voronoi-approx',
    },
  }, importedAt))
  database.exec("UPDATE estates SET is_listed = 0 WHERE id = 25")
  database.exec(`INSERT INTO price_history
    (estate_id, price, source, captured_at, source_observed_at)
    VALUES (1, 32001, 'test', '2026-08-15T00:00:00.000Z', '2026-08-14T00:00:00.000Z')`)
  database.exec(dataVersionUpsert('v1', importedAt))
  for (const scope of dataScopes) {
    database.exec(dataScopeUpsert({
      ...scope,
      contentVersion: scope.status === 'active' ? `${scope.id}-v1` : null,
      sourceObservedAt: scope.id === 'estates' ? '2026-08-13T00:00:00.000Z' : null,
      importedAt: scope.status === 'active' ? importedAt : null,
    }, importedAt))
  }
  database.exec(appMetadataUpsert('global_disclaimer', globalDisclaimer, importedAt))

  const cache = new MemoryCache()
  globalThis.caches = { default: cache }
  const env = { DB: new D1Mock(database) }
  async function request(path, init) {
    const pending = []
    const response = await worker.fetch(
      new Request(`https://example.test${path}`, init),
      env,
      { waitUntil(promise) { pending.push(promise) } },
    )
    await Promise.all(pending)
    return response
  }
  return { database, env, request, cache }
}

test('worker paginates results and canonicalizes map cache keys', async () => {
  const { request } = await setup()
  const first = await request('/api/estates?west=113.9&south=22.4&east=114.2&north=22.8&zoom=14&minPrice=0&maxPrice=500000&page=1&pageSize=10')
  const firstBody = await first.json()
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('X-Worker-Cache'), 'MISS')
  assert.equal(firstBody.results.length, 10)
  assert.equal(firstBody.pagination.hasMore, true)
  assert.equal(firstBody.stats.total, 24)

  const equivalent = await request('/api/estates?pageSize=10&page=1&maxPrice=500000&minPrice=0&zoom=14&north=22.8&east=114.2&south=22.4&west=113.9')
  assert.equal(equivalent.headers.get('X-Worker-Cache'), 'HIT')

  const second = await request('/api/estates?west=113.9&south=22.4&east=114.2&north=22.8&zoom=14&minPrice=0&maxPrice=500000&page=2&pageSize=10')
  const secondBody = await second.json()
  assert.equal(secondBody.results.length, 10)
  assert.equal(new Set([...firstBody.results, ...secondBody.results].map((estate) => estate.id)).size, 20)

  const invalid = await request('/api/estates?west=113.9&south=22.4&east=114.2&north=22.8&zoom=14&page=1.5')
  assert.equal(invalid.status, 400)
  assert.equal(invalid.headers.get('Cache-Control'), 'no-store')
})

test('worker exposes price history and hides unlisted details', async () => {
  const { request } = await setup()
  const response = await request('/api/estates/1/price-history?limit=1')
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.history.length, 1)
  assert.equal(body.history[0].price, 32001)
  assert.equal(body.truncated, true)
  const estate = await request('/api/estates/1')
  const estateBody = await estate.json()
  assert.equal(estateBody.nearbySchools.length, 1)
  assert.equal(estateBody.nearbySchools[0].name, '测试光明中学')

  const hidden = await request('/api/estates/25')
  assert.equal(hidden.status, 404)
  assert.equal(hidden.headers.get('Cache-Control'), 'no-store')
})

test('price history supports day-range filtering', async () => {
  const { database, request } = await setup()
  const today = new Date().toISOString()
  database.exec(`INSERT INTO price_history (estate_id, price, source, captured_at, source_observed_at)
    VALUES (1, 34000, 'test', '${today}', '${today}')`)
  database.exec(`INSERT INTO price_history (estate_id, price, source, captured_at, source_observed_at)
    VALUES (1, 29000, 'test', '2019-06-01T00:00:00.000Z', '2019-06-01T00:00:00.000Z')`)
  const week = await request('/api/estates/1/price-history?days=7&limit=50')
  const weekBody = await week.json()
  assert.equal(week.status, 200)
  assert.ok(weekBody.history.length >= 1)
  assert.ok(weekBody.history.every((row) => row.price !== 29000))
  const all = await request('/api/estates/1/price-history?days=90&limit=50')
  const allBody = await all.json()
  assert.equal(all.headers.get('X-Worker-Cache'), 'MISS')
  assert.ok(allBody.history.every((row) => row.price !== 29000))
  const invalid = await request('/api/estates/1/price-history?days=0')
  assert.equal(invalid.status, 400)
})

test('data version changes bypass existing edge cache entries', async () => {
  const { database, request } = await setup()
  const first = await request('/api/meta')
  const firstBody = await first.clone().json()
  assert.equal(first.headers.get('X-Worker-Cache'), 'MISS')
  assert.equal(first.headers.get('X-Data-Version'), 'v1')
  assert.equal(firstBody.catalog.scopes.length, 6)
  assert.equal(firstBody.catalog.scopes.filter((scope) => scope.status === 'active').length, 4)
  assert.match(firstBody.catalog.disclaimer, /研究参考/)
  const second = await request('/api/meta')
  assert.equal(second.headers.get('X-Worker-Cache'), 'HIT')

  database.exec(dataVersionUpsert('v2', '2026-08-15T00:00:00.000Z'))
  const refreshed = await request('/api/meta')
  assert.equal(refreshed.headers.get('X-Worker-Cache'), 'MISS')
  assert.equal(refreshed.headers.get('X-Data-Version'), 'v2')
})

test('layer catalog exposes streets with stats and schools, and rejects planned layers', async () => {
  const { request } = await setup()
  const streets = await request('/api/layers/streets')
  const streetsBody = await streets.json()
  assert.equal(streets.status, 200)
  assert.equal(streetsBody.scope, 'streets')
  assert.equal(streetsBody.features.length, 1)
  const streetStats = streetsBody.features[0].properties
  assert.equal(streetStats.name, '测试街道')
  assert.equal(streetStats.estates, 23)
  assert.equal(streetStats.priced, 23)
  assert.equal(streetStats.avgPrice, 30013)

  const meta = await request('/api/meta')
  const metaBody = await meta.json()
  const testStreet = metaBody.streets.find((item) => item.name === '测试街道' && item.district === '测试区')
  assert.equal(testStreet.estates, 23)
  assert.equal(testStreet.priced, 23)
  assert.equal(testStreet.avgPrice, 30013)

  const schools = await request('/api/layers/school-scopes')
  const schoolsBody = await schools.json()
  assert.equal(schools.status, 200)
  assert.equal(schoolsBody.scope, 'school-scopes')
  assert.equal(schoolsBody.features.length, 1)
  assert.deepEqual(schoolsBody.features[0].properties.zones, ['测试社区'])

  const planned = await request('/api/layers/transit')
  assert.equal(planned.status, 404)
  assert.equal(planned.headers.get('Cache-Control'), 'no-store')
})

test('school zones layer exposes approximate zone polygons', async () => {
  const { request } = await setup()
  const zones = await request('/api/layers/school-zones')
  const body = await zones.json()
  assert.equal(zones.status, 200)
  assert.equal(body.scope, 'school-scopes')
  assert.equal(body.features.length, 1)
  const feature = body.features[0]
  assert.equal(feature.properties.schoolId, 'gm-j-1')
  assert.deepEqual(feature.properties.zones, ['测试社区'])
  assert.equal(feature.properties.method, 'community-voronoi-approx')
  assert.equal(feature.geometry.type, 'Polygon')
  const cached = await request('/api/layers/school-zones')
  assert.equal(cached.headers.get('X-Worker-Cache'), 'HIT')
})

test('cached responses survive D1 failure via version fallback', async () => {
  const { env, request, cache } = await setup()
  await request('/api/meta')
  assert.ok([...cache.values.keys()].some((key) => key.endsWith('/data-version')), JSON.stringify([...cache.values.keys()]))
  const hit = await request('/api/meta')
  assert.equal(hit.headers.get('X-Worker-Cache'), 'HIT')
  env.DB = { prepare() { throw new Error('D1 unavailable') } }
  const stillHit = await request('/api/meta')
  assert.equal(stillHit.status, 200)
  assert.equal(stillHit.headers.get('X-Worker-Cache'), 'HIT')
})

test('rate limiting rejects excessive requests', async () => {
  const { request } = await setup()
  let last = null
  for (let i = 0; i < 31; i += 1) {
    last = await request('/api/search?q=%E6%B5%8B%E8%AF%95&minPrice=0&maxPrice=500000')
  }
  assert.equal(last.status, 429)
  const body = await last.json()
  assert.equal(body.error, '请求过于频繁，请稍后再试')
})

test('viewports outside the service area are rejected', async () => {
  const { request } = await setup()
  const tooWide = await request('/api/estates?west=110&south=20&east=118&north=25&zoom=10')
  assert.equal(tooWide.status, 400)
  const outOfArea = await request('/api/estates?west=120&south=30&east=121&north=31&zoom=10')
  assert.equal(outOfArea.status, 400)
})

test('search responses are cached under a canonical key', async () => {
  const { request } = await setup()
  const first = await request('/api/search?q=%E6%B5%8B%E8%AF%95&minPrice=0&maxPrice=500000')
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('X-Worker-Cache'), 'MISS')
  const equivalent = await request('/api/search?maxPrice=500000&minPrice=0&q=%E6%B5%8B%E8%AF%95')
  assert.equal(equivalent.status, 200)
  assert.equal(equivalent.headers.get('X-Worker-Cache'), 'HIT')
})

test('missing reference-price filtering is applied and cache-separated', async () => {
  const { database, request } = await setup()
  database.exec('UPDATE estates SET ref_price = 49100 WHERE id = 1')
  const missing = await request('/api/search?q=%E6%B5%8B%E8%AF%95&minPrice=0&maxPrice=500000&missingRefPrice=1&pageSize=50')
  const missingBody = await missing.json()
  assert.equal(missing.status, 200)
  assert.equal(missing.headers.get('X-Worker-Cache'), 'MISS')
  assert.equal(missingBody.stats.total, 23)
  assert.ok(missingBody.results.every((estate) => estate.refPrice === null))

  const all = await request('/api/search?q=%E6%B5%8B%E8%AF%95&minPrice=0&maxPrice=500000&pageSize=50')
  assert.equal(all.headers.get('X-Worker-Cache'), 'MISS')
  assert.equal((await all.json()).stats.total, 24)

  const equivalent = await request('/api/search?pageSize=50&missingRefPrice=1&maxPrice=500000&q=%E6%B5%8B%E8%AF%95&minPrice=0')
  assert.equal(equivalent.headers.get('X-Worker-Cache'), 'HIT')
})

test('estates support sort orderings with distinct cache keys', async () => {
  const { request } = await setup()
  const base = '/api/estates?west=113.9&south=22.4&east=114.2&north=22.8&zoom=14&minPrice=0&maxPrice=500000&pageSize=5'
  const asc = await request(`${base}&sort=price-asc`)
  const ascBody = await asc.json()
  assert.equal(asc.headers.get('X-Worker-Cache'), 'MISS')
  const prices = ascBody.results.map((estate) => estate.price)
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b))

  const ascAgain = await request(`${base}&sort=price-asc`)
  assert.equal(ascAgain.headers.get('X-Worker-Cache'), 'HIT')

  const defaultSorted = await request(base)
  const defaultBody = await defaultSorted.json()
  assert.notEqual(defaultBody.results[0].id, ascBody.results[0].id)

  const invalidSort = await request(`${base}&sort=hacked`)
  assert.equal(invalidSort.status, 200)
  assert.deepEqual(
    (await invalidSort.json()).results.map((estate) => estate.id),
    defaultBody.results.map((estate) => estate.id),
  )
})

test('search returns rent fields for rent-yield sorting', async () => {
  const { database, request } = await setup()
  database.exec('UPDATE estates SET rent_price = 90, rent_yield = 3.6, rent_samples = 5 WHERE id = 3')
  database.exec('UPDATE estates SET rent_price = 70, rent_yield = 2.1, rent_samples = 4 WHERE id = 4')
  const response = await request('/api/search?q=%E6%B5%8B%E8%AF%95&minPrice=0&maxPrice=500000&sort=rent-yield&pageSize=5')
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.results[0].id, 3)
  assert.equal(body.results[0].rentYield, 3.6)
  assert.equal(body.results[0].rentSamples, 5)
  assert.equal(body.items.find((item) => item.id === 3)?.rentYield, 3.6)
})

test('ranking paginates with continuous ranks and filters rent samples', async () => {
  const { database, request } = await setup()
  for (let id = 1; id <= 8; id += 1) {
    database.exec(`UPDATE estates SET rent_price = ${60 + id}, rent_yield = ${id / 10 + 1}, rent_samples = ${id === 1 ? 2 : 4} WHERE id = ${id}`)
  }
  const first = await request('/api/ranking?sort=rentYield&minSamples=3&minPrice=0&maxPrice=500000&page=1&pageSize=3')
  const firstBody = await first.json()
  assert.equal(first.status, 200)
  assert.deepEqual(firstBody.items.map((item) => item.rank), [1, 2, 3])
  assert.ok(firstBody.items.every((item) => item.rentSamples >= 3))
  const second = await request('/api/ranking?sort=rentYield&minSamples=3&minPrice=0&maxPrice=500000&page=2&pageSize=3')
  const secondBody = await second.json()
  assert.deepEqual(secondBody.items.map((item) => item.rank), [4, 5, 6])
  assert.equal(new Set([...firstBody.items, ...secondBody.items].map((item) => item.id)).size, 6)

  const longQuery = 'a'.repeat(40)
  const canonical = await request(`/api/ranking?q=${longQuery}x&sort=rentYield&minSamples=03&page=01&pageSize=020`)
  assert.equal(canonical.headers.get('X-Worker-Cache'), 'MISS')
  const equivalent = await request(`/api/ranking?pageSize=20&page=1&minSamples=3&sort=rentYield&q=${longQuery}y`)
  assert.equal(equivalent.headers.get('X-Worker-Cache'), 'HIT')
})

test('ranking CSV includes BOM, school fields, and download headers', async () => {
  const { database, request } = await setup()
  database.exec('UPDATE estates SET rent_price = 80, rent_yield = 3.2, rent_samples = 5 WHERE id = 1')
  const response = await request(
    '/api/export/rent-yield.csv?district=%E5%85%89%E6%98%8E%E5%8C%BA&minPrice=0&maxPrice=500000&minSamples=3&limit=10',
    { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' } },
  )
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type'), /text\/csv/)
  assert.match(response.headers.get('Content-Disposition'), /rent-yield-best-school\.csv/)
  assert.ok(body.charCodeAt(0) === 0xfeff || body.startsWith('global_rank'))
  assert.match(body, /best_school_name/)
  assert.match(body, /测试光明中学/)
})

test('heatmap returns null bounds for an empty district', async () => {
  const { request } = await setup()
  const response = await request('/api/heatmap?district=%E4%B8%8D%E5%AD%98%E5%9C%A8%E5%8C%BA&minPrice=0&maxPrice=500000')
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.total, 0)
  assert.equal(body.bounds, null)
  assert.deepEqual(body.points, [])
})

test('heatmap filters and separates cache entries by keyword', async () => {
  const { request } = await setup()
  const first = await request('/api/heatmap?district=%E6%B5%8B%E8%AF%95%E5%8C%BA&q=%E6%B5%8B%E8%AF%95%E5%B0%8F%E5%8C%BA24&minPrice=0&maxPrice=500000')
  const firstBody = await first.json()
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('X-Worker-Cache'), 'MISS')
  assert.equal(firstBody.total, 1)

  const different = await request('/api/heatmap?district=%E6%B5%8B%E8%AF%95%E5%8C%BA&q=%E6%B5%8B%E8%AF%95%E5%B0%8F%E5%8C%BA23&minPrice=0&maxPrice=500000')
  assert.equal(different.headers.get('X-Worker-Cache'), 'MISS')

  const equivalent = await request('/api/heatmap?maxPrice=500000&minPrice=0&q=%E6%B5%8B%E8%AF%95%E5%B0%8F%E5%8C%BA24&district=%E6%B5%8B%E8%AF%95%E5%8C%BA')
  assert.equal(equivalent.headers.get('X-Worker-Cache'), 'HIT')
})
