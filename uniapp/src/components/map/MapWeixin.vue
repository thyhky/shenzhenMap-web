<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  Bounds,
  MapItem,
  MapSelection,
  MapViewport,
  Position,
  SchoolFeature,
  SchoolZoneFeature,
  StreetFeature,
} from '@/domain/types'
import { getCachedSchools, getCachedSchoolZones, getCachedStreetBoundaries } from '@/services/api'
import { gcj02ToWgs84, wgs84ToGcj02 } from '@/utils/coordinates'
import {
  geometryBounds,
  intersectsViewport,
  outerRings,
  pointInRing,
  simplifyRing,
} from '@/utils/geometry'

const props = defineProps<{
  latitude: number
  longitude: number
  zoom: number
  items: MapItem[]
  layerRevision: number
  showBoundaries: boolean
  showSchools: boolean
  showSchoolZones: boolean
  focusBounds: Bounds | null
  focusRevision: number
  selected: MapSelection | null
  selectionRevision: number
  showSelectionPopup: boolean
}>()

const emit = defineEmits<{
  select: [item: MapSelection]
  focus: [view: { latitude: number; longitude: number; zoom: number }]
  'viewport-change': [viewport: MapViewport]
}>()

const componentInstance = getCurrentInstance()?.proxy
const windowInfo = wx.getWindowInfo()
let mapContext: UniNamespace.MapContext | null = null
let regionTimer: ReturnType<typeof setTimeout> | null = null
let tapTimer: ReturnType<typeof setTimeout> | null = null
let pendingTapAt = 0
let pendingTapSource: 'map' | 'marker' | null = null
let pendingTapAction: (() => void) | null = null
let suppressMapTapUntil = 0
let suppressViewportEmitUntil = 0
const lastViewport = ref<MapViewport | null>(null)

const DOUBLE_TAP_WINDOW_MS = 260
const MARKER_TAP_GUARD_MS = 120
const PROGRAM_VIEWPORT_GUARD_MS = 700

const priceBands = [35000, 50000, 70000, 90000, 120000]
const colors = ['#2f5fb3', '#10a09a', '#79a82f', '#e3b657', '#df7b45', '#bb3e45']

function priceColor(price: number | null) {
  if (!price) return '#7b8787'
  const index = priceBands.findIndex((limit) => price < limit)
  return colors[index === -1 ? colors.length - 1 : index]
}

function priceFillColor(price: number | null) {
  if (!price) return '#b7c0bd'
  if (price < 35000) return '#9cb7e6'
  if (price < 50000) return '#8ed8d2'
  if (price < 70000) return '#bfd98f'
  if (price < 90000) return '#ecd28f'
  if (price < 120000) return '#eab08f'
  return '#df9297'
}

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}

function selectionCoordinate(item: MapSelection): { latitude: number; longitude: number } | null {
  if ('kind' in item) return wgs84ToGcj02(item.lat, item.lng)
  const { geometry } = item
  if (geometry.type === 'Point') {
    const [longitude, latitude] = geometry.coordinates
    return wgs84ToGcj02(latitude, longitude)
  }
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0]
  const latitudes = ring.map(([, latitude]) => latitude)
  const longitudes = ring.map(([longitude]) => longitude)
  return wgs84ToGcj02(
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  )
}

function selectionCallout(item: MapSelection): { title: string; lines: string[] } {
  if ('kind' in item) {
    if (item.kind === 'cluster') {
      return {
        title: `${item.count} 个小区`,
        lines: [
          `${item.pricedCount} 个有有效价格`,
          `均价 ${priceText(item.avgPrice)}`,
          '地图已放大，可继续选择具体小区',
        ],
      }
    }
    return {
      title: item.name,
      lines: [
        `均价 ${priceText(item.price)}`,
        `租售比 ${item.rentYield == null ? '暂无数据' : `${item.rentYield.toFixed(2)}%`}`,
        `${item.district} · ${item.street}`,
      ],
    }
  }
  if (item.geometry.type === 'Point') {
    return {
      title: item.properties.name,
      lines: [`${item.properties.levelLabel} · ${item.properties.district}`, '点击查看招生范围与咨询电话'],
    }
  }
  return {
    title: item.properties.name,
    lines: [`${item.properties.levelLabel} · ${item.properties.district}`, '查看招生范围'],
  }
}

function itemRadius(item: MapItem) {
  if (item.kind === 'cluster') return Math.min(1100, 160 + Math.sqrt(item.count) * 32)
  return Math.max(12, Math.min(70, 70 / Math.pow(2, Math.max(0, props.zoom - 12) / 2)))
}

const mapCenter = computed(() => wgs84ToGcj02(props.latitude, props.longitude))
const activeBoundaries = computed(() => {
  void props.layerRevision
  return props.showBoundaries ? getCachedStreetBoundaries() : null
})
const activeSchools = computed(() => {
  void props.layerRevision
  return props.showSchools ? getCachedSchools() : null
})
const activeSchoolZones = computed(() => {
  void props.layerRevision
  return props.showSchoolZones ? getCachedSchoolZones() : null
})
const visibleSchools = computed(() => {
  const viewport = lastViewport.value
  if (!activeSchools.value || !viewport) return []
  const margin = Math.max(viewport.east - viewport.west, viewport.north - viewport.south) * 0.03
  return activeSchools.value.features.filter((school) => {
    const [longitude, latitude] = school.geometry.coordinates
    return longitude >= viewport.west - margin
      && longitude <= viewport.east + margin
      && latitude >= viewport.south - margin
      && latitude <= viewport.north + margin
  })
})
const visibleMapItems = computed(() => (
  props.items.slice(0, Math.max(0, 980 - visibleSchools.value.length))
))
const estateCircles = computed(() => visibleMapItems.value.map((item) => {
  const coordinate = wgs84ToGcj02(item.lat, item.lng)
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    radius: itemRadius(item),
    color: priceColor(item.kind === 'cluster' ? item.avgPrice : item.price),
    fillColor: priceFillColor(item.kind === 'cluster' ? item.avgPrice : item.price),
    strokeWidth: 1,
  }
}))
const schoolCircles = computed(() => {
  return visibleSchools.value.map((school) => {
    const [longitude, latitude] = school.geometry.coordinates
    const coordinate = wgs84ToGcj02(latitude, longitude)
    return {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      radius: 170,
      color: school.properties.level === 'junior' ? '#c93f77' : '#6d3fc9',
      fillColor: school.properties.level === 'junior' ? '#f0c6d5' : '#d5c9f2',
      strokeWidth: 2,
    }
  })
})
const circles = computed(() => {
  const selected = selectedCircle.value
  return estateCircles.value.concat(schoolCircles.value, selected ? [selected] : [])
})

const polygonState = computed(() => {
  const viewport = lastViewport.value
  const empty = {
    overlays: [] as Array<{
      points: Array<{ latitude: number; longitude: number }>
      strokeColor: string
      fillColor: string
      strokeWidth: number
    }>,
    zoneHits: [] as Array<{ feature: SchoolZoneFeature; rings: Position[][] }>,
    streetHits: [] as Array<{ feature: StreetFeature; rings: Position[][] }>,
  }
  if (!viewport) return empty
  const items: Array<{
    points: Array<{ latitude: number; longitude: number }>
    strokeColor: string
    fillColor: string
    strokeWidth: number
  }> = []
  const tolerance = Math.max(
    (viewport.east - viewport.west) / Math.max(320, windowInfo.windowWidth),
    (viewport.north - viewport.south) / Math.max(480, windowInfo.windowHeight),
  ) * 1.5
  const ringIsVisible = (ring: Position[]) => {
    const bounds = {
      west: Math.min(...ring.map(([longitude]) => longitude)),
      south: Math.min(...ring.map(([, latitude]) => latitude)),
      east: Math.max(...ring.map(([longitude]) => longitude)),
      north: Math.max(...ring.map(([, latitude]) => latitude)),
    }
    return intersectsViewport(bounds, viewport)
  }
  const zoneGroups = (activeSchoolZones.value?.features ?? [])
    .map((feature) => ({ feature, rings: outerRings(feature.geometry).filter(ringIsVisible) }))
    .filter((group) => group.rings.length)
  const streetGroups = (activeBoundaries.value?.features ?? [])
    .map((feature) => ({ feature, rings: outerRings(feature.geometry).filter(ringIsVisible) }))
    .filter((group) => group.rings.length)
  const zoneRingCount = zoneGroups.reduce((total, group) => total + group.rings.length, 0)
  const streetRingCount = streetGroups.reduce((total, group) => total + group.rings.length, 0)
  const zonePointLimit = Math.max(4, Math.floor((streetRingCount ? 4000 : 6000) / Math.max(1, zoneRingCount)))
  const streetPointLimit = Math.max(4, Math.floor((zoneRingCount ? 2000 : 6000) / Math.max(1, streetRingCount)))
  const maxPolygons = 400
  const fitRing = (ring: Position[], pointLimit: number) => {
    const simplified = simplifyRing(ring, tolerance)
    if (simplified.length <= pointLimit) return simplified
    const closed = simplified[0][0] === simplified[simplified.length - 1][0]
      && simplified[0][1] === simplified[simplified.length - 1][1]
    const source = closed ? simplified.slice(0, -1) : simplified
    const slots = Math.max(3, pointLimit - (closed ? 1 : 0))
    const reduced = Array.from({ length: slots }, (_, index) => (
      source[Math.round(index * (source.length - 1) / Math.max(1, slots - 1))]
    ))
    if (closed) reduced.push(reduced[0])
    return reduced
  }
  const addRings = (
    rings: Position[][],
    pointLimit: number,
    strokeColor: string,
    fillColor: string,
    strokeWidth: number,
  ) => {
    const renderedRings: Position[][] = []
    rings.forEach((ring) => {
      if (items.length >= maxPolygons) return
      const simplified = fitRing(ring, pointLimit)
      if (simplified.length < 3) return
      renderedRings.push(simplified)
      items.push({
        points: simplified.map(([longitude, latitude]) => {
          const coordinate = wgs84ToGcj02(latitude, longitude)
          return {
            latitude: Number(coordinate.latitude.toFixed(6)),
            longitude: Number(coordinate.longitude.toFixed(6)),
          }
        }),
        strokeColor,
        fillColor,
        strokeWidth,
      })
    })
    return renderedRings
  }
  zoneGroups.forEach(({ feature, rings: sourceRings }) => {
    const junior = feature.properties.level === 'junior'
    const rings = addRings(
      sourceRings,
      zonePointLimit,
      junior ? '#c93f77' : '#6d3fc9',
      junior ? '#f8e4eb88' : '#eee9fa88',
      2,
    )
    if (rings.length) empty.zoneHits.push({ feature, rings })
  })
  streetGroups.forEach(({ feature, rings: sourceRings }) => {
    const rings = addRings(sourceRings, streetPointLimit, '#a85843aa', '#a8584308', 1)
    if (rings.length) empty.streetHits.push({ feature, rings })
  })
  empty.overlays = items
  return empty
})
const polygons = computed(() => polygonState.value.overlays)

interface WxMarker {
  id: number
  latitude: number
  longitude: number
  width: number
  height: number
  alpha: number
  label?: { content: string; color: string; fontSize: number; anchorX: number; anchorY: number }
  callout?: {
    content: string
    color: string
    fontSize: number
    borderRadius: number
    bgColor: string
    padding: number
    display: string
    textAlign: string
  }
}

const clusterItems = computed(() => visibleMapItems.value.filter((item) => item.kind === 'cluster'))
const clusterMarkers = computed<WxMarker[]>(() => clusterItems.value.map((item, index) => {
  const coordinate = wgs84ToGcj02(item.lat, item.lng)
  return {
    id: 1000000 + index,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    width: 1,
    height: 1,
    alpha: 0,
    label: {
      content: item.kind === 'cluster' ? String(item.count) : '',
      color: '#ffffff',
      fontSize: 10,
      anchorX: item.kind === 'cluster' && item.count >= 100 ? -9 : -6,
      anchorY: -5,
    },
  }
}))

const selectedMarker = computed<WxMarker | null>(() => {
  void props.selectionRevision
  if (!props.selected || !props.showSelectionPopup) return null
  const coordinate = selectionCoordinate(props.selected)
  if (!coordinate) return null
  const { title, lines } = selectionCallout(props.selected)
  return {
    id: 2000000,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    width: 1,
    height: 1,
    alpha: 0,
    callout: {
      content: [title, ...lines].join('\n'),
      color: '#17343a',
      fontSize: 12,
      borderRadius: 8,
      bgColor: '#fffdf8',
      padding: 10,
      display: 'ALWAYS',
      textAlign: 'left',
    },
  }
})

const selectedCircle = computed(() => {
  void props.selectionRevision
  if (!props.selected) return null
  const coordinate = selectionCoordinate(props.selected)
  if (!coordinate) return null
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    radius: 60,
    strokeColor: '#ffffff',
    strokeWidth: 3,
    color: '#b64c39',
    fillColor: '#b64c39',
    fillOpacity: 0.35,
  }
})

const markers = computed<WxMarker[]>(() => (
  clusterMarkers.value.concat(selectedMarker.value ? [selectedMarker.value] : [])
))

function selectItem(item: MapSelection) {
  emit('select', item)
  if (!('kind' in item) || item.kind !== 'cluster') return
  const focus = (zoom: number) => emit('focus', {
    latitude: item.lat,
    longitude: item.lng,
    zoom: Math.min(16, zoom + 2),
  })
  if (!mapContext) {
    focus(props.zoom)
    return
  }
  mapContext.getScale({
    success: (value) => focus(value.scale),
    fail: () => focus(props.zoom),
  })
}

function resetPendingTap() {
  pendingTapAt = 0
  pendingTapSource = null
  pendingTapAction = null
}

function queueSingleTap(action: () => void, source: 'map' | 'marker') {
  const now = Date.now()
  if (tapTimer && pendingTapSource === 'map' && source === 'marker'
    && now - pendingTapAt <= MARKER_TAP_GUARD_MS) {
    pendingTapSource = source
    pendingTapAction = action
    return
  }
  if (tapTimer && now - pendingTapAt <= DOUBLE_TAP_WINDOW_MS) {
    clearTimeout(tapTimer)
    tapTimer = null
    resetPendingTap()
    return
  }
  if (tapTimer) clearTimeout(tapTimer)
  pendingTapAt = now
  pendingTapSource = source
  pendingTapAction = action
  tapTimer = setTimeout(() => {
    tapTimer = null
    const nextAction = pendingTapAction
    resetPendingTap()
    nextAction?.()
  }, DOUBLE_TAP_WINDOW_MS)
}

function suppressViewportEmit(ms = PROGRAM_VIEWPORT_GUARD_MS) {
  suppressViewportEmitUntil = Math.max(suppressViewportEmitUntil, Date.now() + ms)
}

function markerTap(event: unknown) {
  const markerId = Number((event as { detail?: { markerId?: number } }).detail?.markerId)
  const index = markerId - 1000000
  const item = clusterItems.value[index]
  if (!item) return
  suppressMapTapUntil = Date.now() + MARKER_TAP_GUARD_MS
  queueSingleTap(() => selectItem(item), 'marker')
}

function mapTap(event: unknown) {
  const detail = (event as { detail?: { latitude?: number; longitude?: number } }).detail
  const gcjLatitude = Number(detail?.latitude)
  const gcjLongitude = Number(detail?.longitude)
  if (!Number.isFinite(gcjLatitude) || !Number.isFinite(gcjLongitude)) return
  const { latitude, longitude } = gcj02ToWgs84(gcjLatitude, gcjLongitude)
  if (Date.now() < suppressMapTapUntil) return
  queueSingleTap(() => handleMapHitForPoint(latitude, longitude), 'map')
}

function handleMapHitForPoint(latitude: number, longitude: number) {
  const threshold = lastViewport.value
    ? Math.max(
        (lastViewport.value.east - lastViewport.value.west) / Math.max(320, windowInfo.windowWidth),
        (lastViewport.value.north - lastViewport.value.south) / Math.max(480, windowInfo.windowHeight),
      ) * 24
    : 0.04 / Math.pow(2, props.zoom - 10)
  let nearestSchool: SchoolFeature | null = null
  let nearestSchoolDistance = Number.POSITIVE_INFINITY
  visibleSchools.value.forEach((school) => {
      const [schoolLongitude, schoolLatitude] = school.geometry.coordinates
      const distance = Math.hypot(schoolLatitude - latitude, schoolLongitude - longitude)
      if (distance < nearestSchoolDistance) {
        nearestSchool = school
        nearestSchoolDistance = distance
      }
  })
  if (nearestSchool && nearestSchoolDistance <= Math.max(threshold, 0.0018)) {
    selectItem(nearestSchool)
    return
  }
  let nearestItem: MapItem | null = null
  let nearestItemDistance = Number.POSITIVE_INFINITY
  visibleMapItems.value.forEach((item) => {
    const distance = Math.hypot(item.lat - latitude, item.lng - longitude)
    if (distance < nearestItemDistance) {
      nearestItem = item
      nearestItemDistance = distance
    }
  })
  if (nearestItem && nearestItemDistance <= threshold) {
    selectItem(nearestItem)
    return
  }
  if (polygonState.value.zoneHits.length) {
    const schools = getCachedSchools()
    const zones = polygonState.value.zoneHits
      .filter(({ rings }) => (
        rings.some((ring) => pointInRing(longitude, latitude, ring))
      ))
      .map(({ feature: zone }) => {
        const school = schools?.features.find((item) => item.properties.id === zone.properties.schoolId)
        const bounds = geometryBounds(zone.geometry)
        const zoneLongitude = school?.geometry.coordinates[0] ?? ((bounds?.west ?? longitude) + (bounds?.east ?? longitude)) / 2
        const zoneLatitude = school?.geometry.coordinates[1] ?? ((bounds?.south ?? latitude) + (bounds?.north ?? latitude)) / 2
        return { zone, school, distance: Math.hypot(zoneLatitude - latitude, zoneLongitude - longitude) }
      })
      .sort((left, right) => left.distance - right.distance)
    if (zones[0]) {
      selectItem(zones[0].school ?? zones[0].zone)
      return
    }
  }
  if (polygonState.value.streetHits.length && mapContext) {
    const street = polygonState.value.streetHits.find(({ rings }) => (
      rings.some((ring) => pointInRing(longitude, latitude, ring))
    ))
    if (!street) return
    const bounds = geometryBounds(street.feature.geometry)
    if (!bounds) return
    suppressViewportEmit()
    mapContext.includePoints({
      points: [
        wgs84ToGcj02(bounds.south, bounds.west),
        wgs84ToGcj02(bounds.north, bounds.east),
      ],
      padding: [40, 40, 130, 40],
    })
  }
}

function emitRegion(region: UniNamespace.MapContextGetRegionResult, scale: number, notify = true) {
  const zoom = Math.max(6, Math.min(18, Math.round(Number(scale || props.zoom))))
  const corners = [
    gcj02ToWgs84(region.southwest.latitude, region.southwest.longitude),
    gcj02ToWgs84(region.southwest.latitude, region.northeast.longitude),
    gcj02ToWgs84(region.northeast.latitude, region.southwest.longitude),
    gcj02ToWgs84(region.northeast.latitude, region.northeast.longitude),
  ]
  const center = gcj02ToWgs84(
    (region.southwest.latitude + region.northeast.latitude) / 2,
    (region.southwest.longitude + region.northeast.longitude) / 2,
  )
  lastViewport.value = {
    west: Math.min(...corners.map((item) => item.longitude)),
    south: Math.min(...corners.map((item) => item.latitude)),
    east: Math.max(...corners.map((item) => item.longitude)),
    north: Math.max(...corners.map((item) => item.latitude)),
    zoom,
    latitude: center.latitude,
    longitude: center.longitude,
  }
  if (notify) emit('viewport-change', lastViewport.value)
}

function readViewport(notify = true) {
  if (!mapContext) return
  let region: UniNamespace.MapContextGetRegionResult | null = null
  let scale: number | null = null
  const finish = () => {
    if (region && scale !== null) emitRegion(region, scale, notify)
  }
  mapContext.getRegion({
    success: (value) => {
      region = value
      finish()
    },
  })
  mapContext.getScale({
    success: (value) => {
      scale = value.scale
      finish()
    },
  })
}

function applyFocusBounds() {
  if (!mapContext || !props.focusBounds) return
  const bounds = props.focusBounds
  suppressViewportEmit()
  mapContext.includePoints({
    points: [
      wgs84ToGcj02(bounds.south, bounds.west),
      wgs84ToGcj02(bounds.north, bounds.east),
    ],
    padding: [90, 40, 140, 40],
  })
}

watch(() => props.focusRevision, applyFocusBounds)

function regionChange(event: unknown) {
  const source = event as {
    type?: string
    causedBy?: string
    detail?: {
      type?: string
      causedBy?: string
      scale?: number
      region?: UniNamespace.MapContextGetRegionResult
      detail?: {
        type?: string
        causedBy?: string
        scale?: number
        region?: UniNamespace.MapContextGetRegionResult
      }
    }
  }
  const raw = source.detail ?? {}
  const detail = raw.detail ?? raw
  const eventType = raw.type ?? detail.type ?? source.type
  if (eventType !== 'end') return
  const notify = Date.now() >= suppressViewportEmitUntil
  if (regionTimer) clearTimeout(regionTimer)
  regionTimer = setTimeout(() => {
    if (detail.region && detail.scale) {
      emitRegion(detail.region, detail.scale, notify)
      return
    }
    readViewport(notify)
  }, 300)
}

onMounted(async () => {
  await nextTick()
  mapContext = uni.createMapContext('atlas-map', componentInstance)
  regionTimer = setTimeout(readViewport, 300)
  applyFocusBounds()
})

onBeforeUnmount(() => {
  if (regionTimer) clearTimeout(regionTimer)
  if (tapTimer) clearTimeout(tapTimer)
  mapContext = null
})
</script>

<template>
  <map
    id="atlas-map"
    class="map-adapter"
    :latitude="mapCenter.latitude"
    :longitude="mapCenter.longitude"
    :scale="zoom"
    :circles="circles"
    :markers="markers"
    :polygons="polygons"
    enable-zoom
    enable-scroll
    @markertap="markerTap"
    @tap="mapTap"
    @regionchange="regionChange"
  />
</template>

<style scoped>
.map-adapter { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
