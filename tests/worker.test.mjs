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

  async match(request) {
    return this.values.get(request.url)?.clone()
  }

  async put(request, response) {
    this.values.set(request.url, response.clone())
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

  globalThis.caches = { default: new MemoryCache() }
  const env = { DB: new D1Mock(database) }
  async function request(path) {
    const pending = []
    const response = await worker.fetch(
      new Request(`https://example.test${path}`),
      env,
      { waitUntil(promise) { pending.push(promise) } },
    )
    await Promise.all(pending)
    return response
  }
  return { database, request }
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

test('layer catalog exposes streets and schools, and rejects planned layers', async () => {
  const { request } = await setup()
  const streets = await request('/api/layers/streets')
  const streetsBody = await streets.json()
  assert.equal(streets.status, 200)
  assert.equal(streetsBody.scope, 'streets')
  assert.equal(streetsBody.features.length, 1)

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
