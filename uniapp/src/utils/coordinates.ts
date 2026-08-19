const PI = Math.PI
const AXIS = 6378245
const ECCENTRICITY = 0.006693421622965943

export interface Coordinate {
  latitude: number
  longitude: number
}

function outsideChina(latitude: number, longitude: number) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function transformLatitude(longitude: number, latitude: number) {
  let value = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude
    + 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude))
  value += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3
  value += (20 * Math.sin(latitude * PI) + 40 * Math.sin(latitude / 3 * PI)) * 2 / 3
  value += (160 * Math.sin(latitude / 12 * PI) + 320 * Math.sin(latitude * PI / 30)) * 2 / 3
  return value
}

function transformLongitude(longitude: number, latitude: number) {
  let value = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude
    + 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude))
  value += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3
  value += (20 * Math.sin(longitude * PI) + 40 * Math.sin(longitude / 3 * PI)) * 2 / 3
  value += (150 * Math.sin(longitude / 12 * PI) + 300 * Math.sin(longitude / 30 * PI)) * 2 / 3
  return value
}

export function wgs84ToGcj02(latitude: number, longitude: number): Coordinate {
  if (outsideChina(latitude, longitude)) return { latitude, longitude }
  const latitudeRadians = latitude / 180 * PI
  let magic = Math.sin(latitudeRadians)
  magic = 1 - ECCENTRICITY * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const latitudeOffset = transformLatitude(longitude - 105, latitude - 35) * 180
    / ((AXIS * (1 - ECCENTRICITY) / (magic * sqrtMagic)) * PI)
  const longitudeOffset = transformLongitude(longitude - 105, latitude - 35) * 180
    / (AXIS / sqrtMagic * Math.cos(latitudeRadians) * PI)
  return {
    latitude: latitude + latitudeOffset,
    longitude: longitude + longitudeOffset,
  }
}

export function gcj02ToWgs84(latitude: number, longitude: number): Coordinate {
  if (outsideChina(latitude, longitude)) return { latitude, longitude }
  let minLatitude = latitude - 0.01
  let maxLatitude = latitude + 0.01
  let minLongitude = longitude - 0.01
  let maxLongitude = longitude + 0.01
  let candidate = { latitude, longitude }
  for (let index = 0; index < 30; index += 1) {
    candidate = {
      latitude: (minLatitude + maxLatitude) / 2,
      longitude: (minLongitude + maxLongitude) / 2,
    }
    const converted = wgs84ToGcj02(candidate.latitude, candidate.longitude)
    const latitudeDelta = converted.latitude - latitude
    const longitudeDelta = converted.longitude - longitude
    if (Math.abs(latitudeDelta) < 1e-7 && Math.abs(longitudeDelta) < 1e-7) return candidate
    if (latitudeDelta > 0) maxLatitude = candidate.latitude
    else minLatitude = candidate.latitude
    if (longitudeDelta > 0) maxLongitude = candidate.longitude
    else minLongitude = candidate.longitude
  }
  return candidate
}
