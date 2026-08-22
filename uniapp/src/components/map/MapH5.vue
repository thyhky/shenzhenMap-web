<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  MapItem,
  MapSelection,
  MapViewport,
  Bounds,
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
  focusBounds: Bounds | null
  focusRevision: number
  selected: MapSelection | null
  selectionRevision: number
  showSelectionPopup: boolean
}>()

const emit = defineEmits<{
  select: [item: MapSelection]
  details: []
  'viewport-change': [viewport: MapViewport]
}>()

const mapRoot = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let pointsLayer: L.LayerGroup | null = null
let boundaryLayer: L.GeoJSON | null = null
let schoolLayer: L.LayerGroup | null = null
let schoolZoneLayer: L.GeoJSON | null = null
let selectionLayer: L.LayerGroup | null = null
let viewportTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let lastDrawZoom = -1

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

function popupContent(title: string, lines: string[], action?: { label: string; run: () => void }) {
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
  if (action) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'uni-map-popup-action'
    button.textContent = action.label
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      action.run()
    })
    root.appendChild(button)
  }
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

function selectionCenter(item: MapSelection): L.LatLngExpression | null {
  if ('kind' in item) return [item.lat, item.lng]
  if (item.geometry.type === 'Point') {
    const [longitude, latitude] = item.geometry.coordinates
    return [latitude, longitude]
  }
  const bounds = L.geoJSON(item as unknown as GeoJSON.Feature).getBounds()
  return bounds.isValid() ? bounds.getCenter() : null
}

function selectionDetails(item: MapSelection) {
  if ('kind' in item) {
    if (item.kind === 'cluster') {
      return {
        title: `${item.count} 个小区`,
        lines: [
          `${item.pricedCount} 个有有效价格`,
          `均价 ${priceText(item.avgPrice)}`,
          '地图已放大，可继续选择具体小区',
        ],
        hasDetails: false,
      }
    }
    return {
      title: item.name,
      lines: [
        `均价 ${priceText(item.price)}`,
        `租售比 ${item.rentYield === null ? '暂无数据' : `${item.rentYield.toFixed(2)}%`}`,
        `${item.district} · ${item.street}`,
      ],
      hasDetails: true,
    }
  }
  return {
    title: item.properties.name,
    lines: [
      `${item.properties.levelLabel} · ${item.properties.district}`,
      `官方招生社区 ${item.properties.zones.length} 个`,
      item.geometry.type === 'Point'
        ? '查看招生范围与咨询电话'
        : 'method' in item.properties && item.properties.method === 'official-boundary'
          ? '官方划片边界'
          : '近似招生范围',
    ],
    hasDetails: true,
  }
}

function drawSelection() {
  if (!map || !selectionLayer) return
  const targetLayer = selectionLayer
  targetLayer.clearLayers()
  if (!props.selected) return
  const center = selectionCenter(props.selected)
  if (!center) return
  const details = selectionDetails(props.selected)
  const marker = L.circleMarker(center, {
    pane: 'selectedPoint',
    radius: 11,
    color: '#ffffff',
    weight: 3,
    fillColor: '#b64c39',
    fillOpacity: 0.8,
    interactive: false,
  }).addTo(targetLayer)
  if (!props.showSelectionPopup) return
  marker.bindPopup(popupContent(
    details.title,
    details.lines,
    details.hasDetails ? { label: '查看详情', run: () => emit('details') } : undefined,
  ), {
    className: 'uni-selection-popup',
    closeButton: true,
    closeOnClick: false,
    autoClose: false,
    autoPanPaddingTopLeft: [24, 88],
    autoPanPaddingBottomRight: [24, 130],
  })
  marker.openPopup()
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
  [() => props.selected, () => props.selectionRevision, () => props.showSelectionPopup],
  drawSelection,
)
watch(() => props.focusRevision, () => {
  if (!map || !props.focusBounds) return
  const bounds = props.focusBounds
  if (bounds.west === bounds.east && bounds.south === bounds.north) {
    map.setView([bounds.south, bounds.west], 15)
    return
  }
  const mobile = window.innerWidth <= 900
  map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], {
    paddingTopLeft: [32, mobile ? 120 : 32],
    paddingBottomRight: [32, mobile ? 140 : 32],
    maxZoom: 15,
  })
})
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
  const selectedPane = map.createPane('selectedPoint')
  selectedPane.style.zIndex = '480'
  selectedPane.style.pointerEvents = 'none'
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
      layer.bindTooltip(details.name, { sticky: true, className: 'uni-school-label' })
      layer.on('click', () => {
        const school = props.schools?.features.find((item) => item.properties.id === details.schoolId)
        emit('select', school ?? zone)
      })
    },
  }).addTo(map)
  pointsLayer = L.layerGroup().addTo(map)
  schoolLayer = L.layerGroup().addTo(map)
  selectionLayer = L.layerGroup().addTo(map)
  map.on('moveend', scheduleViewport)
  map.on('zoomend', () => {
    if (map && map.getZoom() !== lastDrawZoom) {
      lastDrawZoom = map.getZoom()
      drawPoints()
      drawSchools()
    }
    scheduleViewport()
  })
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
  resizeObserver.observe(mapRoot.value)
  drawPoints()
  drawBoundaries()
  drawSchools()
  drawSchoolZones()
  drawSelection()
  lastDrawZoom = map.getZoom()
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
  selectionLayer = null
})
</script>

<template>
  <div ref="mapRoot" class="map-adapter map-h5" />
</template>

<style>
.map-adapter.map-h5 { position: absolute; z-index: 0; inset: 0; overflow: hidden; background: #d8d1c3; }
:global(.map-h5.leaflet-container) { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
:global(.map-h5 .leaflet-control-attribution) { margin-bottom: calc(104rpx + env(safe-area-inset-bottom)); font-size: 9px; }
:global(.map-h5 .leaflet-control-zoom) { margin-right: 12px !important; margin-bottom: calc(122rpx + env(safe-area-inset-bottom)) !important; border: 0 !important; box-shadow: 0 5px 18px rgba(18, 39, 43, 0.2) !important; }
:global(.map-h5 .leaflet-control-zoom a) { border-color: rgba(23, 52, 58, 0.16) !important; background: #fbf7ef !important; color: #17343a !important; }
:global(.uni-map-popup) { display: grid; gap: 3px; min-width: 150px; color: #17343a; }
:global(.uni-map-popup strong) { font-size: 15px; }
:global(.uni-map-popup span) { color: #53666a; font-size: 12px; }
:global(.uni-map-popup-action) { min-height: 32px; margin: 5px 0 0; border: 0; border-radius: 5px; background: #17343a; padding: 7px 11px; color: #fff; font: 700 12px/1.2 "Microsoft YaHei", sans-serif; cursor: pointer; }
:global(.uni-map-popup-action:focus-visible) { outline: 2px solid #b64c39; outline-offset: 2px; }
:global(.uni-selection-popup .leaflet-popup-content-wrapper) { border: 1px solid rgba(23, 52, 58, 0.15); border-radius: 8px; background: #fffdf8; box-shadow: 0 8px 28px rgba(18, 42, 46, 0.2); }
:global(.uni-selection-popup .leaflet-popup-tip) { background: #fffdf8; }
:global(.uni-estate-label) { border: 1px solid rgba(23, 52, 58, 0.16) !important; border-radius: 5px !important; background: rgba(253, 249, 240, 0.92) !important; color: #17343a !important; box-shadow: none !important; }
:global(.uni-estate-label::before) { display: none; }
:global(.uni-cluster-count) { border: 0 !important; background: transparent !important; color: #fff !important; box-shadow: none !important; font: 700 10px/1 Consolas, monospace !important; text-shadow: 0 1px 2px rgba(16, 43, 46, 0.45); pointer-events: none !important; }
:global(.uni-cluster-count::before) { display: none !important; }
:global(.uni-boundary-label) { border: 1px solid rgba(168, 88, 67, 0.35) !important; border-radius: 5px !important; background: rgba(253, 249, 240, 0.94) !important; box-shadow: none !important; }
:global(.uni-school-label) { border: 1px solid rgba(90, 60, 160, 0.45) !important; border-radius: 5px !important; background: rgba(249, 246, 255, 0.95) !important; color: #3c2f6e !important; box-shadow: none !important; font-size: 10px !important; }
:global(.uni-school-label::before) { display: none; }
:global(.uni-school-marker-wrap) { border: 0; background: transparent; }
:global(.uni-school-marker) { position: relative; display: block; width: 18px; height: 18px; border: 2px solid #fff; border-radius: 50% 50% 50% 0; box-shadow: 0 2px 6px rgba(24, 43, 47, 0.35); transform: rotate(-45deg); }
:global(.uni-school-marker::after) { position: absolute; inset: 4px; border-radius: 50%; background: rgba(255, 255, 255, 0.92); content: ''; }
:global(.uni-school-marker--primary) { background: #6d3fc9; }
:global(.uni-school-marker--junior) { background: #c93f77; }
</style>
