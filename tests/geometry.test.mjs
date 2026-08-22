import assert from 'node:assert/strict'
import test from 'node:test'
import {
  geometryBounds,
  intersectsViewport,
  outerRings,
  pointInArea,
  pointInRing,
  simplifyRing,
} from '../uniapp/src/utils/geometry.ts'

const square = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]

test('pointInRing inside', () => {
  assert.equal(pointInRing(5, 5, square), true)
})

test('pointInRing outside', () => {
  assert.equal(pointInRing(15, 5, square), false)
  assert.equal(pointInRing(-1, -1, square), false)
})

test('outerRings polygon returns only the outer ring', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]], [[2, 2], [3, 2], [3, 3], [2, 2]]],
  }
  const rings = outerRings(geometry)
  assert.equal(rings.length, 1)
  assert.deepEqual(rings[0], [[0, 0], [1, 0], [1, 1], [0, 0]])
})

test('outerRings multipolygon', () => {
  const geometry = {
    type: 'MultiPolygon',
    coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]],
  }
  assert.equal(outerRings(geometry).length, 2)
})

test('geometryBounds spans extents', () => {
  const geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }
  assert.deepEqual(geometryBounds(geometry), { west: 0, south: 0, east: 10, north: 10 })
})

test('intersectsViewport overlap and miss', () => {
  const bounds = { west: 0, south: 0, east: 10, north: 10 }
  const overlapping = { west: 5, south: 5, east: 15, north: 15, zoom: 10 }
  const missing = { west: 50, south: 50, east: 60, north: 60, zoom: 10 }
  assert.equal(intersectsViewport(bounds, overlapping), true)
  assert.equal(intersectsViewport(bounds, missing), false)
})

test('pointInArea respects holes', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  }
  assert.equal(pointInArea(1, 1, geometry), true)
  assert.equal(pointInArea(5, 5, geometry), false)
})

test('simplifyRing drops interior collinear points but keeps endpoints', () => {
  const ring = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [0, 0]]
  const output = simplifyRing(ring, 0.5)
  assert.equal(output[0][0], 0)
  assert.equal(output[0][1], 0)
  assert.equal(output.length, 4)
})

test('simplifyRing closes the simplified ring', () => {
  const ring = [[0, 0], [5, 0], [10, 0], [10, 5], [0, 0]]
  const output = simplifyRing(ring, 1)
  assert.deepEqual(output[output.length - 1], output[0])
})
