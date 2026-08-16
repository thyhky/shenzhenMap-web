<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getEstatePriceHistory, getHeatmap, getMeta, getRanking, getRankingExportUrl } from './api'
import DetailPanel from './components/DetailPanel.vue'
import FiltersPanel from './components/FiltersPanel.vue'
import MapView from './components/MapView.vue'
import RankingPanel from './components/RankingPanel.vue'
import ResultsPanel from './components/ResultsPanel.vue'
import SchoolDetailPanel from './components/SchoolDetailPanel.vue'
import type {
  EstateDetail,
  EstateFilters,
  EstateSummary,
  HeatmapResponse,
  MapResponse,
  MetaResponse,
  PriceHistoryResponse,
  RankingResponse,
  SchoolFeature,
} from './types'

type MobileSheet = 'filters' | 'results' | 'detail' | null

const filters = ref<EstateFilters>({
  district: '',
  street: '',
  keyword: '',
  pricedOnly: true,
  minWan: 0,
  maxWan: 32,
})
const meta = ref<MetaResponse | null>(null)
const snapshot = ref<MapResponse | null>(null)
const selectedEstate = ref<EstateDetail | null>(null)
const selectedSchool = ref<SchoolFeature | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const detailLoading = ref(false)
const historyLoading = ref(false)
const priceHistory = ref<PriceHistoryResponse | null>(null)
const rankingSort = ref<'price' | 'rentYield'>('rentYield')
const ranking = ref<RankingResponse | null>(null)
const rankingLoading = ref(false)
const rankingLoadingMore = ref(false)
const showBoundaries = ref(true)
const showSchools = ref(true)
const showSchoolZones = ref(true)
const sourcePanelOpen = ref(false)
const showFiltersPanel = ref(true)
const showResultsPanel = ref(true)
const heatmapLoading = ref(false)
const mobileSheet = ref<MobileSheet>(null)
const errorMessage = ref('')
const mapView = ref<InstanceType<typeof MapView> | null>(null)
let historyController: AbortController | null = null
let rankingController: AbortController | null = null
let rankingTimer: ReturnType<typeof setTimeout> | null = null

const averagePrice = computed(() => {
  const value = snapshot.value?.stats.averagePrice
  return value ? `${(value / 10000).toFixed(1)}万` : '-'
})
const mapLimitNotice = computed(() => {
  if (!snapshot.value?.truncated) return ''
  return snapshot.value.mode === 'clusters'
    ? '聚合标记已达到上限，仅显示部分区域，请调整缩放级别。'
    : `地图仅显示前 ${snapshot.value.items.length} 个点，统计和结果列表仍包含全部匹配项。`
})
const estateScope = computed(() => (
  meta.value?.catalog.scopes.find((scope) => scope.id === 'estates') ?? null
))
const schoolScope = computed(() => (
  meta.value?.catalog.scopes.find((scope) => scope.id === 'school-scopes') ?? null
))

function handleSnapshot(value: MapResponse) {
  snapshot.value = value
}

async function handleMapSelect(value: EstateDetail) {
  selectedEstate.value = value
  selectedSchool.value = null
  priceHistory.value = null
  historyController?.abort()
  const controller = new AbortController()
  historyController = controller
  historyLoading.value = true
  if (window.matchMedia('(max-width: 760px)').matches) mobileSheet.value = 'detail'
  try {
    const response = await getEstatePriceHistory(value.id, controller.signal)
    if (selectedEstate.value?.id === value.id) priceHistory.value = response
  } catch (error) {
    if ((error as Error).name !== 'AbortError') showError((error as Error).message)
  } finally {
    if (historyController === controller) historyLoading.value = false
  }
}

function handleSchoolSelect(value: SchoolFeature) {
  historyController?.abort()
  historyLoading.value = false
  priceHistory.value = null
  selectedEstate.value = null
  selectedSchool.value = value
  if (window.matchMedia('(max-width: 760px)').matches) mobileSheet.value = 'detail'
}

function selectResult(value: EstateSummary) {
  mapView.value?.focusEstate(value)
}

function loadMoreResults() {
  void mapView.value?.loadMoreResults()
}

async function loadRanking(page = 1, append = false) {
  rankingController?.abort()
  const controller = new AbortController()
  rankingController = controller
  if (append) rankingLoadingMore.value = true
  else rankingLoading.value = true
  try {
    const response = await getRanking(filters.value, rankingSort.value, controller.signal, page)
    if (rankingController !== controller) return
    if (!append || !ranking.value) {
      ranking.value = response
    } else {
      const ids = new Set(ranking.value.items.map((item) => item.id))
      ranking.value = {
        ...response,
        items: [...ranking.value.items, ...response.items.filter((item) => !ids.has(item.id))],
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') showError((error as Error).message)
  } finally {
    if (rankingController === controller) {
      rankingLoading.value = false
      rankingLoadingMore.value = false
    }
  }
}

function loadMoreRanking() {
  if (!ranking.value?.pagination.hasMore) return
  void loadRanking(ranking.value.pagination.page + 1, true)
}

function changeRankingSort(sort: 'price' | 'rentYield') {
  if (rankingSort.value === sort) return
  rankingSort.value = sort
}

function scheduleRanking(delay = 300) {
  if (rankingTimer) clearTimeout(rankingTimer)
  rankingTimer = setTimeout(() => {
    void loadRanking(1, false)
  }, delay)
}

function showError(message: string) {
  errorMessage.value = message
  window.setTimeout(() => {
    if (errorMessage.value === message) errorMessage.value = ''
  }, 4500)
}

function heatmapColor(price: number | null) {
  if (!price) return 'rgba(92, 105, 109, 0.42)'
  if (price < 35000) return 'rgba(49, 91, 109, 0.58)'
  if (price < 50000) return 'rgba(45, 129, 124, 0.58)'
  if (price < 70000) return 'rgba(121, 168, 107, 0.58)'
  if (price < 90000) return 'rgba(227, 182, 87, 0.62)'
  if (price < 120000) return 'rgba(223, 123, 69, 0.64)'
  return 'rgba(187, 62, 69, 0.66)'
}

function drawGeometry(context: CanvasRenderingContext2D, geometry: unknown, project: (point: [number, number]) => [number, number]) {
  const coordinates = (geometry as { coordinates?: unknown })?.coordinates
  if (!coordinates) return
  const rings: Array<Array<[number, number]>> = []
  const collectRings = (value: unknown) => {
    if (!Array.isArray(value) || !value.length) return
    if (typeof value[0]?.[0] === 'number') {
      rings.push(value as Array<[number, number]>)
      return
    }
    value.forEach(collectRings)
  }
  collectRings(coordinates)
  rings.forEach((ring) => {
    const first = project(ring[0])
    context.beginPath()
    context.moveTo(first[0], first[1])
    ring.slice(1).forEach((point) => {
      const projected = project(point)
      context.lineTo(projected[0], projected[1])
    })
    context.closePath()
    context.stroke()
  })
}

function downloadHeatmap(data: HeatmapResponse) {
  if (!data.bounds) throw new Error('当前范围没有可导出的数据')
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 1000
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持图片导出')
  const padding = 86
  const width = canvas.width - padding * 2
  const height = canvas.height - padding * 2
  const lngSpan = Math.max(data.bounds.east - data.bounds.west, 0.001)
  const latSpan = Math.max(data.bounds.north - data.bounds.south, 0.001)
  const scale = Math.min(width / lngSpan, height / latSpan)
  const project = ([lng, lat]: [number, number]): [number, number] => [
    padding + (lng - data.bounds!.west) * scale + (width - lngSpan * scale) / 2,
    canvas.height - padding - (lat - data.bounds!.south) * scale - (height - latSpan * scale) / 2,
  ]

  context.fillStyle = '#e8e1d4'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#17343a'
  context.font = '700 30px Microsoft YaHei, sans-serif'
  context.fillText(`${data.label} 小区价格密度图`, padding, 42)
  context.font = '15px Microsoft YaHei, sans-serif'
  context.fillStyle = '#617074'
  context.fillText(`小区 ${data.total} · 有价 ${data.priced} · 平均 ${data.averagePrice ? `${(data.averagePrice / 10000).toFixed(1)} 万/㎡` : '暂无'}`, padding, 66)

  context.strokeStyle = 'rgba(111, 82, 67, 0.52)'
  context.lineWidth = 1.2
  data.boundaries.forEach((feature) => drawGeometry(context, feature.geometry, project))
  data.points.forEach((point) => {
    const [x, y] = project([point.lng, point.lat])
    const radius = point.price ? 4.5 : 3.5
    context.beginPath()
    context.fillStyle = heatmapColor(point.price)
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  })
  context.fillStyle = 'rgba(250, 246, 237, 0.92)'
  context.fillRect(padding, canvas.height - 52, 540, 30)
  context.fillStyle = '#617074'
  context.font = '12px Microsoft YaHei, sans-serif'
  context.fillText('颜色：小区挂牌均价；每个圆点代表一个小区；仅供研究参考', padding + 12, canvas.height - 32)

  const link = document.createElement('a')
  link.download = `${data.label.replace(/[\\/:*?"<>|]/g, '-')}-小区热力图.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

async function exportHeatmap() {
  if (!filters.value.district) {
    showError('请先选择行政区，再导出热力图')
    return
  }
  heatmapLoading.value = true
  try {
    const data = await getHeatmap(filters.value)
    downloadHeatmap(data)
  } catch (error) {
    showError((error as Error).message)
  } finally {
    heatmapLoading.value = false
  }
}

function exportDistrictRankingCsv() {
  const link = document.createElement('a')
  link.href = getRankingExportUrl(filters.value)
  link.download = ''
  link.click()
}

onMounted(async () => {
  try {
    meta.value = await getMeta()
    await loadRanking(1, false)
  } catch (error) {
    showError((error as Error).message)
  }
})

watch(() => filters.value, () => scheduleRanking(350), { deep: true })
watch(rankingSort, () => scheduleRanking(0))

onBeforeUnmount(() => {
  historyController?.abort()
  rankingController?.abort()
  if (rankingTimer) clearTimeout(rankingTimer)
})
</script>

<template>
  <main class="app-shell">
    <MapView
      ref="mapView"
      :filters="filters"
      :show-boundaries="showBoundaries"
      :show-schools="showSchools"
      :show-school-zones="showSchoolZones"
      @snapshot="handleSnapshot"
      @select="handleMapSelect"
      @select-school="handleSchoolSelect"
      @loading="loading = $event"
      @loading-more="loadingMore = $event"
      @detail-loading="detailLoading = $event"
      @error="showError"
    />

    <header class="brand-card">
      <div class="brand-kicker">SHENZHEN · HOUSING ATLAS</div>
      <div class="brand-line">
        <h1>深圳住区观察</h1>
        <span class="live-dot">API</span>
      </div>
      <p>展示挂牌均价，不是成交价，仅供城市研究参考。</p>
      <button class="source-button" type="button" @click="sourcePanelOpen = true">数据来源与方法</button>
    </header>

    <section class="stats-strip" aria-label="当前范围统计">
      <div><small>小区</small><strong>{{ snapshot?.stats.total ?? '-' }}</strong></div>
      <div><small>有价</small><strong>{{ snapshot?.stats.priced ?? '-' }}</strong></div>
      <div><small>均价</small><strong>{{ averagePrice }}</strong></div>
      <div class="desktop-stat"><small>来源观测</small><strong>{{ snapshot?.sourceObservedAt || meta?.sourceObservedAt || '未知' }}</strong></div>
    </section>
    <div v-if="mapLimitNotice" class="map-limit-notice" role="status">{{ mapLimitNotice }}</div>

    <div class="panel-visibility-controls">
      <button type="button" :class="{ active: showFiltersPanel }" @click="showFiltersPanel = !showFiltersPanel">
        {{ showFiltersPanel ? '隐藏筛选器' : '显示筛选器' }}
      </button>
      <button type="button" :class="{ active: showResultsPanel }" @click="showResultsPanel = !showResultsPanel">
        {{ showResultsPanel ? '隐藏范围结果' : '显示范围结果' }}
      </button>
    </div>

    <aside v-if="showFiltersPanel" class="desktop-panel filters-panel">
      <div class="panel-title"><span>筛选器</span><small>FILTER</small></div>
      <FiltersPanel v-model="filters" :meta="meta" />
      <button class="heatmap-export-button" type="button" :disabled="heatmapLoading" @click="void exportHeatmap()">
        {{ heatmapLoading ? '正在生成…' : '导出当前区域热力图' }}
      </button>
      <button class="heatmap-export-button" type="button" @click="exportDistrictRankingCsv()">
        导出租售比+最佳学校 CSV
      </button>
      <label class="boundary-toggle">
        <input v-model="showBoundaries" type="checkbox">
        <span>显示街道边界</span>
      </label>
      <label class="boundary-toggle layer-toggle">
        <input v-model="showSchools" type="checkbox">
        <span>显示学校（光明·南山）</span>
      </label>
      <label class="boundary-toggle layer-toggle">
        <input v-model="showSchoolZones" type="checkbox">
        <span>显示学区范围（近似）</span>
      </label>
    </aside>

    <aside v-if="showResultsPanel" class="desktop-panel insight-panel">
      <div class="panel-title"><span>范围结果</span><small>RESULTS</small></div>
      <ResultsPanel
        :results="snapshot?.results ?? []"
        :total="snapshot?.stats.total ?? 0"
        :loading="loading"
        :has-more="snapshot?.pagination.hasMore ?? false"
        :loading-more="loadingMore"
        @select="selectResult"
        @load-more="loadMoreResults"
      />
      <div class="detail-divider"></div>
      <RankingPanel
        :items="ranking?.items ?? []"
        :total="ranking?.stats.total ?? 0"
        :loading="rankingLoading"
        :has-more="ranking?.pagination.hasMore ?? false"
        :loading-more="rankingLoadingMore"
        :sort="rankingSort"
        @select="selectResult"
        @load-more="loadMoreRanking"
        @change-sort="changeRankingSort"
      />
      <div class="detail-divider"></div>
      <SchoolDetailPanel v-if="selectedSchool" :school="selectedSchool" :scope="schoolScope" />
      <DetailPanel v-else :estate="selectedEstate" :loading="detailLoading" :history="priceHistory" :history-loading="historyLoading" :scope="estateScope" />
    </aside>

    <div class="legend-card">
      <span><i style="--color:#315b6d"></i>3.5万以下</span>
      <span><i style="--color:#2d817c"></i>3.5-5万</span>
      <span><i style="--color:#79a86b"></i>5-7万</span>
      <span><i style="--color:#e3b657"></i>7-9万</span>
      <span><i style="--color:#df7b45"></i>9-12万</span>
      <span><i style="--color:#bb3e45"></i>12万以上</span>
      <span class="legend-school"><i class="school-marker school-marker--primary"></i>小学</span>
      <span class="legend-school"><i class="school-marker school-marker--junior"></i>初中</span>
      <span class="legend-school"><i style="--color:#6d3fc9;border-radius:2px"></i>学区范围（近似）</span>
    </div>

    <div v-if="errorMessage" class="error-toast" role="alert">{{ errorMessage }}</div>

    <div v-if="mobileSheet" class="sheet-scrim" @click="mobileSheet = null"></div>
    <section v-if="mobileSheet" class="mobile-sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <strong>{{ mobileSheet === 'filters' ? '筛选地图' : mobileSheet === 'results' ? '范围结果' : selectedSchool ? '学校详情' : '小区详情' }}</strong>
        <button type="button" aria-label="关闭" @click="mobileSheet = null">关闭</button>
      </div>
      <template v-if="mobileSheet === 'filters'">
        <FiltersPanel v-model="filters" :meta="meta" />
        <label class="boundary-toggle mobile-boundary">
          <input v-model="showBoundaries" type="checkbox">
          <span>显示街道边界</span>
        </label>
        <label class="boundary-toggle mobile-boundary layer-toggle">
          <input v-model="showSchools" type="checkbox">
<span>显示学校（光明·南山）</span>
        </label>
        <label class="boundary-toggle mobile-boundary layer-toggle">
          <input v-model="showSchoolZones" type="checkbox">
          <span>显示学区范围（近似）</span>
        </label>
      </template>
      <ResultsPanel
        v-else-if="mobileSheet === 'results'"
        :results="snapshot?.results ?? []"
        :total="snapshot?.stats.total ?? 0"
        :loading="loading"
        :has-more="snapshot?.pagination.hasMore ?? false"
        :loading-more="loadingMore"
        @select="selectResult"
        @load-more="loadMoreResults"
      />
      <SchoolDetailPanel v-else-if="selectedSchool" :school="selectedSchool" :scope="schoolScope" />
      <DetailPanel v-else :estate="selectedEstate" :loading="detailLoading" :history="priceHistory" :history-loading="historyLoading" :scope="estateScope" />
    </section>

    <div v-if="sourcePanelOpen" class="methodology-scrim" @click.self="sourcePanelOpen = false">
      <section class="methodology-dialog" role="dialog" aria-modal="true" aria-labelledby="methodology-title">
        <header>
          <div><small>DATA CATALOG</small><h2 id="methodology-title">数据来源与方法</h2></div>
          <button type="button" aria-label="关闭数据说明" @click="sourcePanelOpen = false">关闭</button>
        </header>
        <p class="global-disclaimer">{{ meta?.catalog.disclaimer || '数据仅供研究参考，请以主管部门最新公告为准。' }}</p>
        <div class="scope-list">
          <article v-for="scope in meta?.catalog.scopes" :key="scope.id" class="scope-card">
            <div class="scope-heading">
              <strong>{{ scope.label }}</strong>
              <span :class="scope.status">{{ scope.status === 'active' ? '已接入' : scope.status === 'planned' ? '待接入' : '已停用' }}</span>
            </div>
            <a v-if="scope.source?.url" :href="scope.source.url" target="_blank" rel="noopener noreferrer">{{ scope.source.name }}</a>
            <p v-if="scope.sourceVersion">版本：{{ scope.sourceVersion }}</p>
            <p v-if="scope.licenseNote">{{ scope.licenseNote }}</p>
            <p v-if="scope.disclaimer" class="scope-disclaimer">{{ scope.disclaimer }}</p>
            <a v-if="scope.termsUrl" :href="scope.termsUrl" target="_blank" rel="noopener noreferrer">查看许可或服务条款</a>
          </article>
        </div>
        <footer>内容版本：{{ meta?.catalog.dataVersion?.slice(0, 12) || '未知' }}</footer>
      </section>
    </div>

    <nav class="mobile-nav" aria-label="地图工具">
      <button type="button" :class="{ active: mobileSheet === 'filters' }" @click="mobileSheet = 'filters'">
        <span>筛选</span><small>{{ filters.district || '全部区域' }}</small>
      </button>
      <button type="button" :class="{ active: mobileSheet === 'results' }" @click="mobileSheet = 'results'">
        <span>结果</span><small>{{ snapshot?.stats.total ?? 0 }} 个</small>
      </button>
      <button type="button" :class="{ active: mobileSheet === 'detail' }" @click="mobileSheet = 'detail'">
        <span>详情</span><small>{{ selectedSchool?.properties.name || selectedEstate?.name || '未选择' }}</small>
      </button>
    </nav>
  </main>
</template>
