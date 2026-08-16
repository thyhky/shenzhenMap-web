<script setup lang="ts">
import L from 'leaflet'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getEstate, getMapData, getSchools, getSchoolZones, getStreetBoundaries, searchEstates } from '../api'
import type { MapRequest } from '../api'
import type {
  EstateDetail,
  EstateFilters,
  EstateSummary,
  MapItem,
  MapResponse,
  SchoolFeature,
  SchoolFeatureCollection,
  SchoolZoneFeature,
  SchoolZoneFeatureCollection,
  StreetFeatureCollection,
} from '../types'

const props = defineProps<{
  filters: EstateFilters
  showBoundaries: boolean
  showSchools: boolean
  showSchoolZones: boolean
}>()

const emit = defineEmits<{
  snapshot: [value: MapResponse]
  select: [value: EstateDetail]
  'select-school': [value: SchoolFeature]
  'select-school-zone': [value: SchoolZoneFeature]
  loading: [value: boolean]
  'loading-more': [value: boolean]
  'detail-loading': [value: boolean]
  error: [message: string]
}>()

const mapRoot = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let pointsLayer: L.LayerGroup | null = null
let schoolLayer: L.LayerGroup | null = null
let schoolZoneLayer: L.GeoJSON | null = null
let boundaryLayer: L.GeoJSON | null = null
let estateController: AbortController | null = null
let moreController: AbortController | null = null
let boundaryController: AbortController | null = null
let schoolController: AbortController | null = null
let schoolZoneController: AbortController | null = null
let detailController: AbortController | null = null
let estateTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let lastSearchKey = ''
let lastSnapshot: MapResponse | null = null
let lastRequest: MapRequest | EstateFilters | null = null
let lastRequestWasSearch = false
let boundaryData: StreetFeatureCollection | null = null
let schoolData: SchoolFeatureCollection | null = null
let schoolZoneData: SchoolZoneFeatureCollection | null = null

const priceBands = [35000, 50000, 70000, 90000, 120000]
const priceColors = ['#315b6d', '#2d817c', '#79a86b', '#e3b657', '#df7b45', '#bb3e45']

function priceColor(price: number | null) {
  if (!price) return '#f7f1e6'
  const index = priceBands.findIndex((limit) => price < limit)
  return priceColors[index === -1 ? priceColors.length - 1 : index]
}

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}

function popupContent(title: string, lines: string[]) {
  const root = document.createElement('div')
  root.className = 'map-popup'
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

async function selectEstate(id: number) {
  detailController?.abort()
  const controller = new AbortController()
  detailController = controller
  emit('detail-loading', true)
  try {
    emit('select', await getEstate(id, controller.signal))
  } catch (error) {
    if ((error as Error).name !== 'AbortError') emit('error', (error as Error).message)
  } finally {
    if (detailController === controller) emit('detail-loading', false)
  }
}

function drawPoints(items: MapItem[]) {
  if (!map || !pointsLayer) return
  const targetLayer = pointsLayer
  targetLayer.clearLayers()
  items.forEach((item) => {
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
      marker.on('click', () => map?.setView([item.lat, item.lng], Math.min(16, map.getZoom() + 2)))
      marker.addTo(targetLayer)
      return
    }

    const marker = L.circleMarker([item.lat, item.lng], {
      pane: 'estatePoints',
      radius: 3 + Math.max(0, (map?.getZoom() ?? 12) - 12) * 0.5,
      color: '#17343a',
      weight: 1,
      fillColor: priceColor(item.price),
      fillOpacity: 0.85,
    })
    marker.bindPopup(popupContent(item.name, [
      priceText(item.price),
      `${item.district} · ${item.street}`,
    ]))
    marker.on('click', () => void selectEstate(item.id))
    if ((map?.getZoom() ?? 0) >= 15) {
      marker.bindTooltip(item.name, { direction: 'top', offset: [0, -7], className: 'estate-label' })
    }
    marker.addTo(targetLayer)
  })
}

function drawBoundaries(collection: StreetFeatureCollection) {
  if (!boundaryLayer) return
  boundaryLayer.clearLayers()
  boundaryLayer.addData(collection as GeoJSON.FeatureCollection)
}

function schoolIcon(level: 'primary' | 'junior') {
  return L.divIcon({
    className: 'school-marker-wrap',
    html: `<span class="school-marker school-marker--${level}"></span>`,
    iconSize: [18, 26],
    iconAnchor: [9, 25],
    popupAnchor: [0, -24],
    tooltipAnchor: [0, -18],
  })
}

function drawSchools(collection: SchoolFeatureCollection) {
  if (!map || !schoolLayer) return
  const targetLayer = schoolLayer
  targetLayer.clearLayers()
  collection.features.forEach((school) => {
    const [lng, lat] = school.geometry.coordinates
    const marker = L.marker([lat, lng], {
      icon: schoolIcon(school.properties.level),
      riseOnHover: true,
    })
    marker.bindPopup(popupContent(school.properties.name, [
      `${school.properties.levelLabel} · ${school.properties.district}`,
      `官方招生社区 ${school.properties.zones.length} 个`,
      '点击查看招生范围与咨询电话',
    ]))
    marker.on('click', () => {
      detailController?.abort()
      emit('detail-loading', false)
      emit('select-school', school)
    })
    if ((map?.getZoom() ?? 0) >= 15) {
      marker.bindTooltip(school.properties.name, { direction: 'top', offset: [0, -20], className: 'school-label' })
    }
    marker.addTo(targetLayer)
  })
}

function schoolZoneStyle(level: 'primary' | 'junior') {
  return {
    color: level === 'junior' ? '#c93f77' : '#6d3fc9',
    weight: 1.5,
    opacity: 0.75,
    fillOpacity: 0.18,
  }
}

function drawSchoolZones(collection: SchoolZoneFeatureCollection) {
  if (!map || !schoolZoneLayer) return
  schoolZoneLayer.clearLayers()
  schoolZoneLayer.addData(collection as GeoJSON.FeatureCollection)
  schoolZoneLayer.eachLayer((layer) => {
    const feature = (layer as L.GeoJSON).feature as SchoolZoneFeature | null
    const properties = feature?.properties
      if (properties) {
        const isOfficial = properties.method === 'official-boundary'
        layer.bindPopup(popupContent(properties.name, [
          `${properties.levelLabel} · ${properties.district}`,
          `覆盖 ${properties.zones.length} 个招生社区`,
          isOfficial
            ? '官方划片边界'
            : '基于官方招生社区名称的近似范围，非官方边界',
        ]))
        layer.on('click', () => {
          const school = schoolData?.features.find((item) => item.properties.id === properties.schoolId)
          if (school) {
            detailController?.abort()
            emit('detail-loading', false)
            emit('select-school', school)
            return
          }
          emit('select-school-zone', feature)
        })
        layer.bindTooltip(properties.name, { sticky: true, className: 'school-label' })
      }
    })
  }

function currentMapRequest() {
  if (!map) return
  const bounds = map.getBounds()
  return {
    ...props.filters,
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
    zoom: map.getZoom(),
  }
}

function fitSearchResults(snapshot: MapResponse) {
  if (!map) return
  const bounds = snapshot.matchBounds
  if (!bounds) return
  if (bounds.west === bounds.east && bounds.south === bounds.north) {
    map.setView([bounds.south, bounds.west], 15)
    return
  }
  map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], {
    padding: [32, 32],
    maxZoom: 15,
  })
}

async function loadEstates() {
  const request = currentMapRequest()
  if (!request) return
  estateController?.abort()
  moreController?.abort()
  const controller = new AbortController()
  estateController = controller
  const searchKey = props.filters.keyword.trim()
    ? JSON.stringify(props.filters)
    : ''

  emit('loading', true)
  try {
    const snapshot = searchKey
      ? await searchEstates(props.filters, controller.signal)
      : await getMapData(request, controller.signal)
    lastSnapshot = snapshot
    lastRequest = searchKey ? { ...props.filters } : { ...request }
    lastRequestWasSearch = Boolean(searchKey)
    drawPoints(snapshot.items)
    emit('snapshot', snapshot)
    if (searchKey && searchKey !== lastSearchKey) {
      lastSearchKey = searchKey
      fitSearchResults(snapshot)
    } else if (!searchKey) {
      lastSearchKey = ''
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') emit('error', (error as Error).message)
  } finally {
    if (estateController === controller) emit('loading', false)
  }
}

async function loadMoreResults() {
  if (!lastSnapshot?.pagination.hasMore || !lastRequest) return
  moreController?.abort()
  const controller = new AbortController()
  moreController = controller
  emit('loading-more', true)
  try {
    const page = lastSnapshot.pagination.page + 1
    const next = lastRequestWasSearch
      ? await searchEstates(lastRequest as EstateFilters, controller.signal, page)
      : await getMapData(lastRequest as MapRequest, controller.signal, page)
    const ids = new Set(lastSnapshot.results.map((estate) => estate.id))
    lastSnapshot = {
      ...lastSnapshot,
      results: [...lastSnapshot.results, ...next.results.filter((estate) => !ids.has(estate.id))],
      pagination: next.pagination,
    }
    emit('snapshot', lastSnapshot)
  } catch (error) {
    if ((error as Error).name !== 'AbortError') emit('error', (error as Error).message)
  } finally {
    if (moreController === controller) emit('loading-more', false)
  }
}

async function loadBoundaries() {
  if (!props.showBoundaries) {
    boundaryController?.abort()
    drawBoundaries({ type: 'FeatureCollection', scope: 'streets', features: [] })
    return
  }
  if (boundaryData) {
    drawBoundaries(boundaryData)
    return
  }
  boundaryController?.abort()
  const controller = new AbortController()
  boundaryController = controller
  try {
    boundaryData = await getStreetBoundaries(controller.signal)
    drawBoundaries(boundaryData)
  } catch (error) {
    if ((error as Error).name !== 'AbortError') emit('error', `街道边界加载失败：${(error as Error).message}`)
  }
}

async function loadSchools() {
  if (!props.showSchools) {
    schoolController?.abort()
    drawSchools({ type: 'FeatureCollection', scope: 'school-scopes', features: [] })
    return
  }
  if (schoolData) {
    drawSchools(schoolData)
    return
  }
  schoolController?.abort()
  const controller = new AbortController()
  schoolController = controller
  try {
    schoolData = await getSchools(controller.signal)
    drawSchools(schoolData)
  } catch (error) {
    if ((error as Error).name !== 'AbortError') emit('error', `学校图层加载失败：${(error as Error).message}`)
  }
}

async function loadSchoolZones() {
  if (!props.showSchoolZones) {
    schoolZoneController?.abort()
    drawSchoolZones({ type: 'FeatureCollection', scope: 'school-scopes', features: [] })
    return
  }
  if (schoolZoneData) {
    drawSchoolZones(schoolZoneData)
    return
  }
  schoolZoneController?.abort()
  const controller = new AbortController()
  schoolZoneController = controller
  try {
    schoolZoneData = await getSchoolZones(controller.signal)
    drawSchoolZones(schoolZoneData)
  } catch (error) {
    if ((error as Error).name !== 'AbortError') emit('error', `学区范围图层加载失败：${(error as Error).message}`)
  }
}

function scheduleEstates(delay = 180) {
  if (estateTimer) clearTimeout(estateTimer)
  estateTimer = setTimeout(() => void loadEstates(), delay)
}

function focusEstate(estate: EstateSummary) {
  map?.setView([estate.lat, estate.lng], Math.max(15, map.getZoom()))
  void selectEstate(estate.id)
}

defineExpose({ focusEstate, loadMoreResults })

watch(() => props.filters, () => scheduleEstates(300), { deep: true })
watch(() => props.showBoundaries, () => void loadBoundaries())
watch(() => props.showSchools, () => void loadSchools())
watch(() => props.showSchoolZones, () => void loadSchoolZones())

onMounted(() => {
  if (!mapRoot.value) return
  map = L.map(mapRoot.value, { preferCanvas: true, zoomControl: false }).setView([22.57, 114.05], 10)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  map.createPane('schoolZones').style.zIndex = '420'
  map.createPane('streetBoundaries').style.zIndex = '410'
  map.createPane('estatePoints').style.zIndex = '450'
  boundaryLayer = L.geoJSON(undefined, {
    pane: 'streetBoundaries',
    style: { color: '#a85843', weight: 1, opacity: 0.66, fillOpacity: 0.015 },
    onEachFeature: (feature, layer) => {
      const properties = feature.properties as { name?: string; district?: string } | undefined
      if (properties) layer.bindTooltip(`${properties.name ?? ''} · ${properties.district ?? ''}`, { sticky: true })
    },
  }).addTo(map)
  schoolZoneLayer = L.geoJSON(undefined, {
    pane: 'schoolZones',
    style: (feature) => schoolZoneStyle((feature?.properties as SchoolZoneFeature['properties']).level),
  }).addTo(map)
  pointsLayer = L.layerGroup().addTo(map)
  schoolLayer = L.layerGroup().addTo(map)
  map.on('moveend zoomend', () => {
    if (!props.filters.keyword.trim()) scheduleEstates()
  })
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
  resizeObserver.observe(mapRoot.value)
  scheduleEstates(0)
  void loadBoundaries()
  void loadSchools()
  void loadSchoolZones()
})

onBeforeUnmount(() => {
  estateController?.abort()
  moreController?.abort()
  boundaryController?.abort()
  schoolController?.abort()
  schoolZoneController?.abort()
  detailController?.abort()
  if (estateTimer) clearTimeout(estateTimer)
  resizeObserver?.disconnect()
  map?.remove()
})
</script>

<template>
  <div ref="mapRoot" class="map-root" aria-label="深圳小区价格地图"></div>
</template>
