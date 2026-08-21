import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { dataVersionUpsert, estateInsert, estateUpsert, loadSourceData, markEstatesUnlisted, markMissingSchools, markMissingSchoolZones, schoolInsert, schoolUpsert, schoolZoneInsert, schoolZoneUpsert, sourceDataVersion, streetInsert, streetUpsert } from '../scripts/data-sql.mjs'
import { validateSchoolContinuity, validateSchoolSnapshot } from '../scripts/school-data-validation.mjs'
import { profileFiles, requireUpdateProfile } from '../scripts/update-profile.mjs'

const estate = {
  geometry: { type: 'Point', coordinates: [114.1, 22.6] },
  properties: {
    id: 1,
    name: '测试小区',
    district: '测试区',
    street: '测试街道',
    areaName: '测试片区',
    placeName: '测试地点',
    price: 50000,
    has_price: true,
    price_source: 'test',
    source_observed_at: '2026-08-12T00:00:00.000Z',
  },
}

const street = {
  geometry: {
    type: 'Polygon',
    coordinates: [[[114, 22.5], [114.2, 22.5], [114.2, 22.7], [114, 22.5]]],
  },
  properties: { street_name: '测试街道', district: '测试区' },
}

const school = {
  geometry: { type: 'Point', coordinates: [114.11, 22.61] },
  properties: {
    id: 'gm-j-1',
    name: '测试学校',
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
    lyj_school_id: null,
    lyj_nearby_xq: [],
  },
}

const schoolZone = {
  geometry: {
    type: 'Polygon',
    coordinates: [[[114.0, 22.5], [114.0, 22.7], [114.2, 22.7], [114.2, 22.5], [114.0, 22.5]]],
  },
  properties: {
    school_id: 'gm-j-1',
    name: '测试学校',
    level: 'junior',
    level_label: '初中',
    district: '光明区',
    zones: ['测试社区'],
    method: 'community-voronoi-approx',
  },
}

async function database() {
  const db = new DatabaseSync(':memory:')
  db.exec(await readFile(resolve('migrations/0001_initial.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0002_price_history_triggers.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0003_estate_listing_status.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0004_data_timestamps.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0005_app_metadata.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0006_street_status.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0007_data_catalog.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0008_ref_price.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0009_schools.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0010_school_zones.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0011_estate_rent.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0012_school_degree_policy.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0013_estates_listing_price_index.sql'), 'utf8'))
  db.exec(await readFile(resolve('migrations/0014_daily_price_snapshots.sql'), 'utf8'))
  return db
}

test('initial inserts create history without destructive SQL', async () => {
  const db = await database()
  const importedAt = '2026-08-13T00:00:00.000Z'
  const sql = `${estateInsert(estate, importedAt)}\n${streetInsert(street, importedAt)}`
  assert.doesNotMatch(sql, /DELETE\s+FROM/i)
  db.exec(sql)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM estates').get().count, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM streets').get().count, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count, 1)
  assert.throws(() => db.exec(estateInsert(estate, importedAt)), /UNIQUE constraint failed/)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count, 1)
})

test('data versions are deterministic and content-sensitive', () => {
  const first = sourceDataVersion({ features: [estate] }, { features: [street] })
  const second = sourceDataVersion({ features: [estate] }, { features: [street] })
  const changed = sourceDataVersion(
    { features: [{ ...estate, properties: { ...estate.properties, price: 55000 } }] },
    { features: [street] },
  )
  assert.equal(first, second)
  assert.notEqual(first, changed)
  assert.notEqual(
    sourceDataVersion({ features: [estate] }, { features: [street] }, { disclaimer: 'first' }),
    sourceDataVersion({ features: [estate] }, { features: [street] }, { disclaimer: 'second' }),
  )
})

test('data version switches only when content changes', async () => {
  const db = await database()
  db.exec(dataVersionUpsert('v1', '2026-08-13T00:00:00.000Z'))
  db.exec(dataVersionUpsert('v1', '2026-08-14T00:00:00.000Z'))
  const unchanged = db.prepare('SELECT value, updated_at FROM app_metadata WHERE key = ?').get('data_version')
  assert.equal(unchanged.value, 'v1')
  assert.equal(unchanged.updated_at, '2026-08-13T00:00:00.000Z')
  db.exec(dataVersionUpsert('v2', '2026-08-15T00:00:00.000Z'))
  assert.equal(db.prepare('SELECT value FROM app_metadata WHERE key = ?').get('data_version').value, 'v2')
})

test('unchanged upserts preserve timestamps and price history', async () => {
  const db = await database()
  db.exec(estateInsert(estate, '2026-08-13T00:00:00.000Z'))
  db.exec(streetInsert(street, '2026-08-13T00:00:00.000Z'))
  const sql = `${estateUpsert(estate, '2026-08-14T00:00:00.000Z')}\n${streetUpsert(street, '2026-08-14T00:00:00.000Z')}`
  assert.doesNotMatch(sql, /DELETE\s+FROM/i)
  db.exec(sql)
  assert.equal(db.prepare('SELECT updated_at FROM estates WHERE id = 1').get().updated_at, '2026-08-13T00:00:00.000Z')
  assert.equal(db.prepare('SELECT imported_at FROM estates WHERE id = 1').get().imported_at, '2026-08-14T00:00:00.000Z')
  assert.equal(db.prepare('SELECT record_changed_at FROM estates WHERE id = 1').get().record_changed_at, '2026-08-13T00:00:00.000Z')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count, 2)
})

test('price changes append history exactly once per day', async () => {
  const db = await database()
  db.exec(estateInsert(estate, '2026-08-13T00:00:00.000Z'))
  const changedEstate = {
    ...estate,
    properties: { ...estate.properties, price: 55000 },
  }
  db.exec(estateUpsert(changedEstate, '2026-08-14T00:00:00.000Z'))
  assert.equal(db.prepare('SELECT price FROM estates WHERE id = 1').get().price, 55000)
  assert.deepEqual(
    db.prepare('SELECT price FROM price_history WHERE estate_id = 1 ORDER BY captured_at').all().map((row) => row.price),
    [50000, 55000],
  )
  assert.equal(
    db.prepare('SELECT source_observed_at FROM price_history WHERE estate_id = 1 ORDER BY captured_at DESC LIMIT 1').get().source_observed_at,
    '2026-08-12T00:00:00.000Z',
  )
  db.exec(estateUpsert(changedEstate, '2026-08-15T00:00:00.000Z'))
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count, 3)
})

test('daily snapshots are idempotent within the same import day', async () => {
  const db = await database()
  db.exec(estateInsert(estate, '2026-08-13T00:00:00.000Z'))
  db.exec(estateUpsert(estate, '2026-08-14T00:00:00.000Z'))
  db.exec(estateUpsert(estate, '2026-08-14T05:00:00.000Z'))
  const rows = db.prepare('SELECT captured_at, price FROM price_history WHERE estate_id = 1 ORDER BY captured_at').all()
  assert.deepEqual(rows.map((row) => row.price), [50000, 50000])
  assert.ok(rows.every((row) => row.captured_at.slice(0, 10) !== '2026-08-13' || row.price === 50000))
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count, 2)
})

test('full refresh hides missing estates without deleting history', async () => {
  const db = await database()
  db.exec(estateInsert(estate, '2026-08-13T00:00:00.000Z'))
  db.exec(markEstatesUnlisted('2026-08-14T00:00:00.000Z'))
  assert.equal(db.prepare('SELECT is_listed FROM estates WHERE id = 1').get().is_listed, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count, 1)
  assert.equal(db.prepare('SELECT record_changed_at FROM estates WHERE id = 1').get().record_changed_at, '2026-08-14T00:00:00.000Z')
  db.exec(estateUpsert(estate, '2026-08-14T00:00:00.000Z'))
  assert.equal(db.prepare('SELECT is_listed FROM estates WHERE id = 1').get().is_listed, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count, 2)
})

test('school upserts are idempotent and retain missing records', async () => {
  const db = await database()
  db.exec(schoolInsert(school, '2026-08-13T00:00:00.000Z'))
  db.exec(schoolUpsert(school, '2026-08-14T00:00:00.000Z'))
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schools').get().count, 1)
  assert.equal(db.prepare('SELECT is_current FROM schools WHERE id = ?').get('gm-j-1').is_current, 1)
  db.exec(markMissingSchools({ type: 'FeatureCollection', features: [{ ...school, properties: { ...school.properties, id: 'gm-j-2' } }] }))
  assert.equal(db.prepare('SELECT is_current FROM schools WHERE id = ?').get('gm-j-1').is_current, 0)
})

test('school zone upserts are idempotent and track missing zones', async () => {
  const db = await database()
  db.exec(schoolInsert(school, '2026-08-13T00:00:00.000Z'))
  const zone = schoolZone
  db.exec(schoolZoneInsert(zone, '2026-08-13T00:00:00.000Z'))
  db.exec(schoolZoneUpsert(zone, '2026-08-14T00:00:00.000Z'))
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM school_zones').get().count, 1)
  assert.equal(db.prepare('SELECT is_current FROM school_zones WHERE school_id = ?').get('gm-j-1').is_current, 1)
  db.exec(markMissingSchoolZones({ type: 'FeatureCollection', features: [{ ...zone, properties: { ...zone.properties, school_id: 'gm-j-2' } }] }))
  assert.equal(db.prepare('SELECT is_current FROM school_zones WHERE school_id = ?').get('gm-j-1').is_current, 0)
})

test('source loading rejects empty or incomplete snapshots', async (context) => {
  assert.deepEqual(profileFiles('schools'), ['schools.geojson', 'school_zones.geojson'])
  assert.deepEqual(profileFiles('estate-prices'), ['estates.geojson', 'streets.geojson'])
  assert.throws(() => requireUpdateProfile('invalid'), /Invalid update profile/)
  const root = await mkdtemp(join(tmpdir(), 'shenzhen-map-data-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const populated = JSON.stringify({ type: 'FeatureCollection', features: [{}] })
  await Promise.all([
    writeFile(join(root, 'estates.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [] })),
    writeFile(join(root, 'streets.geojson'), populated),
    writeFile(join(root, 'schools.geojson'), populated),
    writeFile(join(root, 'school_zones.geojson'), populated),
  ])

  await assert.rejects(loadSourceData(root), /empty estates collection/)
  await writeFile(join(root, 'estates.geojson'), populated)
  await rm(join(root, 'school_zones.geojson'))
  assert.equal((await loadSourceData(root, 'estate-prices')).estates.features.length, 1)
  await assert.rejects(loadSourceData(root), /ENOENT/)
  await writeFile(join(root, 'school_zones.geojson'), populated)
  await rm(join(root, 'estates.geojson'))
  await rm(join(root, 'streets.geojson'))
  assert.equal((await loadSourceData(root, 'schools')).schools.features.length, 1)
})

test('school snapshot validation accepts matching point and polygon data', () => {
  const summary = validateSchoolSnapshot(
    { type: 'FeatureCollection', features: [school] },
    { type: 'FeatureCollection', features: [schoolZone] },
  )
  assert.equal(summary.schoolCount, 1)
  assert.equal(summary.schoolZoneCount, 1)
  assert.equal(summary.approximateZones, 1)
  assert.deepEqual(Object.fromEntries(summary.districtCounts), { '光明区': 1 })
})

test('school snapshot validation rejects missing zones and invalid geometry', () => {
  assert.throws(() => validateSchoolSnapshot(
    { type: 'FeatureCollection', features: [school] },
    { type: 'FeatureCollection', features: [{ ...schoolZone, properties: { ...schoolZone.properties, school_id: 'missing' } }] },
  ), /missing school/)
  assert.throws(() => validateSchoolSnapshot(
    { type: 'FeatureCollection', features: [{ ...school, geometry: { type: 'Point', coordinates: [0, 0] } }] },
    { type: 'FeatureCollection', features: [schoolZone] },
  ), /outside the Shenzhen safety bounds/)
})

test('school snapshot validation rejects incomplete, non-normalized, and zero-area data', () => {
  const collection = (feature) => ({ type: 'FeatureCollection', features: [feature] })
  assert.throws(() => validateSchoolSnapshot(
    collection({ ...school, properties: { ...school.properties, source_url: undefined } }),
    collection(schoolZone),
  ), /sourceUrl must be a string/)
  assert.throws(() => validateSchoolSnapshot(
    collection({ ...school, properties: { ...school.properties, id: ' gm-j-1 ' } }),
    collection(schoolZone),
  ), /leading or trailing whitespace/)
  assert.throws(() => validateSchoolSnapshot(
    collection(school),
    collection({
      ...schoolZone,
      geometry: {
        type: 'Polygon',
        coordinates: [[[114.0, 22.5], [114.1, 22.5], [114.2, 22.5], [114.0, 22.5]]],
      },
    }),
  ), /non-zero area/)
})

test('school continuity rejects district drops and unreviewed ID replacements', () => {
  const remote = validateSchoolSnapshot(
    { type: 'FeatureCollection', features: [school] },
    { type: 'FeatureCollection', features: [schoolZone] },
  )
  const replacementSchool = { ...school, properties: { ...school.properties, id: 'gm-j-2' } }
  const replacementZone = { ...schoolZone, properties: { ...schoolZone.properties, school_id: 'gm-j-2' } }
  const replacement = validateSchoolSnapshot(
    { type: 'FeatureCollection', features: [replacementSchool] },
    { type: 'FeatureCollection', features: [replacementZone] },
  )
  assert.throws(() => validateSchoolContinuity(replacement, remote), /ALLOW_SCHOOL_ID_REPLACEMENTS/)
  assert.doesNotThrow(() => validateSchoolContinuity(replacement, remote, { allowIdReplacements: true }))
  const emptyDistrict = {
    ...replacement,
    districtCounts: new Map(),
  }
  assert.throws(() => validateSchoolContinuity(emptyDistrict, remote, { allowIdReplacements: true }), /school-count drop/)
})

test('school continuity rejects stale and same-date unreviewed content', () => {
  const collection = (feature) => ({ type: 'FeatureCollection', features: [feature] })
  const remote = validateSchoolSnapshot(collection(school), collection(schoolZone))
  const changed = validateSchoolSnapshot(
    collection({ ...school, properties: { ...school.properties, name: '修改后的学校' } }),
    collection({ ...schoolZone, properties: { ...schoolZone.properties, name: '修改后的学校' } }),
  )
  assert.throws(() => validateSchoolContinuity(changed, remote), /ALLOW_SCHOOL_CONTENT_CHANGES/)
  assert.doesNotThrow(() => validateSchoolContinuity(changed, remote, { allowContentChanges: true }))

  const policyChanged = validateSchoolSnapshot(
    collection({ ...school, properties: { ...school.properties, lock_years: 4 } }),
    collection(schoolZone),
  )
  assert.throws(() => validateSchoolContinuity(policyChanged, remote), /ALLOW_SCHOOL_CONTENT_CHANGES/)

  const stale = validateSchoolSnapshot(
    collection({ ...school, properties: { ...school.properties, source_published: '2025-06-11' } }),
    collection(schoolZone),
  )
  assert.throws(() => validateSchoolContinuity(stale, remote, { allowContentChanges: true }), /older school data/)

  const outsideZone = validateSchoolSnapshot(
    collection(school),
    collection({
      ...schoolZone,
      geometry: {
        type: 'Polygon',
        coordinates: [[[114.3, 22.5], [114.3, 22.7], [114.4, 22.7], [114.4, 22.5], [114.3, 22.5]]],
      },
    }),
  )
  assert.throws(() => validateSchoolContinuity(outsideZone, remote, { allowContentChanges: true }), /outside their zones/)
  assert.doesNotThrow(() => validateSchoolContinuity(outsideZone, remote, {
    allowContentChanges: true,
    allowGeometryWarnings: true,
  }))

  const movedOutsidePoint = validateSchoolSnapshot(
    collection({
      ...school,
      geometry: { type: 'Point', coordinates: [114.2, 22.55] },
      properties: { ...school.properties, source_published: '2027-06-11' },
    }),
    collection({
      ...schoolZone,
      geometry: {
        type: 'Polygon',
        coordinates: [[[114.3, 22.5], [114.3, 22.7], [114.4, 22.7], [114.4, 22.5], [114.3, 22.5]]],
      },
    }),
  )
  assert.throws(() => validateSchoolContinuity(movedOutsidePoint, outsideZone), /outside their zones/)
})
