import type { AreaGeometry, Position, Viewport } from '@/domain/types'

export interface GeometryBounds {
  west: number
  south: number
  east: number
  north: number
}

export function outerRings(geometry: AreaGeometry): Position[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates[0]?.length ? [geometry.coordinates[0]] : []
  return geometry.coordinates
    .map((polygon) => polygon[0])
    .filter((ring): ring is Position[] => Boolean(ring?.length))
}

export function pointInRing(longitude: number, latitude: number, ring: Position[]) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index]
    const [previousLongitude, previousLatitude] = ring[previous]
    const intersects = (currentLatitude > latitude) !== (previousLatitude > latitude)
      && longitude < (previousLongitude - currentLongitude) * (latitude - currentLatitude)
        / ((previousLatitude - currentLatitude) || Number.EPSILON) + currentLongitude
    if (intersects) inside = !inside
  }
  return inside
}

export function pointInArea(longitude: number, latitude: number, geometry: AreaGeometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some((polygon) => (
    Boolean(polygon[0]?.length)
    && pointInRing(longitude, latitude, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole))
  ))
}

export function geometryBounds(geometry: AreaGeometry): GeometryBounds | null {
  const points = outerRings(geometry).flat()
  if (!points.length) return null
  return {
    west: Math.min(...points.map(([longitude]) => longitude)),
    south: Math.min(...points.map(([, latitude]) => latitude)),
    east: Math.max(...points.map(([longitude]) => longitude)),
    north: Math.max(...points.map(([, latitude]) => latitude)),
  }
}

export function intersectsViewport(bounds: GeometryBounds, viewport: Viewport) {
  return bounds.west <= viewport.east
    && bounds.east >= viewport.west
    && bounds.south <= viewport.north
    && bounds.north >= viewport.south
}

function squaredSegmentDistance(point: Position, start: Position, end: Position) {
  let longitude = start[0]
  let latitude = start[1]
  let deltaLongitude = end[0] - longitude
  let deltaLatitude = end[1] - latitude
  if (deltaLongitude !== 0 || deltaLatitude !== 0) {
    const offset = ((point[0] - longitude) * deltaLongitude + (point[1] - latitude) * deltaLatitude)
      / (deltaLongitude * deltaLongitude + deltaLatitude * deltaLatitude)
    if (offset > 1) {
      longitude = end[0]
      latitude = end[1]
    } else if (offset > 0) {
      longitude += deltaLongitude * offset
      latitude += deltaLatitude * offset
    }
  }
  deltaLongitude = point[0] - longitude
  deltaLatitude = point[1] - latitude
  return deltaLongitude * deltaLongitude + deltaLatitude * deltaLatitude
}

function simplifySection(points: Position[], first: number, last: number, tolerance: number, output: Position[]) {
  let maxDistance = tolerance
  let split = 0
  for (let index = first + 1; index < last; index += 1) {
    const distance = squaredSegmentDistance(points[index], points[first], points[last])
    if (distance > maxDistance) {
      split = index
      maxDistance = distance
    }
  }
  if (!split) return
  if (split - first > 1) simplifySection(points, first, split, tolerance, output)
  output.push(points[split])
  if (last - split > 1) simplifySection(points, split, last, tolerance, output)
}

export function simplifyRing(ring: Position[], tolerance: number) {
  if (ring.length <= 5 || tolerance <= 0) return ring
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const points = closed ? ring.slice(0, -1) : ring.slice()
  if (points.length <= 4) return ring
  const output = [points[0]]
  simplifySection(points, 0, points.length - 1, tolerance * tolerance, output)
  output.push(points[points.length - 1])
  if (output.length < 3) return ring
  if (closed) output.push(output[0])
  return output
}
