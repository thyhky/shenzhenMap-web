import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

export function sqlValue(value) {
  if (value === null || value === undefined || value === '') return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

export function sqlNotNullText(value) {
  if (value === null || value === undefined || value === '') return "''"
  return `'${String(value).replaceAll("'", "''")}'`
}

export function coordinateBounds(geometry) {
  const bounds = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity }
  const visit = (coordinates) => {
    if (typeof coordinates[0] === 'number') {
      const [lng, lat] = coordinates
      bounds.minLng = Math.min(bounds.minLng, lng)
      bounds.minLat = Math.min(bounds.minLat, lat)
      bounds.maxLng = Math.max(bounds.maxLng, lng)
      bounds.maxLat = Math.max(bounds.maxLat, lat)
      return
    }
    coordinates.forEach(visit)
  }
  visit(geometry.coordinates)
  return bounds
}

export async function loadSourceData(sourceRoot) {
  const estates = JSON.parse(await readFile(resolve(sourceRoot, 'estates.geojson'), 'utf8'))
  const streets = JSON.parse(await readFile(resolve(sourceRoot, 'streets.geojson'), 'utf8'))
  const schools = JSON.parse(await readFile(resolve(sourceRoot, 'schools.geojson'), 'utf8'))
  let schoolZones = null
  try {
    schoolZones = JSON.parse(await readFile(resolve(sourceRoot, 'school_zones.geojson'), 'utf8'))
  } catch {
    // school_zones is optional for now (school-scopes stays a point-only layer)
  }
  return { estates, streets, schools, schoolZones }
}

export function sourceDataVersion(estates, streets, catalog = null, schools = null, schoolZones = null) {
  const normalized = {
    estates: [...estates.features].sort((a, b) => a.properties.id - b.properties.id),
    streets: [...streets.features].sort((a, b) => {
      const district = a.properties.district.localeCompare(b.properties.district, 'zh-CN')
      return district || a.properties.street_name.localeCompare(b.properties.street_name, 'zh-CN')
    }),
    schools: schools ? [...schools.features].sort((a, b) => a.properties.id.localeCompare(b.properties.id)) : [],
    schoolZones: schoolZones
      ? [...schoolZones.features].sort((a, b) => a.properties.school_id.localeCompare(b.properties.school_id))
      : [],
    catalog,
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

export function scopeContentVersion(collection) {
  return createHash('sha256').update(JSON.stringify(collection)).digest('hex')
}

export function dataScopeUpsert(scope, importedAt) {
  const values = [
    scope.id,
    scope.label,
    scope.kind,
    scope.status,
    scope.sourceKey,
    scope.sourceName,
    scope.sourceUrl,
    scope.sourceVersion,
    scope.termsUrl,
    scope.licenseNote,
    scope.contentVersion,
    scope.sourceObservedAt,
    scope.importedAt,
    scope.disclaimer,
    importedAt,
  ].map(sqlValue).join(', ')
  return `INSERT INTO data_scopes
  (id, label, kind, status, source_key, source_name, source_url, source_version,
   terms_url, license_note, content_version, source_observed_at, imported_at, disclaimer, updated_at)
VALUES (${values})
ON CONFLICT(id) DO UPDATE SET
  label = excluded.label, kind = excluded.kind, status = excluded.status,
  source_key = excluded.source_key, source_name = excluded.source_name,
  source_url = excluded.source_url, source_version = excluded.source_version,
  terms_url = excluded.terms_url, license_note = excluded.license_note,
  content_version = excluded.content_version,
  source_observed_at = excluded.source_observed_at,
  imported_at = excluded.imported_at, disclaimer = excluded.disclaimer,
  updated_at = excluded.updated_at;`
}

export function appMetadataUpsert(key, value, importedAt) {
  return `INSERT INTO app_metadata (key, value, updated_at)
VALUES (${sqlValue(key)}, ${sqlValue(value)}, ${sqlValue(importedAt)})
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
WHERE app_metadata.value IS NOT excluded.value;`
}

export function dataVersionUpsert(version, importedAt) {
  return appMetadataUpsert('data_version', version, importedAt)
}

function estateValues(feature, importedAt) {
  const properties = feature.properties
  const [lng, lat] = feature.geometry.coordinates
  return [
    properties.id,
    properties.name,
    properties.district,
    properties.street,
    properties.areaName,
    properties.placeName,
    properties.has_price ? properties.price : null,
    properties.has_price ? 1 : 0,
    properties.price_source,
    properties.ref_price ?? null,
    properties.rent_price ?? null,
    properties.rent_yield ?? null,
    properties.rent_samples ?? 0,
    properties.rent_source ?? null,
    properties.rent_observed_at ?? null,
    lng,
    lat,
    importedAt,
    properties.source_observed_at,
    importedAt,
    importedAt,
    1,
  ].map(sqlValue).join(', ')
}

function streetValues(feature, importedAt) {
  const properties = feature.properties
  const bounds = coordinateBounds(feature.geometry)
  return [
    properties.street_name,
    properties.district,
    JSON.stringify(feature.geometry),
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
    importedAt,
    1,
  ].map(sqlValue).join(', ')
}

function schoolValues(feature, importedAt) {
  const properties = feature.properties
  const [lng, lat] = feature.geometry.coordinates
  const values = [
    properties.id,
    properties.name,
    properties.level,
    properties.level_label,
    properties.district,
    properties.group,
    properties.address,
    properties.zone_text,
    JSON.stringify(properties.zones),
    JSON.stringify(properties.phones),
    lng,
    lat,
    properties.source_url,
    properties.source_year,
    properties.source_published,
    properties.lyj_school_id,
    properties.lyj_name,
    properties.lyj_level,
    properties.lyj_established,
    properties.lyj_admission_scores,
    JSON.stringify(properties.lyj_nearby_xq ?? []),
    properties.lock_years ?? null,
    properties.hold_years_advised ?? null,
    properties.degree_policy_note ?? null,
    importedAt,
    importedAt,
    1,
  ]
  return values
    .map((value, index) => (index === 6 || index === 7 ? sqlNotNullText(value) : sqlValue(value)))
    .join(', ')
}

export function estateInsert(feature, importedAt) {
  return `INSERT INTO estates (id, name, district, street, area_name, place_name, price, has_price, price_source, ref_price, rent_price, rent_yield, rent_samples, rent_source, rent_observed_at, lng, lat, updated_at, source_observed_at, imported_at, record_changed_at, is_listed) VALUES (${estateValues(feature, importedAt)});`
}

export function streetInsert(feature, importedAt) {
  return `INSERT INTO streets (name, district, geometry, min_lng, min_lat, max_lng, max_lat, updated_at, is_current) VALUES (${streetValues(feature, importedAt)});`
}

export function schoolInsert(feature, importedAt) {
  return `INSERT INTO schools (id, name, level, level_label, district, group_name, address, zone_text,
    zones, phones, lng, lat, source_url, source_year, source_published, lyj_school_id, lyj_name,
    lyj_level, lyj_established, lyj_admission_scores, lyj_nearby_xq,
    lock_years, hold_years_advised, degree_policy_note, updated_at, imported_at, is_current)
    VALUES (${schoolValues(feature, importedAt)});`
}

export function estateUpsert(feature, importedAt) {
  const changed = `estates.name IS NOT excluded.name
    OR estates.district IS NOT excluded.district
    OR estates.street IS NOT excluded.street
    OR estates.area_name IS NOT excluded.area_name
    OR estates.place_name IS NOT excluded.place_name
    OR estates.price IS NOT excluded.price
    OR estates.has_price IS NOT excluded.has_price
    OR estates.price_source IS NOT excluded.price_source
    OR estates.ref_price IS NOT excluded.ref_price
    OR estates.rent_price IS NOT excluded.rent_price
    OR estates.rent_yield IS NOT excluded.rent_yield
    OR estates.rent_samples IS NOT excluded.rent_samples
    OR estates.rent_source IS NOT excluded.rent_source
    OR estates.rent_observed_at IS NOT excluded.rent_observed_at
    OR estates.lng IS NOT excluded.lng
    OR estates.lat IS NOT excluded.lat
    OR estates.is_listed IS NOT excluded.is_listed`
  return `INSERT INTO estates (id, name, district, street, area_name, place_name, price, has_price, price_source, ref_price, rent_price, rent_yield, rent_samples, rent_source, rent_observed_at, lng, lat, updated_at, source_observed_at, imported_at, record_changed_at, is_listed) VALUES (${estateValues(feature, importedAt)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  district = excluded.district,
  street = excluded.street,
  area_name = excluded.area_name,
  place_name = excluded.place_name,
  price = excluded.price,
  has_price = excluded.has_price,
  price_source = excluded.price_source,
  ref_price = excluded.ref_price,
  rent_price = excluded.rent_price,
  rent_yield = excluded.rent_yield,
  rent_samples = excluded.rent_samples,
  rent_source = excluded.rent_source,
  rent_observed_at = excluded.rent_observed_at,
  lng = excluded.lng,
  lat = excluded.lat,
  source_observed_at = COALESCE(excluded.source_observed_at, estates.source_observed_at),
  imported_at = excluded.imported_at,
  record_changed_at = CASE WHEN ${changed} THEN excluded.imported_at ELSE estates.record_changed_at END,
  is_listed = excluded.is_listed;`
}

export function markEstatesUnlisted(importedAt) {
  const value = sqlValue(importedAt)
  return `UPDATE estates
SET is_listed = 0,
    updated_at = ${value},
    record_changed_at = ${value}
WHERE is_listed = 1 AND imported_at IS NOT ${value};`
}

export function syncEstateUpdatedAt() {
  return `UPDATE estates
SET updated_at = record_changed_at
WHERE updated_at IS NOT record_changed_at;`
}

export function streetUpsert(feature, importedAt) {
  return `INSERT INTO streets (name, district, geometry, min_lng, min_lat, max_lng, max_lat, updated_at, is_current) VALUES (${streetValues(feature, importedAt)})
ON CONFLICT(district, name) DO UPDATE SET
  geometry = excluded.geometry,
  min_lng = excluded.min_lng,
  min_lat = excluded.min_lat,
  max_lng = excluded.max_lng,
  max_lat = excluded.max_lat,
  updated_at = excluded.updated_at,
  is_current = excluded.is_current
WHERE streets.geometry IS NOT excluded.geometry
  OR streets.min_lng IS NOT excluded.min_lng
  OR streets.min_lat IS NOT excluded.min_lat
  OR streets.max_lng IS NOT excluded.max_lng
  OR streets.max_lat IS NOT excluded.max_lat
  OR streets.is_current IS NOT excluded.is_current;`
}

export function schoolUpsert(feature, importedAt) {
  const changed = `schools.name IS NOT excluded.name
    OR schools.level IS NOT excluded.level
    OR schools.level_label IS NOT excluded.level_label
    OR schools.district IS NOT excluded.district
    OR schools.group_name IS NOT excluded.group_name
    OR schools.address IS NOT excluded.address
    OR schools.zone_text IS NOT excluded.zone_text
    OR schools.zones IS NOT excluded.zones
    OR schools.phones IS NOT excluded.phones
    OR schools.lng IS NOT excluded.lng
    OR schools.lat IS NOT excluded.lat
    OR schools.source_url IS NOT excluded.source_url
    OR schools.source_year IS NOT excluded.source_year
    OR schools.source_published IS NOT excluded.source_published
    OR schools.lyj_school_id IS NOT excluded.lyj_school_id
    OR schools.lyj_name IS NOT excluded.lyj_name
    OR schools.lyj_level IS NOT excluded.lyj_level
    OR schools.lyj_established IS NOT excluded.lyj_established
    OR schools.lyj_admission_scores IS NOT excluded.lyj_admission_scores
    OR schools.lyj_nearby_xq IS NOT excluded.lyj_nearby_xq
    OR schools.lock_years IS NOT excluded.lock_years
    OR schools.hold_years_advised IS NOT excluded.hold_years_advised
    OR schools.degree_policy_note IS NOT excluded.degree_policy_note
    OR schools.is_current IS NOT excluded.is_current`
  return `INSERT INTO schools (id, name, level, level_label, district, group_name, address, zone_text,
    zones, phones, lng, lat, source_url, source_year, source_published, lyj_school_id, lyj_name,
    lyj_level, lyj_established, lyj_admission_scores, lyj_nearby_xq,
    lock_years, hold_years_advised, degree_policy_note, updated_at, imported_at, is_current)
    VALUES (${schoolValues(feature, importedAt)})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  level = excluded.level,
  level_label = excluded.level_label,
  district = excluded.district,
  group_name = excluded.group_name,
  address = excluded.address,
  zone_text = excluded.zone_text,
  zones = excluded.zones,
  phones = excluded.phones,
  lng = excluded.lng,
  lat = excluded.lat,
  source_url = excluded.source_url,
  source_year = excluded.source_year,
  source_published = excluded.source_published,
  lyj_school_id = excluded.lyj_school_id,
  lyj_name = excluded.lyj_name,
  lyj_level = excluded.lyj_level,
  lyj_established = excluded.lyj_established,
  lyj_admission_scores = excluded.lyj_admission_scores,
  lyj_nearby_xq = excluded.lyj_nearby_xq,
  lock_years = excluded.lock_years,
  hold_years_advised = excluded.hold_years_advised,
  degree_policy_note = excluded.degree_policy_note,
  updated_at = CASE WHEN ${changed} THEN excluded.imported_at ELSE schools.updated_at END,
  imported_at = excluded.imported_at,
  is_current = excluded.is_current;`
}

export function markMissingStreets(streets) {
  const current = streets.features.map((feature) => {
    return `(district = ${sqlValue(feature.properties.district)} AND name = ${sqlValue(feature.properties.street_name)})`
  })
  if (!current.length) throw new Error('Refusing to mark streets without a current source set')
  return `UPDATE streets SET is_current = 0
WHERE is_current = 1 AND NOT (${current.join(' OR ')});`
}

function schoolZoneValues(feature, importedAt) {
  const properties = feature.properties
  const bounds = coordinateBounds(feature.geometry)
  return [
    properties.school_id,
    properties.name,
    properties.level,
    properties.level_label,
    properties.district,
    JSON.stringify(properties.zones),
    JSON.stringify(feature.geometry),
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
    properties.method ?? 'community-voronoi-approx',
    importedAt,
    1,
  ].map(sqlValue).join(', ')
}

export function schoolZoneInsert(feature, importedAt) {
  return `INSERT INTO school_zones (school_id, name, level, level_label, district, zones,
    geometry, min_lng, min_lat, max_lng, max_lat, method, imported_at, is_current)
    VALUES (${schoolZoneValues(feature, importedAt)});`
}

export function schoolZoneUpsert(feature, importedAt) {
  const changed = `school_zones.name IS NOT excluded.name
    OR school_zones.level IS NOT excluded.level
    OR school_zones.level_label IS NOT excluded.level_label
    OR school_zones.district IS NOT excluded.district
    OR school_zones.zones IS NOT excluded.zones
    OR school_zones.geometry IS NOT excluded.geometry
    OR school_zones.min_lng IS NOT excluded.min_lng
    OR school_zones.min_lat IS NOT excluded.min_lat
    OR school_zones.max_lng IS NOT excluded.max_lng
    OR school_zones.max_lat IS NOT excluded.max_lat
    OR school_zones.method IS NOT excluded.method
    OR school_zones.is_current IS NOT excluded.is_current`
  return `INSERT INTO school_zones (school_id, name, level, level_label, district, zones,
    geometry, min_lng, min_lat, max_lng, max_lat, method, imported_at, is_current)
    VALUES (${schoolZoneValues(feature, importedAt)})
ON CONFLICT(school_id) DO UPDATE SET
  name = excluded.name,
  level = excluded.level,
  level_label = excluded.level_label,
  district = excluded.district,
  zones = excluded.zones,
  geometry = excluded.geometry,
  min_lng = excluded.min_lng,
  min_lat = excluded.min_lat,
  max_lng = excluded.max_lng,
  max_lat = excluded.max_lat,
  method = excluded.method,
  updated_at = CASE WHEN ${changed} THEN excluded.imported_at ELSE school_zones.updated_at END,
  imported_at = excluded.imported_at,
  is_current = excluded.is_current;`
}

export function markMissingSchoolZones(schoolZones) {
  const current = schoolZones.features.map((feature) => sqlValue(feature.properties.school_id))
  if (!current.length) throw new Error('Refusing to mark school zones without a current source set')
  return `UPDATE school_zones SET is_current = 0
WHERE is_current = 1 AND school_id NOT IN (${current.join(', ')});`
}

export function markMissingSchools(schools) {
  const current = schools.features.map((feature) => sqlValue(feature.properties.id))
  if (!current.length) throw new Error('Refusing to mark schools without a current source set')
  return `UPDATE schools SET is_current = 0
WHERE is_current = 1 AND id NOT IN (${current.join(', ')});`
}
