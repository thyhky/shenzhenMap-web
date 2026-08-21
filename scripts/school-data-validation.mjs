import { createHash } from 'node:crypto'

const SHENZHEN_BOUNDS = {
  west: 113.5,
  south: 22.2,
  east: 114.8,
  north: 23.1,
}

function requireText(value, label, options = {}) {
  const { allowEmpty = false } = options
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  if (value !== value.trim()) throw new Error(`${label} must not contain leading or trailing whitespace`)
  if (!allowEmpty && !value) throw new Error(`${label} must be a non-empty string`)
  return value
}

function requireStringArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  value.forEach((entry, index) => requireText(entry, `${label}[${index}]`))
  return value
}

function optionalText(value, label) {
  if (value === null || value === undefined || value === '') return null
  return requireText(value, label)
}

function requireCoordinate(position, label) {
  if (!Array.isArray(position) || position.length < 2) throw new Error(`${label} must be a coordinate pair`)
  const [lng, lat] = position
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(`${label} contains a non-finite coordinate`)
  if (lng < SHENZHEN_BOUNDS.west || lng > SHENZHEN_BOUNDS.east
    || lat < SHENZHEN_BOUNDS.south || lat > SHENZHEN_BOUNDS.north) {
    throw new Error(`${label} is outside the Shenzhen safety bounds: ${lng}, ${lat}`)
  }
}

function ringArea(ring) {
  let area = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]
  }
  return Math.abs(area / 2)
}

function orientation(first, second, third) {
  const value = (second[1] - first[1]) * (third[0] - second[0])
    - (second[0] - first[0]) * (third[1] - second[1])
  if (Math.abs(value) < 1e-12) return 0
  return value > 0 ? 1 : 2
}

function pointOnSegment(first, point, second) {
  return point[0] <= Math.max(first[0], second[0])
    && point[0] >= Math.min(first[0], second[0])
    && point[1] <= Math.max(first[1], second[1])
    && point[1] >= Math.min(first[1], second[1])
}

function segmentsIntersect(first, second, third, fourth) {
  const o1 = orientation(first, second, third)
  const o2 = orientation(first, second, fourth)
  const o3 = orientation(third, fourth, first)
  const o4 = orientation(third, fourth, second)
  if (o1 !== o2 && o3 !== o4) return true
  return (o1 === 0 && pointOnSegment(first, third, second))
    || (o2 === 0 && pointOnSegment(first, fourth, second))
    || (o3 === 0 && pointOnSegment(third, first, fourth))
    || (o4 === 0 && pointOnSegment(third, second, fourth))
}

function ringSelfIntersects(ring) {
  const segmentCount = ring.length - 1
  for (let left = 0; left < segmentCount; left += 1) {
    for (let right = left + 1; right < segmentCount; right += 1) {
      if (right === left + 1 || (left === 0 && right === segmentCount - 1)) continue
      if (segmentsIntersect(ring[left], ring[left + 1], ring[right], ring[right + 1])) return true
    }
  }
  return false
}

function pointInRing([lng, lat], ring) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLng, currentLat] = ring[index]
    const [previousLng, previousLat] = ring[previous]
    const intersects = ((currentLat > lat) !== (previousLat > lat))
      && (lng < (previousLng - currentLng) * (lat - currentLat) / (previousLat - currentLat) + currentLng)
    if (intersects) inside = !inside
  }
  return inside
}

function ringsIntersect(left, right) {
  for (let leftIndex = 0; leftIndex < left.length - 1; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length - 1; rightIndex += 1) {
      if (segmentsIntersect(left[leftIndex], left[leftIndex + 1], right[rightIndex], right[rightIndex + 1])) return true
    }
  }
  return pointInRing(left[0], right) || pointInRing(right[0], left)
}

function contentDigest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function validateRing(ring, label) {
  if (!Array.isArray(ring) || ring.length < 4) throw new Error(`${label} must contain at least four positions`)
  ring.forEach((position, index) => requireCoordinate(position, `${label}[${index}]`))
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) throw new Error(`${label} must be closed`)
  if (ringArea(ring) < 1e-12) throw new Error(`${label} must have non-zero area`)
  return ringSelfIntersects(ring)
}

function validateAreaGeometry(geometry, label) {
  if (geometry?.type === 'Polygon') {
    if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) throw new Error(`${label} is empty`)
    if (geometry.coordinates.length !== 1) throw new Error(`${label} contains inner rings unsupported by the WeChat map adapter`)
    return {
      rings: [geometry.coordinates[0]],
      selfIntersects: validateRing(geometry.coordinates[0], `${label}.coordinates[0]`),
    }
  }
  if (geometry?.type === 'MultiPolygon') {
    if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) throw new Error(`${label} is empty`)
    let selfIntersects = false
    const rings = []
    geometry.coordinates.forEach((polygon, polygonIndex) => {
      if (!Array.isArray(polygon) || !polygon.length) throw new Error(`${label}.coordinates[${polygonIndex}] is empty`)
      if (polygon.length !== 1) throw new Error(`${label}.coordinates[${polygonIndex}] contains unsupported inner rings`)
      selfIntersects = validateRing(polygon[0], `${label}.coordinates[${polygonIndex}][0]`) || selfIntersects
      rings.push(polygon[0])
    })
    for (let left = 0; left < rings.length; left += 1) {
      for (let right = left + 1; right < rings.length; right += 1) {
        selfIntersects = ringsIntersect(rings[left], rings[right]) || selfIntersects
      }
    }
    return { rings, selfIntersects }
  }
  throw new Error(`${label} must be Polygon or MultiPolygon`)
}

function incrementDistrict(counts, district) {
  counts.set(district, (counts.get(district) ?? 0) + 1)
}

export function validateSchoolSnapshot(schools, schoolZones, options = {}) {
  const { apiShape = false } = options
  if (schools?.type !== 'FeatureCollection' || !Array.isArray(schools.features) || !schools.features.length) {
    throw new Error('schools must be a non-empty GeoJSON FeatureCollection')
  }
  if (schoolZones?.type !== 'FeatureCollection' || !Array.isArray(schoolZones.features) || !schoolZones.features.length) {
    throw new Error('school zones must be a non-empty GeoJSON FeatureCollection')
  }

  const schoolsById = new Map()
  const districtCounts = new Map()
  schools.features.forEach((feature, index) => {
    const label = `schools.features[${index}]`
    const properties = feature?.properties ?? {}
    const id = requireText(feature?.properties?.id, `${label}.properties.id`)
    if (schoolsById.has(id)) throw new Error(`Duplicate school id: ${id}`)
    const name = requireText(properties.name, `${label}.properties.name`)
    const district = requireText(properties.district, `${label}.properties.district`)
    const level = requireText(properties.level, `${label}.properties.level`)
    if (!['primary', 'junior'].includes(level)) throw new Error(`${label}.properties.level is invalid`)
    const levelLabel = requireText(apiShape ? properties.levelLabel : properties.level_label, `${label}.properties.levelLabel`)
    const address = requireText(properties.address, `${label}.properties.address`)
    const zoneText = requireText(apiShape ? properties.zoneText : properties.zone_text, `${label}.properties.zoneText`, { allowEmpty: true })
    const zones = requireStringArray(properties.zones, `${label}.properties.zones`)
    const phones = requireStringArray(properties.phones, `${label}.properties.phones`)
    const sourceUrl = requireText(apiShape ? properties.sourceUrl : properties.source_url, `${label}.properties.sourceUrl`)
    const sourceYear = apiShape ? properties.sourceYear : properties.source_year
    if (!Number.isSafeInteger(sourceYear) || sourceYear < 2000 || sourceYear > 2100) throw new Error(`${label}.properties.sourceYear is invalid`)
    const sourcePublished = requireText(apiShape ? properties.sourcePublished : properties.source_published, `${label}.properties.sourcePublished`)
    if (!Number.isFinite(Date.parse(sourcePublished))) throw new Error(`${label}.properties.sourcePublished is invalid`)
    const groupName = optionalText(apiShape ? properties.groupName : properties.group, `${label}.properties.groupName`)
    const apiLeyoujia = apiShape ? properties.leyoujia : null
    const leyoujiaId = apiShape ? apiLeyoujia?.id ?? null : properties.lyj_school_id ?? null
    if (leyoujiaId !== null && !Number.isSafeInteger(Number(leyoujiaId))) throw new Error(`${label}.properties.leyoujia.id is invalid`)
    const leyoujia = leyoujiaId === null ? null : {
      id: Number(leyoujiaId),
      name: optionalText(apiShape ? apiLeyoujia?.name : properties.lyj_name, `${label}.properties.leyoujia.name`),
      level: optionalText(apiShape ? apiLeyoujia?.level : properties.lyj_level, `${label}.properties.leyoujia.level`),
      established: optionalText(apiShape ? apiLeyoujia?.established : properties.lyj_established, `${label}.properties.leyoujia.established`),
      admissionScores: optionalText(apiShape ? apiLeyoujia?.admissionScores : properties.lyj_admission_scores, `${label}.properties.leyoujia.admissionScores`),
      nearbyEstates: requireStringArray(apiShape ? apiLeyoujia?.nearbyEstates ?? [] : properties.lyj_nearby_xq ?? [], `${label}.properties.leyoujia.nearbyEstates`),
    }
    const lockYears = apiShape ? properties.lockYears ?? null : properties.lock_years ?? null
    const holdYearsAdvised = apiShape ? properties.holdYearsAdvised ?? null : properties.hold_years_advised ?? null
    if (lockYears !== null && !Number.isSafeInteger(lockYears)) throw new Error(`${label}.properties.lockYears is invalid`)
    if (holdYearsAdvised !== null && !Number.isSafeInteger(holdYearsAdvised)) throw new Error(`${label}.properties.holdYearsAdvised is invalid`)
    const degreePolicyNote = optionalText(apiShape ? properties.degreePolicyNote : properties.degree_policy_note, `${label}.properties.degreePolicyNote`)
    if (feature?.geometry?.type !== 'Point') throw new Error(`${label}.geometry must be Point`)
    requireCoordinate(feature.geometry.coordinates, `${label}.geometry.coordinates`)
    schoolsById.set(id, {
      feature,
      normalized: {
        id,
        name,
        district,
        level,
        levelLabel,
        address,
        zoneText,
        zones,
        phones,
        sourceUrl,
        sourceYear,
        sourcePublished,
        groupName,
        leyoujia,
        lockYears,
        holdYearsAdvised,
        degreePolicyNote,
        coordinates: feature.geometry.coordinates,
      },
    })
    incrementDistrict(districtCounts, district)
  })

  const zoneIds = new Set()
  const zoneRecords = new Map()
  const invalidTopologyIds = new Set()
  const schoolOutsideZoneIds = new Set()
  const geometryDigests = new Map()
  let approximateZones = 0
  schoolZones.features.forEach((feature, index) => {
    const label = `schoolZones.features[${index}]`
    const properties = feature?.properties ?? {}
    const schoolId = apiShape
      ? requireText(properties.schoolId, `${label}.properties.schoolId`)
      : requireText(properties.school_id, `${label}.properties.school_id`)
    if (zoneIds.has(schoolId)) throw new Error(`Duplicate school zone id: ${schoolId}`)
    const school = schoolsById.get(schoolId)
    if (!school) throw new Error(`School zone references a missing school: ${schoolId}`)
    const name = requireText(properties.name, `${label}.properties.name`)
    const district = requireText(properties.district, `${label}.properties.district`)
    const level = requireText(properties.level, `${label}.properties.level`)
    const levelLabel = requireText(apiShape ? properties.levelLabel : properties.level_label, `${label}.properties.levelLabel`)
    const zones = requireStringArray(properties.zones, `${label}.properties.zones`)
    const method = requireText(properties.method ?? 'community-voronoi-approx', `${label}.properties.method`)
    if (district !== school.normalized.district) throw new Error(`School zone district mismatch for ${schoolId}`)
    if (level !== school.normalized.level) throw new Error(`School zone level mismatch for ${schoolId}`)
    const geometryState = validateAreaGeometry(feature.geometry, `${label}.geometry`)
    if (geometryState.selfIntersects) invalidTopologyIds.add(schoolId)
    if (!geometryState.rings.some((ring) => pointInRing(school.feature.geometry.coordinates, ring))) {
      schoolOutsideZoneIds.add(schoolId)
    }
    geometryDigests.set(schoolId, contentDigest({
      schoolPoint: school.feature.geometry.coordinates,
      zoneGeometry: feature.geometry,
    }))
    if (method.includes('approx')) approximateZones += 1
    zoneRecords.set(schoolId, {
      schoolId,
      name,
      district,
      level,
      levelLabel,
      zones,
      method,
      geometry: feature.geometry,
    })
    zoneIds.add(schoolId)
  })

  const missingZones = [...schoolsById.keys()].filter((id) => !zoneIds.has(id))
  if (missingZones.length) throw new Error(`Schools without matching zones: ${missingZones.slice(0, 10).join(', ')}`)

  const records = new Map([...schoolsById].map(([id, school]) => [id, {
    sourcePublished: school.normalized.sourcePublished,
    digest: contentDigest({ school: school.normalized, zone: zoneRecords.get(id) }),
  }]))

  return {
    schoolCount: schoolsById.size,
    schoolZoneCount: zoneIds.size,
    approximateZones,
    schoolIds: new Set(schoolsById.keys()),
    districtCounts,
    records,
    invalidTopologyIds,
    schoolOutsideZoneIds,
    geometryDigests,
  }
}

export function validateSchoolContinuity(localSummary, remoteSummary, options = {}) {
  const { allowIdReplacements = false, allowContentChanges = false, allowGeometryWarnings = false } = options
  for (const [district, remoteCount] of remoteSummary.districtCounts) {
    const localCount = localSummary.districtCounts.get(district) ?? 0
    if (localCount < remoteCount) {
      throw new Error(`Refusing a school-count drop in ${district}: local ${localCount}, production ${remoteCount}`)
    }
  }
  if (!allowIdReplacements) {
    const removed = [...remoteSummary.schoolIds].filter((id) => !localSummary.schoolIds.has(id))
    if (removed.length) {
      throw new Error(`Refusing school ID replacements without ALLOW_SCHOOL_ID_REPLACEMENTS=1: ${removed.slice(0, 10).join(', ')}`)
    }
  }
  for (const [id, remote] of remoteSummary.records) {
    const local = localSummary.records.get(id)
    if (!local) continue
    const localPublished = Date.parse(local.sourcePublished)
    const remotePublished = Date.parse(remote.sourcePublished)
    if (localPublished < remotePublished) {
      throw new Error(`Refusing older school data for ${id}: local ${local.sourcePublished}, production ${remote.sourcePublished}`)
    }
    if (localPublished === remotePublished && local.digest !== remote.digest && !allowContentChanges) {
      throw new Error(`Refusing unreviewed school changes for ${id} without ALLOW_SCHOOL_CONTENT_CHANGES=1`)
    }
  }
  if (!allowGeometryWarnings) {
    const changedWarning = (localIds, remoteIds) => [...localIds].filter((id) => (
      !remoteIds.has(id)
      || localSummary.geometryDigests.get(id) !== remoteSummary.geometryDigests.get(id)
    ))
    const invalidTopology = changedWarning(localSummary.invalidTopologyIds, remoteSummary.invalidTopologyIds)
    if (invalidTopology.length) {
      throw new Error(`Refusing new or changed self-intersecting school zones: ${invalidTopology.slice(0, 10).join(', ')}`)
    }
    const outsideZones = changedWarning(localSummary.schoolOutsideZoneIds, remoteSummary.schoolOutsideZoneIds)
    if (outsideZones.length) {
      throw new Error(`Refusing new or changed school points outside their zones: ${outsideZones.slice(0, 10).join(', ')}`)
    }
  }
}
