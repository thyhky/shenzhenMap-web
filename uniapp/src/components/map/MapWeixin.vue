<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted } from 'vue'
import type { MapItem, MapViewport } from '@/domain/types'
import { gcj02ToWgs84, wgs84ToGcj02 } from '@/utils/coordinates'

const props = defineProps<{
  latitude: number
  longitude: number
  zoom: number
  items: MapItem[]
}>()

const emit = defineEmits<{
  select: [item: MapItem]
  focus: [view: { latitude: number; longitude: number; zoom: number }]
  'viewport-change': [viewport: MapViewport]
}>()

const componentInstance = getCurrentInstance()?.proxy
let mapContext: UniNamespace.MapContext | null = null
let regionTimer: ReturnType<typeof setTimeout> | null = null
let lastViewport: MapViewport | null = null

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

function itemRadius(item: MapItem) {
  if (item.kind === 'cluster') return Math.min(1100, 160 + Math.sqrt(item.count) * 32)
  return Math.max(12, Math.min(70, 70 / Math.pow(2, Math.max(0, props.zoom - 12) / 2)))
}

const mapCenter = computed(() => wgs84ToGcj02(props.latitude, props.longitude))
const circles = computed(() => props.items.map((item) => {
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

const clusterItems = computed(() => props.items.filter((item) => item.kind === 'cluster'))
const markers = computed(() => clusterItems.value.map((item, index) => {
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

function selectItem(item: MapItem) {
  emit('select', item)
  if (item.kind !== 'cluster') return
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

function markerTap(event: unknown) {
  const markerId = Number((event as { detail?: { markerId?: number } }).detail?.markerId)
  const index = markerId - 1000000
  const item = clusterItems.value[index]
  if (item) selectItem(item)
}

function mapTap(event: unknown) {
  const detail = (event as { detail?: { latitude?: number; longitude?: number } }).detail
  const gcjLatitude = Number(detail?.latitude)
  const gcjLongitude = Number(detail?.longitude)
  if (!Number.isFinite(gcjLatitude) || !Number.isFinite(gcjLongitude)) return
  const { latitude, longitude } = gcj02ToWgs84(gcjLatitude, gcjLongitude)
  const system = uni.getSystemInfoSync()
  const threshold = lastViewport
    ? Math.max(
        (lastViewport.east - lastViewport.west) / Math.max(320, system.windowWidth),
        (lastViewport.north - lastViewport.south) / Math.max(480, system.windowHeight),
      ) * 24
    : 0.04 / Math.pow(2, props.zoom - 10)
  let nearest: MapItem | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  props.items.forEach((item) => {
    const distance = Math.hypot(item.lat - latitude, item.lng - longitude)
    if (distance < nearestDistance) {
      nearest = item
      nearestDistance = distance
    }
  })
  if (nearest && nearestDistance <= threshold) selectItem(nearest)
}

function emitRegion(region: UniNamespace.MapContextGetRegionResult, scale: number) {
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
  lastViewport = {
    west: Math.min(...corners.map((item) => item.longitude)),
    south: Math.min(...corners.map((item) => item.latitude)),
    east: Math.max(...corners.map((item) => item.longitude)),
    north: Math.max(...corners.map((item) => item.latitude)),
    zoom,
    latitude: center.latitude,
    longitude: center.longitude,
  }
  emit('viewport-change', lastViewport)
}

function readViewport() {
  if (!mapContext) return
  let region: UniNamespace.MapContextGetRegionResult | null = null
  let scale: number | null = null
  const finish = () => {
    if (region && scale !== null) emitRegion(region, scale)
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
  if (regionTimer) clearTimeout(regionTimer)
  regionTimer = setTimeout(() => {
    if (detail.region && detail.scale) {
      emitRegion(detail.region, detail.scale)
      return
    }
    readViewport()
  }, 300)
}

onMounted(async () => {
  await nextTick()
  mapContext = uni.createMapContext('atlas-map', componentInstance)
  regionTimer = setTimeout(readViewport, 300)
})

onBeforeUnmount(() => {
  if (regionTimer) clearTimeout(regionTimer)
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
