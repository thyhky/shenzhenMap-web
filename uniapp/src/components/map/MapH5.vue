<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  MapItem,
  MapSelection,
  MapViewport,
  SchoolFeatureCollection,
  SchoolZoneFeature,
  SchoolZoneFeatureCollection,
  StreetFeature,
  StreetFeatureCollection,
} from '@/domain/types'

const props = defineProps<{
  latitude: number
  longitude: number
  zoom: number
  items: MapItem[]
  boundaries: StreetFeatureCollection | null
  schools: SchoolFeatureCollection | null
  schoolZones: SchoolZoneFeatureCollection | null
  showBoundaries: boolean
  showSchools: boolean
  showSchoolZones: boolean
}>()

const emit = defineEmits<{
  select: [item: MapSelection]
  'viewport-change': [viewport: MapViewport]
}>()

const mapRoot = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let pointsLayer: L.LayerGroup | null = null
let boundaryLayer: L.GeoJSON | null = null
let schoolLayer: L.LayerGroup | null = null
let schoolZoneLayer: L.GeoJSON | null = null
let viewportTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null

const priceBands = [35000, 50000, 70000, 90000, 120000]
const colors = ['#2f5fb3', '#10a09a', '#79a82f', '#e3b657', '#df7b45', '#bb3e45']

function priceColor(price: number | null) {
  if (!price) return '#f7f1e6'
  const index = priceBands.findIndex((limit) => price < limit)
  return colors[index === -1 ? colors.length - 1 : index]
}

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}

function popupContent(title: string, lines: string[]) {
  const root = document.createElement('div')
  root.className = 'uni-map-popup'
  const heading = document.createElement('strong')
  heading.textContent = title
  root.appendChild(heading)
  lines.forEach((line) => {
    const row = document.createElement('span')
    row.textContent = line
    root.appendChild(row)
  })
  return root
}

function drawPoints() {
  if (!map || !pointsLayer) return
  const currentMap = map
  const targetLayer = pointsLayer
  targetLayer.clearLayers()
  props.items.forEach((item) => {
    if (item.kind === 'cluster') {
      const marker = L.circleMarker([item.lat, item.lng], {
        pane: 'estatePoints',
        radius: 7 + Math.min(9, Math.sqrt(item.count) * 0.9),
        color: '#18343b',
        weight: 1,
        fillColor: priceColor(item.avgPrice),
        fillOpacity: 0.55,
      })
      marker.bindPopup(popupContent(`${item.count} 个小区`, [
        `${item.pricedCount} 个有有效价格`,
        `均价 ${priceText(item.avgPrice)}`,
        '继续放大查看具体小区',
      ]))
      marker.bindTooltip(String(item.count), {
        permanent: true,
        direction: 'center',
        className: 'uni-cluster-count',
      })
      marker.on('click', () => {
        emit('select', item)
        map?.setView([item.lat, item.lng], Math.min(16, (map?.getZoom() ?? props.zoom) + 2))
      })
      marker.addTo(targetLayer)
      return
    }

    const marker = L.circleMarker([item.lat, item.lng], {
      pane: 'estatePoints',
      radius: 3 + Math.max(0, currentMap.getZoom() - 12) * 0.5,
      color: '#17343a',
      weight: 1,
      fillColor: priceColor(item.price),
      fillOpacity: 0.85,
    })
    marker.bindPopup(popupContent(item.name, [
      priceText(item.price),
      `${item.district} · ${item.street}`,
    ]))
    marker.on('click', () => emit('select', item))
    if (currentMap.getZoom() >= 15) {
      marker.bindTooltip(item.name, {
        direction: 'top',
        offset: [0, -7],
        className: 'uni-estate-label',
      })
    }
    marker.addTo(targetLayer)
  })
}

function drawBoundaries() {
  if (!boundaryLayer) return
  boundaryLayer.clearLayers()
  if (props.showBoundaries && props.boundaries) {
    boundaryLayer.addData(props.boundaries as unknown as GeoJSON.FeatureCollection)
  }
}

function schoolIcon(level: 'primary' | 'junior') {
  return L.divIcon({
    className: 'uni-school-marker-wrap',
    html: `<span class="uni-school-marker uni-school-marker--${level}"></span>`,
    iconSize: [18, 26],
    iconAnchor: [9, 25],
    popupAnchor: [0, -24],
    tooltipAnchor: [0, -18],
  })
}

function drawSchools() {
  if (!map || !schoolLayer) return
  const currentMap = map
  const targetLayer = schoolLayer
  targetLayer.clearLayers()
  if (!props.showSchools || !props.schools) return
  props.schools.features.forEach((school) => {
    const [longitude, latitude] = school.geometry.coordinates
    const marker = L.marker([latitude, longitude], {
      icon: schoolIcon(school.properties.level),
      riseOnHover: true,
    })
    marker.bindPopup(popupContent(school.properties.name, [
      `${school.properties.levelLabel} · ${school.properties.district}`,
      `官方招生社区 ${school.properties.zones.length} 个`,
      '点击查看招生范围与咨询电话',
    ]))
    marker.on('click', () => emit('select', school))
    if (currentMap.getZoom() >= 15) {
      marker.bindTooltip(school.properties.name, {
        direction: 'top',
        offset: [0, -20],
        className: 'uni-school-label',
      })
    }
    marker.addTo(targetLayer)
  })
}

function drawSchoolZones() {
  if (!schoolZoneLayer) return
  schoolZoneLayer.clearLayers()
  if (props.showSchoolZones && props.schoolZones) {
    schoolZoneLayer.addData(props.schoolZones as unknown as GeoJSON.FeatureCollection)
  }
}

function emitViewport() {
  if (!map) return
  const bounds = map.getBounds()
  const center = map.getCenter()
  emit('viewport-change', {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
    zoom: map.getZoom(),
    latitude: center.lat,
    longitude: center.lng,
  })
}

function scheduleViewport() {
  if (viewportTimer) clearTimeout(viewportTimer)
  viewportTimer = setTimeout(emitViewport, 180)
}

watch(() => props.items, drawPoints)
watch([() => props.boundaries, () => props.showBoundaries], drawBoundaries)
watch([() => props.schools, () => props.showSchools], drawSchools)
watch([() => props.schoolZones, () => props.showSchoolZones], drawSchoolZones)
watch(
  () => [props.latitude, props.longitude, props.zoom] as const,
  ([latitude, longitude, zoom]) => {
    if (!map) return
    const center = map.getCenter()
    if (Math.abs(center.lat - latitude) < 1e-6
      && Math.abs(center.lng - longitude) < 1e-6
      && map.getZoom() === zoom) return
    map.setView([latitude, longitude], zoom)
  },
)

onMounted(async () => {
  await nextTick()
  if (!mapRoot.value) return
  map = L.map(mapRoot.value, {
    preferCanvas: true,
    zoomControl: false,
    minZoom: 6,
    maxZoom: 18,
  }).setView([props.latitude, props.longitude], props.zoom)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  map.createPane('streetBoundaries').style.zIndex = '410'
  map.createPane('schoolZones').style.zIndex = '420'
  map.createPane('estatePoints').style.zIndex = '450'
  boundaryLayer = L.geoJSON(undefined, {
    pane: 'streetBoundaries',
    style: {
      color: '#a85843',
      weight: 1,
      opacity: 0.66,
      fillOpacity: 0.015,
    },
    onEachFeature: (feature, layer) => {
      const street = feature as unknown as StreetFeature
      const details = street.properties
      layer.bindTooltip(popupContent(details.name, [
        details.district,
        `${details.estates} 个小区 · ${details.priced} 个有价`,
        `均价 ${priceText(details.avgPrice)}`,
      ]), { sticky: true, className: 'uni-boundary-label' })
      layer.on('click', () => {
        if (details.estates && map && 'getBounds' in layer) {
          map.fitBounds((layer as L.Polygon).getBounds(), { padding: [40, 40] })
        }
      })
    },
  }).addTo(map)
  schoolZoneLayer = L.geoJSON(undefined, {
    pane: 'schoolZones',
    style: (feature) => ({
      color: (feature as unknown as SchoolZoneFeature).properties.level === 'junior' ? '#c93f77' : '#6d3fc9',
      weight: 1.5,
      opacity: 0.75,
      fillOpacity: 0.18,
    }),
    onEachFeature: (feature, layer) => {
      const zone = feature as unknown as SchoolZoneFeature
      const details = zone.properties
      layer.bindPopup(popupContent(details.name, [
        `${details.levelLabel} · ${details.district}`,
        `覆盖 ${details.zones.length} 个招生社区`,
        details.method === 'official-boundary' ? '官方划片边界' : '基于招生社区名称的近似范围',
      ]))
      layer.bindTooltip(details.name, { sticky: true, className: 'uni-school-label' })
      layer.on('click', () => {
        const school = props.schools?.features.find((item) => item.properties.id === details.schoolId)
        emit('select', school ?? zone)
      })
    },
  }).addTo(map)
  pointsLayer = L.layerGroup().addTo(map)
  schoolLayer = L.layerGroup().addTo(map)
  map.on('moveend', scheduleViewport)
  map.on('zoomend', () => {
    drawPoints()
    drawSchools()
    scheduleViewport()
  })
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
  resizeObserver.observe(mapRoot.value)
  drawPoints()
  drawBoundaries()
  drawSchools()
  drawSchoolZones()
  emitViewport()
})

onBeforeUnmount(() => {
  if (viewportTimer) clearTimeout(viewportTimer)
  resizeObserver?.disconnect()
  map?.remove()
  map = null
  pointsLayer = null
  boundaryLayer = null
  schoolLayer = null
  schoolZoneLayer = null
})
</script>

<template>
  <view ref="mapRoot" class="map-adapter map-h5" />
</template>

<style>
.map-adapter.map-h5 { position: absolute; z-index: 0; inset: 0; overflow: hidden; background: #d8d1c3; }
.map-h5.leaflet-container { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
.map-h5 .leaflet-control-attribution { margin-bottom: calc(104rpx + env(safe-area-inset-bottom)); font-size: 9px; }
.map-h5 .leaflet-control-zoom { margin-right: 12px !important; margin-bottom: calc(122rpx + env(safe-area-inset-bottom)) !important; border: 0 !important; box-shadow: 0 5px 18px rgba(18, 39, 43, 0.2) !important; }
.map-h5 .leaflet-control-zoom a { border-color: rgba(23, 52, 58, 0.16) !important; background: #fbf7ef !important; color: #17343a !important; }
.uni-map-popup { display: grid; gap: 3px; min-width: 150px; color: #17343a; }
.uni-map-popup strong { font-size: 15px; }
.uni-map-popup span { color: #53666a; font-size: 12px; }
.uni-estate-label { border: 1px solid rgba(23, 52, 58, 0.16) !important; border-radius: 5px !important; background: rgba(253, 249, 240, 0.92) !important; color: #17343a !important; box-shadow: none !important; }
.uni-estate-label::before { display: none; }
.uni-cluster-count { border: 0 !important; background: transparent !important; color: #fff !important; box-shadow: none !important; font: 700 10px/1 Consolas, monospace !important; text-shadow: 0 1px 2px rgba(16, 43, 46, 0.45); pointer-events: none !important; }
.uni-cluster-count::before { display: none !important; }
.uni-boundary-label { border: 1px solid rgba(168, 88, 67, 0.35) !important; border-radius: 5px !important; background: rgba(253, 249, 240, 0.94) !important; box-shadow: none !important; }
.uni-school-label { border: 1px solid rgba(90, 60, 160, 0.45) !important; border-radius: 5px !important; background: rgba(249, 246, 255, 0.95) !important; color: #3c2f6e !important; box-shadow: none !important; font-size: 10px !important; }
.uni-school-label::before { display: none; }
.uni-school-marker-wrap { border: 0; background: transparent; }
.uni-school-marker { position: relative; display: block; width: 18px; height: 18px; border: 2px solid #fff; border-radius: 50% 50% 50% 0; box-shadow: 0 2px 6px rgba(24, 43, 47, 0.35); transform: rotate(-45deg); }
.uni-school-marker::after { position: absolute; inset: 4px; border-radius: 50%; background: rgba(255, 255, 255, 0.92); content: ''; }
.uni-school-marker--primary { background: #6d3fc9; }
.uni-school-marker--junior { background: #c93f77; }
</style>
