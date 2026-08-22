import assert from 'node:assert/strict'
import test from 'node:test'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../uniapp/src/utils/coordinates.ts'

test('wgs84ToGcj02 is identity outside China', () => {
  const point = wgs84ToGcj02(0, 0)
  assert.equal(point.latitude, 0)
  assert.equal(point.longitude, 0)
})

test('wgs84ToGcj02 applies an offset inside China', () => {
  const point = wgs84ToGcj02(22.65, 114.07)
  assert.notEqual(point.latitude, 22.65)
  assert.notEqual(point.longitude, 114.07)
})

test('gcj02ToWgs84 round-trips within tolerance', () => {
  const original = { latitude: 22.65, longitude: 114.07 }
  const converted = wgs84ToGcj02(original.latitude, original.longitude)
  const back = gcj02ToWgs84(converted.latitude, converted.longitude)
  assert.ok(Math.abs(back.latitude - original.latitude) < 1e-5)
  assert.ok(Math.abs(back.longitude - original.longitude) < 1e-5)
})

test('gcj02ToWgs84 is identity outside China', () => {
  const point = gcj02ToWgs84(0, 0)
  assert.equal(point.latitude, 0)
  assert.equal(point.longitude, 0)
})
