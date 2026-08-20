<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppHeader from '@/components/AppHeader.vue'
import BottomNav from '@/components/BottomNav.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import DetailSheet from '@/components/DetailSheet.vue'
import FilterSheet from '@/components/FilterSheet.vue'
import LayerControl from '@/components/LayerControl.vue'
import MapBriefCard from '@/components/MapBriefCard.vue'
import MethodologyModal from '@/components/MethodologyModal.vue'
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
  getHeatmap,
  getMapData,
  getMeta,
  getRanking,
  getRankingExportUrl,
  getSchools,
  getSchoolZones,
  getStreetBoundaries,
  searchEstates,
} from '@/services/api'
import { useEstateFilters } from '@/stores/filters'
import type {
  Bounds,
  EstateDetail,
  EstateFilters,
  EstateSort,
  EstateSummary,
  HistoryDays,
  HeatmapResponse,
  MapLayerName,
  MapResponse,
  MapSelection,
  MapViewport,
  MetaResponse,
  PriceHistoryResponse,
  RankingItem,
  RankingSort,
  SchoolFeatureCollection,
  SchoolZoneFeatureCollection,
  SheetName,
  StreetFeatureCollection,
  Viewport,
} from '@/domain/types'
import { heatmapFilename, renderHeatmap } from '@/utils/heatmap'
import type { DrawingContext } from '@/utils/heatmap'

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
const showMethodology = ref(false)
const csvLoading = ref(false)
const heatmapLoading = ref(false)
const heatmapCanvasVisible = ref(false)
const activeSheet = ref<SheetName>('')
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const viewport = ref<Viewport>({ ...initialViewport })
const mapCenter = ref({ latitude: 22.6508, longitude: 114.0745 })
const mapZoom = ref(initialViewport.zoom)
const layerRevision = ref(0)
const focusBounds = ref<Bounds | null>(null)
const focusRevision = ref(0)
const resultsMode = ref<'results' | 'ranking'>('results')
const rankingSort = ref<RankingSort>('rentYield')
const rankingItems = ref<RankingItem[]>([])
const rankingTotal = ref(0)
const rankingPage = ref(0)
const rankingHasMore = ref(false)
const rankingLoading = ref(false)
const rankingLoadingMore = ref(false)
const desktopFiltersOpen = ref(true)
const desktopRightOpen = ref(true)
const desktopRightTab = ref<'results' | 'detail'>('results')
const visibleLayers = reactive<Record<MapLayerName, boolean>>({ boundaries: false, schools: false, zones: false })
const layerLoading = reactive<Record<MapLayerName, boolean>>({ boundaries: false, schools: false, zones: false })
const { draft, applied, updateDraft, applyDraft, resetDraft, setAppliedSort } = useEstateFilters()
const componentInstance = getCurrentInstance()?.proxy
let mapRequestId = 0
let lastMapRequestKey = ''
let lastResultScopeKey = ''
let lastResultRequest: { viewport: Viewport; filters: EstateFilters; search: boolean } | null = null
let lastFittedSearchKey = ''
let rankingRequestId = 0
let rankingQueryKey = ''
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
const filtersDirty = computed(() => JSON.stringify(draft) !== JSON.stringify(applied))
const desktopWorkspaceClass = computed(() => ({
  'filters-hidden': !desktopFiltersOpen.value,
  'right-hidden': !desktopRightOpen.value,
  'both-hidden': !desktopFiltersOpen.value && !desktopRightOpen.value,
}))

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
  if (desktopRightTab.value === 'detail') ensureSelectedDetailLoaded()
}

async function loadMap() {
  const requestViewport = { ...viewport.value }
  const filters = { ...applied }
  const search = Boolean(filters.keyword.trim())
  const { sort: _sort, ...searchScopeFilters } = filters
  const searchScopeKey = JSON.stringify(searchScopeFilters)
  const resultScopeKey = JSON.stringify({ filters, search })
  const requestKey = JSON.stringify({
    viewport: search
      ? null
      : Object.fromEntries(Object.entries(requestViewport).map(([key, value]) => [key, Number(value.toFixed(6))])),
    filters,
    search,
  })
  if (requestKey === lastMapRequestKey) return
  const scopeChanged = Boolean(lastResultScopeKey && resultScopeKey !== lastResultScopeKey)
  lastMapRequestKey = requestKey
  lastResultScopeKey = resultScopeKey
  lastResultRequest = null
  if (scopeChanged) snapshot.value = null
  else if (snapshot.value && !search) {
    snapshot.value = {
      ...snapshot.value,
      results: [],
      pagination: { page: 1, pageSize: 20, hasMore: false },
    }
  }
  if (!search) lastFittedSearchKey = ''
  const requestId = ++mapRequestId
  loadingMore.value = false
  loading.value = true
  error.value = ''
  try {
    const response = search
      ? await searchEstates(filters)
      : await getMapData(requestViewport, filters)
    if (requestId === mapRequestId) {
      snapshot.value = response
      lastResultRequest = { viewport: requestViewport, filters, search }
      if (search && response.matchBounds && lastFittedSearchKey !== searchScopeKey) {
        lastFittedSearchKey = searchScopeKey
        focusBounds.value = response.matchBounds
        focusRevision.value += 1
      }
    }
  } catch (cause) {
    if (requestId === mapRequestId) {
      lastMapRequestKey = ''
      error.value = cause instanceof Error ? cause.message : '地图数据加载失败'
    }
  } finally {
    if (requestId === mapRequestId) loading.value = false
  }
}

async function loadMoreResults() {
  const current = snapshot.value
  const request = lastResultRequest
  if (!current?.pagination.hasMore || !request || loading.value || loadingMore.value) return
  const requestId = mapRequestId
  const requestKey = lastMapRequestKey
  const nextPage = current.pagination.page + 1
  loadingMore.value = true
  try {
    const response = request.search
      ? await searchEstates(request.filters, nextPage)
      : await getMapData(request.viewport, request.filters, nextPage)
    if (requestId !== mapRequestId || requestKey !== lastMapRequestKey || !snapshot.value) return
    const ids = new Set(snapshot.value.results.map((item) => item.id))
    snapshot.value = {
      ...snapshot.value,
      results: [...snapshot.value.results, ...response.results.filter((item) => !ids.has(item.id))],
      pagination: response.pagination,
    }
  } catch (cause) {
    if (requestId === mapRequestId) error.value = cause instanceof Error ? cause.message : '加载更多结果失败'
  } finally {
    if (requestId === mapRequestId) loadingMore.value = false
  }
}

async function loadRanking(page = 1, force = false) {
  const filters = { ...applied }
  const queryKey = JSON.stringify({ filters: { ...filters, sort: undefined }, sort: rankingSort.value })
  if (page === 1 && !force && queryKey === rankingQueryKey && rankingItems.value.length) return
  if (page > 1 && (rankingLoading.value || rankingLoadingMore.value || !rankingHasMore.value)) return
  let requestId = rankingRequestId
  if (page === 1) {
    requestId = ++rankingRequestId
    rankingQueryKey = queryKey
    rankingItems.value = []
    rankingTotal.value = 0
    rankingPage.value = 0
    rankingHasMore.value = false
    rankingLoading.value = true
    rankingLoadingMore.value = false
  } else {
    rankingLoadingMore.value = true
  }
  try {
    const response = await getRanking(filters, rankingSort.value, page)
    if (requestId !== rankingRequestId || queryKey !== rankingQueryKey) return
    if (page === 1) rankingItems.value = response.items
    else {
      const ids = new Set(rankingItems.value.map((item) => item.id))
      rankingItems.value = [...rankingItems.value, ...response.items.filter((item) => !ids.has(item.id))]
    }
    rankingTotal.value = response.stats.total
    rankingPage.value = response.pagination.page
    rankingHasMore.value = response.pagination.hasMore
  } catch (cause) {
    if (requestId === rankingRequestId) error.value = cause instanceof Error ? cause.message : '榜单加载失败'
  } finally {
    if (requestId === rankingRequestId) {
      rankingLoading.value = false
      rankingLoadingMore.value = false
    }
  }
}

function applyFilters() {
  applyDraft()
  activeSheet.value = ''
  void loadMap()
  if (resultsMode.value === 'ranking') void loadRanking(1, true)
}

function changeResultSort(sort: EstateSort) {
  if (applied.sort === sort) return
  setAppliedSort(sort)
  void loadMap()
}

function changeResultsMode(mode: 'results' | 'ranking') {
  resultsMode.value = mode
  if (mode === 'ranking') void loadRanking()
}

function changeRankingSort(sort: RankingSort) {
  if (rankingSort.value === sort) return
  rankingSort.value = sort
  void loadRanking(1, true)
}

function loadMoreRanking() {
  void loadRanking(rankingPage.value + 1)
}

async function exportCsv() {
  if (csvLoading.value || filtersDirty.value) return
  csvLoading.value = true
  error.value = ''
  const url = getRankingExportUrl(applied)
  try {
    // #ifdef H5
    const response = await fetch(url)
    if (!response.ok) throw new Error(`CSV 导出失败 (${response.status})`)
    const blobUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = 'rent-yield-best-school.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    // #endif
    // #ifdef MP-WEIXIN
    if (!uni.canIUse('shareFileMessage')) throw new Error('当前微信版本不支持文件分享，请升级微信')
    await new Promise<void>((resolve, reject) => {
      uni.downloadFile({
        url,
        success: (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`CSV 导出失败 (${response.statusCode})`))
            return
          }
          uni.shareFileMessage({
            filePath: response.tempFilePath,
            fileName: 'rent-yield-best-school.csv',
            success: () => resolve(),
            fail: reject,
          })
        },
        fail: reject,
      })
    })
    // #endif
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'CSV 导出失败'
  } finally {
    csvLoading.value = false
  }
}

// #ifdef H5
function downloadHeatmapH5(data: HeatmapResponse) {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 1000
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持图片导出')
  renderHeatmap(context, canvas.width, canvas.height, data)
  const link = document.createElement('a')
  link.download = heatmapFilename(data.label)
  link.href = canvas.toDataURL('image/png')
  link.click()
}
// #endif

// #ifdef MP-WEIXIN
interface WeixinCanvasNode {
  width: number
  height: number
  getContext(type: '2d'): DrawingContext & { scale(x: number, y: number): void }
}

function queryHeatmapCanvas(attempt = 0): Promise<{ node: WeixinCanvasNode; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    uni.createSelectorQuery()
      .in(componentInstance)
      .select('#heatmap-canvas')
      .fields({ node: true, size: true }, (value) => {
        const selected = value as { node?: WeixinCanvasNode; width?: number; height?: number }
        if (selected.node && selected.width && selected.height) {
          resolve({ node: selected.node, width: selected.width, height: selected.height })
          return
        }
        if (attempt >= 4) {
          reject(new Error('画布初始化失败，请重试'))
          return
        }
        setTimeout(() => {
          queryHeatmapCanvas(attempt + 1).then(resolve, reject)
        }, 80)
      })
      .exec()
  })
}

function ensureAlbumPermission(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    uni.getSetting({
      success: (settings) => {
        const granted = settings.authSetting['scope.writePhotosAlbum']
        if (granted === true) {
          resolve(true)
          return
        }
        if (granted === undefined) {
          uni.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => resolve(true),
            fail: () => resolve(false),
          })
          return
        }
        uni.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存图片到相册。',
          success: (modal) => {
            if (!modal.confirm) {
              resolve(false)
              return
            }
            uni.openSetting({
              success: (updated) => resolve(Boolean(updated.authSetting['scope.writePhotosAlbum'])),
              fail: reject,
            })
          },
          fail: reject,
        })
      },
      fail: reject,
    })
  })
}

async function renderHeatmapWeixin(data: HeatmapResponse) {
  heatmapCanvasVisible.value = true
  await nextTick()
  const result = await queryHeatmapCanvas()
  const ratio = uni.getWindowInfo().pixelRatio || 1
  const backingScale = Math.min(ratio, 1365 / result.width, 1365 / result.height)
  result.node.width = Math.floor(result.width * backingScale)
  result.node.height = Math.floor(result.height * backingScale)
  const context = result.node.getContext('2d')
  context.scale(backingScale, backingScale)
  renderHeatmap(context, result.width, result.height, data)
  const filePath = await new Promise<string>((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvasId: 'heatmap-canvas',
      canvas: result.node,
      destWidth: result.node.width,
      destHeight: result.node.height,
      fileType: 'png',
      success: (response) => resolve(response.tempFilePath),
      fail: reject,
    }, componentInstance)
  })
  if (!await ensureAlbumPermission()) throw new Error('未获得相册权限')
  await new Promise<void>((resolve, reject) => {
    uni.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject })
  })
  uni.showToast({ title: '已保存到相册', icon: 'success' })
}
// #endif

async function exportHeatmap() {
  if (heatmapLoading.value || filtersDirty.value) return
  if (!applied.district) {
    error.value = '请先应用一个行政区，再导出价格图'
    return
  }
  heatmapLoading.value = true
  error.value = ''
  try {
    const data = await getHeatmap(applied)
    if (!data.bounds) throw new Error('当前范围没有可导出的数据')
    // #ifdef H5
    downloadHeatmapH5(data)
    // #endif
    // #ifdef MP-WEIXIN
    await renderHeatmapWeixin(data)
    // #endif
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '价格图导出失败'
  } finally {
    heatmapCanvasVisible.value = false
    heatmapLoading.value = false
  }
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

function ensureSelectedDetailLoaded() {
  const id = selectedEstateId(selected.value)
  if (id === null) return
  if (estateDetail.value?.id !== id && !detailLoading.value) void loadEstateDetail(id)
  if ((priceHistory.value?.estateId !== id || loadedHistoryDays !== historyDays.value) && !historyLoading.value) {
    void loadPriceHistory(id, historyDays.value)
  }
}

function openDetails() {
  activeSheet.value = 'detail'
  desktopRightTab.value = 'detail'
  ensureSelectedDetailLoaded()
}

function openDesktopRightTab(tab: 'results' | 'detail') {
  desktopRightTab.value = tab
  if (tab === 'detail') ensureSelectedDetailLoaded()
}

function selectSheet(sheet: Exclude<SheetName, ''>) {
  if (sheet !== 'detail') {
    const opening = activeSheet.value !== sheet
    toggleSheet(sheet)
    if (opening && sheet === 'results' && resultsMode.value === 'ranking') void loadRanking()
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
  if (!applied.keyword.trim()) void loadMap()
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
      :observed-at="snapshot?.sourceObservedAt ?? meta?.sourceObservedAt ?? null"
      @methodology="showMethodology = true"
    />

    <!-- #ifdef H5 -->
    <view class="desktop-workspace" :class="desktopWorkspaceClass">
      <view v-if="desktopFiltersOpen" class="desktop-panel desktop-left">
        <view class="desktop-panel-head"><text>筛选地图</text><button @click="desktopFiltersOpen = false">收起</button></view>
        <scroll-view scroll-y class="desktop-panel-body">
          <FilterSheet
            :filters="draft"
            :districts="meta?.districts ?? []"
            :streets="meta?.streets ?? []"
            :csv-loading="csvLoading"
            :heatmap-loading="heatmapLoading"
            :can-export="!filtersDirty"
            @update="updateDraft"
            @apply="applyFilters"
            @reset="resetDraft"
            @export-csv="exportCsv"
            @export-heatmap="exportHeatmap"
          />
        </scroll-view>
      </view>

      <view class="map-stage">
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
          :focus-bounds="focusBounds"
          :focus-revision="focusRevision"
          @select="selectMapItem"
          @viewport-change="updateViewport"
        />
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
        <view class="desktop-reopen">
          <button v-if="!desktopFiltersOpen" @click="desktopFiltersOpen = true">打开筛选</button>
          <button v-if="!desktopRightOpen" @click="desktopRightOpen = true">打开侧栏</button>
        </view>
      </view>

      <view v-if="desktopRightOpen" class="desktop-panel desktop-right">
        <view class="desktop-panel-head desktop-tabs">
          <button :class="{ active: desktopRightTab === 'results' }" @click="openDesktopRightTab('results')">结果与榜单</button>
          <button :class="{ active: desktopRightTab === 'detail' }" @click="openDesktopRightTab('detail')">详情</button>
          <button class="desktop-close" @click="desktopRightOpen = false">收起</button>
        </view>
        <scroll-view scroll-y class="desktop-panel-body">
          <ResultsSheet
            v-if="desktopRightTab === 'results'"
            :mode="resultsMode"
            :results="snapshot?.results ?? []"
            :total="snapshot?.stats.total ?? 0"
            :loading="loading"
            :loading-more="loadingMore"
            :has-more="snapshot?.pagination.hasMore ?? false"
            :sort="applied.sort"
            :ranking="rankingItems"
            :ranking-total="rankingTotal"
            :ranking-loading="rankingLoading"
            :ranking-loading-more="rankingLoadingMore"
            :ranking-has-more="rankingHasMore"
            :ranking-sort="rankingSort"
            @select="selectEstate"
            @update:mode="changeResultsMode"
            @update:sort="changeResultSort"
            @update:ranking-sort="changeRankingSort"
            @load-more-results="loadMoreResults"
            @load-more-ranking="loadMoreRanking"
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
        </scroll-view>
      </view>
    </view>
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
      :focus-bounds="focusBounds"
      :focus-revision="focusRevision"
      @select="selectMapItem"
      @focus="focusMap"
      @viewport-change="updateViewport"
    />
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
    <!-- #endif -->

    <view v-if="error" class="error-toast">{{ error }}</view>

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
        :csv-loading="csvLoading"
        :heatmap-loading="heatmapLoading"
        :can-export="!filtersDirty"
        @update="updateDraft"
        @apply="applyFilters"
        @reset="resetDraft"
        @export-csv="exportCsv"
        @export-heatmap="exportHeatmap"
      />
      <ResultsSheet
        v-else-if="activeSheet === 'results'"
        :mode="resultsMode"
        :results="snapshot?.results ?? []"
        :total="snapshot?.stats.total ?? 0"
        :loading="loading"
        :loading-more="loadingMore"
        :has-more="snapshot?.pagination.hasMore ?? false"
        :sort="applied.sort"
        :ranking="rankingItems"
        :ranking-total="rankingTotal"
        :ranking-loading="rankingLoading"
        :ranking-loading-more="rankingLoadingMore"
        :ranking-has-more="rankingHasMore"
        :ranking-sort="rankingSort"
        @select="selectEstate"
        @update:mode="changeResultsMode"
        @update:sort="changeResultSort"
        @update:ranking-sort="changeRankingSort"
        @load-more-results="loadMoreResults"
        @load-more-ranking="loadMoreRanking"
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

    <MethodologyModal v-if="showMethodology && meta" :meta="meta" @close="showMethodology = false" />

    <!-- #ifdef MP-WEIXIN -->
    <canvas v-if="heatmapCanvasVisible" id="heatmap-canvas" type="2d" class="heatmap-canvas" />
    <!-- #endif -->
  </view>
</template>

<style scoped>
.page-shell { position: relative; width: 100%; height: 100vh; overflow: hidden; background: #d9d1c1; }
.error-toast { position: fixed; z-index: 20; right: 30rpx; bottom: calc(130rpx + env(safe-area-inset-bottom)); left: 30rpx; border-radius: 12rpx; background: #7e3028; padding: 16rpx 22rpx; color: #fff; font-size: 21rpx; text-align: center; }
.heatmap-canvas { position: fixed; top: 0; left: -2000px; width: 750rpx; height: 500rpx; }
</style>

<style>
/* #ifdef H5 */
.desktop-workspace, .map-stage { position: absolute; inset: 0; overflow: hidden; }
.desktop-panel, .desktop-reopen { display: none; }
@media (min-width: 901px) {
  .page-shell { display: grid; grid-template-rows: 68px minmax(0, 1fr); gap: 10px; box-sizing: border-box; height: 100vh; background: #f1efe9; padding: 12px; }
  .page-shell > .header-card { position: relative; z-index: 5; inset: auto; border-radius: 9px; padding: 10px 16px; box-shadow: 0 8px 30px rgba(24, 43, 47, 0.08); }
  .desktop-workspace { position: relative; display: grid; grid-template-columns: 308px minmax(0, 1fr) 310px; gap: 10px; min-width: 0; min-height: 0; }
  .desktop-workspace.filters-hidden { grid-template-columns: minmax(0, 1fr) 310px; }
  .desktop-workspace.right-hidden { grid-template-columns: 308px minmax(0, 1fr); }
  .desktop-workspace.both-hidden { grid-template-columns: minmax(0, 1fr); }
  .desktop-panel { display: flex; min-width: 0; min-height: 0; overflow: hidden; flex-direction: column; border: 1px solid rgba(23, 52, 58, 0.14); border-radius: 9px; background: #faf6ed; box-shadow: 0 8px 28px rgba(24, 43, 47, 0.08); }
  .desktop-panel-head { display: flex; flex: none; align-items: center; justify-content: space-between; min-height: 42px; border-bottom: 1px solid rgba(23, 52, 58, 0.14); padding: 0 14px; color: #17343a; font-family: serif; font-size: 15px; font-weight: 700; }
  .desktop-panel-head button { margin: 0; border: 0; background: transparent; padding: 6px; color: #b64c39; font-size: 11px; line-height: 1; }
  .desktop-panel-head button::after { display: none; }
  .desktop-panel-body { flex: 1; min-height: 0; }
  .desktop-tabs { justify-content: flex-start; gap: 4px; padding: 0 8px; }
  .desktop-tabs button.active { border-radius: 5px; background: #17343a; color: #fff; }
  .desktop-tabs .desktop-close { margin-left: auto; }
  .map-stage { position: relative; min-width: 0; min-height: 0; border: 1px solid rgba(23, 52, 58, 0.14); border-radius: 9px; background: #d8d1c3; box-shadow: 0 8px 28px rgba(24, 43, 47, 0.08); }
  .map-stage .layer-control { position: absolute; top: 12px; right: 12px; }
  .map-stage .brief-card { position: absolute; right: 14px; bottom: 14px; left: 14px; }
  .desktop-reopen { position: absolute; z-index: 7; top: 12px; left: 12px; display: flex; gap: 6px; }
  .desktop-reopen button { margin: 0; border: 1px solid rgba(23, 52, 58, 0.18); border-radius: 6px; background: rgba(250, 246, 237, 0.96); padding: 7px 10px; color: #17343a; font-size: 11px; line-height: 1; box-shadow: 0 4px 14px rgba(18, 42, 46, 0.12); }
  .desktop-reopen button::after { display: none; }
  .page-shell > .bottom-nav, .page-shell > .sheet-mask { display: none !important; }
  .page-shell > .error-toast { right: 24px; bottom: 24px; left: auto; width: min(420px, 40vw); }
  .map-h5 .leaflet-control-attribution { margin-bottom: 0 !important; }
  .map-h5 .leaflet-control-zoom { margin-bottom: 12px !important; }
}

@media (min-width: 1051px) and (max-width: 1280px) {
  .desktop-workspace { grid-template-columns: 280px minmax(0, 1fr) 292px; }
  .desktop-workspace.filters-hidden { grid-template-columns: minmax(0, 1fr) 292px; }
  .desktop-workspace.right-hidden { grid-template-columns: 280px minmax(0, 1fr); }
  .desktop-workspace.both-hidden { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 901px) and (max-width: 1050px) {
  .page-shell { grid-template-rows: 60px minmax(0, 1fr); gap: 8px; padding: 8px; }
  .desktop-workspace { grid-template-columns: 240px minmax(0, 1fr) 265px; gap: 8px; }
  .desktop-workspace.filters-hidden { grid-template-columns: minmax(0, 1fr) 265px; }
  .desktop-workspace.right-hidden { grid-template-columns: 240px minmax(0, 1fr); }
  .desktop-workspace.both-hidden { grid-template-columns: minmax(0, 1fr); }
}
/* #endif */
</style>
