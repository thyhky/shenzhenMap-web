<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppHeader from '@/components/AppHeader.vue'
import BottomNav from '@/components/BottomNav.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import DetailSheet from '@/components/DetailSheet.vue'
import FilterSheet from '@/components/FilterSheet.vue'
import LayerControl from '@/components/LayerControl.vue'
import MapBriefCard from '@/components/MapBriefCard.vue'
import ResultsSheet from '@/components/ResultsSheet.vue'
// #ifdef H5
import MapH5 from '@/components/map/MapH5.vue'
// #endif
// #ifdef MP-WEIXIN
import MapWeixin from '@/components/map/MapWeixin.vue'
// #endif
import {
  getEstate,
  getEstatePriceHistory,
  getMapData,
  getMeta,
  getSchools,
  getSchoolZones,
  getStreetBoundaries,
} from '@/services/api'
import { useEstateFilters } from '@/stores/filters'
import type {
  EstateDetail,
  EstateSummary,
  HistoryDays,
  MapLayerName,
  MapResponse,
  MapSelection,
  MapViewport,
  MetaResponse,
  PriceHistoryResponse,
  SchoolFeatureCollection,
  SchoolZoneFeatureCollection,
  SheetName,
  StreetFeatureCollection,
  Viewport,
} from '@/domain/types'

const initialViewport: Viewport = {
  west: 113.7,
  south: 22.4,
  east: 114.4,
  north: 22.9,
  zoom: 11,
}

const meta = ref<MetaResponse | null>(null)
const snapshot = ref<MapResponse | null>(null)
const boundaries = ref<StreetFeatureCollection | null>(null)
const schools = ref<SchoolFeatureCollection | null>(null)
const schoolZones = ref<SchoolZoneFeatureCollection | null>(null)
const selected = ref<MapSelection | null>(null)
const estateDetail = ref<EstateDetail | null>(null)
const priceHistory = ref<PriceHistoryResponse | null>(null)
const historyDays = ref<HistoryDays>(30)
const detailLoading = ref(false)
const historyLoading = ref(false)
const detailError = ref('')
const historyError = ref('')
const activeSheet = ref<SheetName>('')
const loading = ref(true)
const error = ref('')
const viewport = ref<Viewport>({ ...initialViewport })
const mapCenter = ref({ latitude: 22.6508, longitude: 114.0745 })
const mapZoom = ref(initialViewport.zoom)
const layerRevision = ref(0)
const visibleLayers = reactive<Record<MapLayerName, boolean>>({ boundaries: false, schools: false, zones: false })
const layerLoading = reactive<Record<MapLayerName, boolean>>({ boundaries: false, schools: false, zones: false })
const { draft, applied, updateDraft, applyDraft, resetDraft } = useEstateFilters()
let mapRequestId = 0
let lastMapRequestKey = ''
let detailRequestId = 0
let historyRequestId = 0
let loadedHistoryDays: HistoryDays | null = null

const sheetTitle = computed(() => (
  activeSheet.value === 'filters'
    ? '筛选地图'
    : activeSheet.value === 'results'
      ? '范围结果'
      : '小区详情'
))
const selectedName = computed(() => {
  if (!selected.value) return ''
  if ('kind' in selected.value) {
    return selected.value.kind === 'cluster' ? `${selected.value.count} 个小区` : selected.value.name
  }
  return selected.value.properties.name
})

function toggleSheet(sheet: Exclude<SheetName, ''>) {
  activeSheet.value = activeSheet.value === sheet ? '' : sheet
}

function selectedEstateId(item: MapSelection | null) {
  return item && 'kind' in item && item.kind === 'estate' ? item.id : null
}

function resetEstateDetail() {
  detailRequestId += 1
  historyRequestId += 1
  estateDetail.value = null
  priceHistory.value = null
  loadedHistoryDays = null
  detailLoading.value = false
  historyLoading.value = false
  detailError.value = ''
  historyError.value = ''
}

function setSelection(item: MapSelection) {
  if (selectedEstateId(selected.value) !== selectedEstateId(item)) resetEstateDetail()
  selected.value = item
  activeSheet.value = ''
}

async function loadMap() {
  const requestViewport = { ...viewport.value }
  const requestKey = JSON.stringify({
    viewport: Object.fromEntries(Object.entries(requestViewport).map(([key, value]) => [key, Number(value.toFixed(6))])),
    filters: applied,
  })
  if (requestKey === lastMapRequestKey) return
  lastMapRequestKey = requestKey
  const requestId = ++mapRequestId
  loading.value = true
  error.value = ''
  try {
    const response = await getMapData(requestViewport, applied)
    if (requestId === mapRequestId) snapshot.value = response
  } catch (cause) {
    if (requestId === mapRequestId) {
      lastMapRequestKey = ''
      error.value = cause instanceof Error ? cause.message : '地图数据加载失败'
    }
  } finally {
    if (requestId === mapRequestId) loading.value = false
  }
}

function applyFilters() {
  applyDraft()
  activeSheet.value = ''
  void loadMap()
}

function selectEstate(estate: EstateSummary) {
  setSelection({ ...estate, kind: 'estate' })
  mapCenter.value = { latitude: estate.lat, longitude: estate.lng }
  mapZoom.value = Math.max(15, mapZoom.value)
}

function selectMapItem(item: MapSelection) {
  setSelection(item)
}

async function loadEstateDetail(id: number) {
  const requestId = ++detailRequestId
  detailLoading.value = true
  detailError.value = ''
  try {
    const response = await getEstate(id)
    if (requestId === detailRequestId && selectedEstateId(selected.value) === id) estateDetail.value = response
  } catch (cause) {
    if (requestId === detailRequestId) {
      detailError.value = cause instanceof Error ? cause.message : '小区详情加载失败'
    }
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false
  }
}

async function loadPriceHistory(id: number, days: HistoryDays) {
  const requestId = ++historyRequestId
  priceHistory.value = null
  loadedHistoryDays = null
  historyLoading.value = true
  historyError.value = ''
  try {
    const response = await getEstatePriceHistory(id, days)
    if (requestId === historyRequestId && selectedEstateId(selected.value) === id) {
      priceHistory.value = response
      loadedHistoryDays = days
    }
  } catch (cause) {
    if (requestId === historyRequestId) {
      historyError.value = cause instanceof Error ? cause.message : '价格历史加载失败'
    }
  } finally {
    if (requestId === historyRequestId) historyLoading.value = false
  }
}

function openDetails() {
  activeSheet.value = 'detail'
  const id = selectedEstateId(selected.value)
  if (id === null) return
  if (estateDetail.value?.id !== id && !detailLoading.value) void loadEstateDetail(id)
  if ((priceHistory.value?.estateId !== id || loadedHistoryDays !== historyDays.value) && !historyLoading.value) {
    void loadPriceHistory(id, historyDays.value)
  }
}

function selectSheet(sheet: Exclude<SheetName, ''>) {
  if (sheet !== 'detail') {
    toggleSheet(sheet)
    return
  }
  if (activeSheet.value === 'detail') activeSheet.value = ''
  else openDetails()
}

function changeHistoryDays(days: HistoryDays) {
  if (historyDays.value === days) return
  historyDays.value = days
  const id = selectedEstateId(selected.value)
  if (id !== null) void loadPriceHistory(id, days)
}

function clearSelection() {
  selected.value = null
  activeSheet.value = ''
  resetEstateDetail()
}

function focusMap(view: { latitude: number; longitude: number; zoom: number }) {
  mapCenter.value = { latitude: view.latitude, longitude: view.longitude }
  mapZoom.value = view.zoom
}

function updateViewport(next: MapViewport) {
  viewport.value = {
    west: next.west,
    south: next.south,
    east: next.east,
    north: next.north,
    zoom: next.zoom,
  }
  mapCenter.value = { latitude: next.latitude, longitude: next.longitude }
  mapZoom.value = next.zoom
  void loadMap()
}

async function toggleLayer(layer: MapLayerName) {
  visibleLayers[layer] = !visibleLayers[layer]
  if (!visibleLayers[layer] || layerLoading[layer]) return
  if ((layer === 'boundaries' && boundaries.value)
    || (layer === 'schools' && schools.value)
    || (layer === 'zones' && schoolZones.value)) return
  layerLoading[layer] = true
  error.value = ''
  try {
    if (layer === 'boundaries') boundaries.value = await getStreetBoundaries()
    if (layer === 'schools') schools.value = await getSchools()
    if (layer === 'zones') {
      const [zones, schoolData] = await Promise.all([getSchoolZones(), getSchools()])
      schoolZones.value = zones
      schools.value ??= schoolData
    }
    layerRevision.value += 1
  } catch (cause) {
    visibleLayers[layer] = false
    error.value = cause instanceof Error ? cause.message : '地图图层加载失败'
  } finally {
    layerLoading[layer] = false
  }
}

onLoad(async () => {
  try {
    meta.value = await getMeta()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '元数据加载失败'
  }
  await loadMap()
})
</script>

<template>
  <view class="page-shell">
    <AppHeader
      :total="snapshot?.stats.total ?? meta?.totals.estates ?? 0"
      :average-price="snapshot?.stats.averagePrice ?? null"
      :loading="loading"
    />

    <!-- #ifdef H5 -->
    <MapH5
      :latitude="mapCenter.latitude"
      :longitude="mapCenter.longitude"
      :zoom="mapZoom"
      :items="snapshot?.items ?? []"
      :boundaries="boundaries"
      :schools="schools"
      :school-zones="schoolZones"
      :show-boundaries="visibleLayers.boundaries"
      :show-schools="visibleLayers.schools"
      :show-school-zones="visibleLayers.zones"
      @select="selectMapItem"
      @viewport-change="updateViewport"
    />
    <!-- #endif -->

    <!-- #ifdef MP-WEIXIN -->
    <MapWeixin
      :latitude="mapCenter.latitude"
      :longitude="mapCenter.longitude"
      :zoom="mapZoom"
      :items="snapshot?.items ?? []"
      :layer-revision="layerRevision"
      :show-boundaries="visibleLayers.boundaries"
      :show-schools="visibleLayers.schools"
      :show-school-zones="visibleLayers.zones"
      @select="selectMapItem"
      @focus="focusMap"
      @viewport-change="updateViewport"
    />
    <!-- #endif -->

    <view v-if="error" class="error-toast">{{ error }}</view>

    <LayerControl
      :boundaries="visibleLayers.boundaries"
      :schools="visibleLayers.schools"
      :zones="visibleLayers.zones"
      :loading="layerLoading"
      @toggle="toggleLayer"
    />

    <MapBriefCard
      v-if="selected && !activeSheet"
      :item="selected"
      @close="clearSelection"
      @details="openDetails"
    />

    <BottomNav
      :active="activeSheet"
      :district="applied.district"
      :total="snapshot?.stats.total ?? 0"
      :selected-name="selectedName"
      @select="selectSheet"
    />

    <BottomSheet :visible="Boolean(activeSheet)" :title="sheetTitle" @close="activeSheet = ''">
      <FilterSheet
        v-if="activeSheet === 'filters'"
        :filters="draft"
        :districts="meta?.districts ?? []"
        :streets="meta?.streets ?? []"
        @update="updateDraft"
        @apply="applyFilters"
        @reset="resetDraft"
      />
      <ResultsSheet
        v-else-if="activeSheet === 'results'"
        :results="snapshot?.results ?? []"
        :total="snapshot?.stats.total ?? 0"
        :loading="loading"
        @select="selectEstate"
      />
      <DetailSheet
        v-else
        :item="selected"
        :estate-detail="estateDetail"
        :history="priceHistory"
        :history-days="historyDays"
        :loading="detailLoading"
        :history-loading="historyLoading"
        :error="detailError"
        :history-error="historyError"
        @update:history-days="changeHistoryDays"
      />
    </BottomSheet>
  </view>
</template>

<style scoped>
.page-shell { position: relative; width: 100%; height: 100vh; overflow: hidden; background: #d9d1c1; }
.error-toast { position: fixed; z-index: 20; right: 30rpx; bottom: calc(130rpx + env(safe-area-inset-bottom)); left: 30rpx; border-radius: 12rpx; background: #7e3028; padding: 16rpx 22rpx; color: #fff; font-size: 21rpx; text-align: center; }
</style>
