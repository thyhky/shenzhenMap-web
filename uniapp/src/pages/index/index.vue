<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppHeader from '@/components/AppHeader.vue'
import BottomNav from '@/components/BottomNav.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import DetailSheet from '@/components/DetailSheet.vue'
import FilterSheet from '@/components/FilterSheet.vue'
import ResultsSheet from '@/components/ResultsSheet.vue'
// #ifdef H5
import MapH5 from '@/components/map/MapH5.vue'
// #endif
// #ifdef MP-WEIXIN
import MapWeixin from '@/components/map/MapWeixin.vue'
// #endif
import { getMapData, getMeta } from '@/services/api'
import { useEstateFilters } from '@/stores/filters'
import type { EstateSummary, MapItem, MapResponse, MetaResponse, SheetName, Viewport } from '@/domain/types'

const initialViewport: Viewport = {
  west: 113.7,
  south: 22.4,
  east: 114.4,
  north: 22.9,
  zoom: 11,
}

const meta = ref<MetaResponse | null>(null)
const snapshot = ref<MapResponse | null>(null)
const selected = ref<EstateSummary | null>(null)
const activeSheet = ref<SheetName>('')
const loading = ref(true)
const error = ref('')
const viewport = ref<Viewport>({ ...initialViewport })
const { draft, applied, updateDraft, applyDraft, resetDraft } = useEstateFilters()

const sheetTitle = computed(() => (
  activeSheet.value === 'filters'
    ? '筛选地图'
    : activeSheet.value === 'results'
      ? '范围结果'
      : '小区详情'
))

function toggleSheet(sheet: Exclude<SheetName, ''>) {
  activeSheet.value = activeSheet.value === sheet ? '' : sheet
}

async function loadMap() {
  loading.value = true
  error.value = ''
  try {
    snapshot.value = await getMapData(viewport.value, applied)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '地图数据加载失败'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  applyDraft()
  activeSheet.value = ''
  void loadMap()
}

function selectEstate(estate: EstateSummary) {
  selected.value = estate
  activeSheet.value = ''
}

function selectMapItem(item: MapItem) {
  if (item.kind === 'estate') selectEstate(item)
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
      :latitude="22.6508"
      :longitude="114.0745"
      :zoom="viewport.zoom"
      :items="snapshot?.items ?? []"
    />
    <!-- #endif -->

    <!-- #ifdef MP-WEIXIN -->
    <MapWeixin
      :latitude="22.6508"
      :longitude="114.0745"
      :zoom="viewport.zoom"
      :items="snapshot?.items ?? []"
      @select="selectMapItem"
    />
    <!-- #endif -->

    <view v-if="error" class="error-toast">{{ error }}</view>

    <BottomNav
      :active="activeSheet"
      :district="applied.district"
      :total="snapshot?.stats.total ?? 0"
      :selected-name="selected?.name ?? ''"
      @select="toggleSheet"
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
      <DetailSheet v-else :estate="selected" />
    </BottomSheet>
  </view>
</template>

<style scoped>
.page-shell { position: relative; width: 100%; height: 100vh; overflow: hidden; background: #d9d1c1; }
.error-toast { position: fixed; z-index: 20; right: 30rpx; bottom: calc(130rpx + env(safe-area-inset-bottom)); left: 30rpx; border-radius: 12rpx; background: #7e3028; padding: 16rpx 22rpx; color: #fff; font-size: 21rpx; text-align: center; }
</style>
