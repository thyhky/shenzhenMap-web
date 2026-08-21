<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { EstateFilters, StreetOption } from '@/domain/types'

const props = defineProps<{
  filters: EstateFilters
  districts: string[]
  streets: StreetOption[]
  csvLoading: boolean
  heatmapLoading: boolean
  canExport: boolean
}>()

const emit = defineEmits<{
  update: [patch: Partial<EstateFilters>]
  apply: []
  reset: []
  'export-csv': []
  'export-heatmap': []
}>()

const districtOptions = computed(() => ['全部区域', ...props.districts])
const streetOptions = computed(() => [
  { name: '全部街道', district: '', estates: 0, priced: 0, avgPrice: null },
  ...props.streets.filter((street) => !props.filters.district || street.district === props.filters.district),
])
const districtIndex = computed(() => Math.max(0, districtOptions.value.indexOf(props.filters.district || '全部区域')))
const streetIndex = computed(() => Math.max(0, streetOptions.value.findIndex((street) => street.name === props.filters.street)))
const minPriceInput = ref(String(props.filters.minWan))
const maxPriceInput = ref(String(props.filters.maxWan))
const priceError = ref('')

watch(() => props.filters.minWan, (value) => {
  minPriceInput.value = String(value)
})
watch(() => props.filters.maxWan, (value) => {
  maxPriceInput.value = String(value)
})

function eventValue(event: unknown) {
  return Number((event as { detail?: { value?: number | string } }).detail?.value ?? 0)
}

function selectDistrict(event: unknown) {
  const district = districtOptions.value[eventValue(event)]
  emit('update', { district: district === '全部区域' ? '' : district, street: '' })
}

function selectStreet(event: unknown) {
  const street = streetOptions.value[eventValue(event)]
  emit('update', { street: street?.name === '全部街道' ? '' : street?.name || '' })
}

function inputValue(event: unknown) {
  return String((event as { detail?: { value?: string } }).detail?.value ?? '')
}

function commitPrices() {
  const minWan = Number(minPriceInput.value)
  const maxWan = Number(maxPriceInput.value)
  if (!minPriceInput.value.trim() || !maxPriceInput.value.trim()
    || !Number.isFinite(minWan) || !Number.isFinite(maxWan)) {
    priceError.value = '请输入完整的最低和最高单价'
    return false
  }
  if (minWan < 0 || maxWan > 50) {
    priceError.value = '单价范围应在 0–50 万/㎡之间'
    return false
  }
  if (minWan > maxWan) {
    priceError.value = '最低单价不能高于最高单价'
    return false
  }
  priceError.value = ''
  emit('update', { minWan, maxWan })
  return true
}

function applyFilters() {
  if (commitPrices()) emit('apply')
}

function resetFilters() {
  priceError.value = ''
  emit('reset')
  void nextTick(() => {
    minPriceInput.value = String(props.filters.minWan)
    maxPriceInput.value = String(props.filters.maxWan)
  })
}
</script>

<template>
  <view class="filter-sheet">
    <view class="field-group">
      <text class="field-label">小区名称</text>
      <input
        class="search-input"
        type="text"
        :value="filters.keyword"
        placeholder="例如：香蜜湖"
        confirm-type="search"
        aria-label="小区名称"
        @input="emit('update', { keyword: inputValue($event) })"
        @confirm="applyFilters"
      >
    </view>
    <view class="field-row">
      <picker :range="districtOptions" :value="districtIndex" @change="selectDistrict">
        <view class="picker-field"><text class="picker-label">区域</text><text>{{ filters.district || '全部区域' }}</text></view>
      </picker>
      <picker :range="streetOptions" range-key="name" :value="streetIndex" @change="selectStreet">
        <view class="picker-field"><text class="picker-label">街道</text><text>{{ filters.street || '全部街道' }}</text></view>
      </picker>
    </view>
    <view class="price-row">
      <text class="field-label price-label">单价范围（万/㎡）</text>
      <input
        v-model="minPriceInput"
        class="price-input"
        type="number"
        inputmode="decimal"
        placeholder="最低"
        aria-label="最低单价，万元每平方米"
        @blur="commitPrices"
      >
      <text class="price-separator">至</text>
      <input
        v-model="maxPriceInput"
        class="price-input"
        type="number"
        inputmode="decimal"
        placeholder="最高"
        aria-label="最高单价，万元每平方米"
        @blur="commitPrices"
      >
    </view>
    <text v-if="priceError" class="field-error">{{ priceError }}</text>
    <view class="switch-row"><text>只显示有价小区</text><switch class="switch-control" color="#b64c39" :checked="filters.pricedOnly" @change="emit('update', { pricedOnly: !filters.pricedOnly })" /></view>
    <view class="switch-row"><text>只看无官方参考价</text><switch class="switch-control" color="#b64c39" :checked="filters.missingRefPrice" @change="emit('update', { missingRefPrice: !filters.missingRefPrice })" /></view>
    <view class="actions">
      <button class="action-button secondary" @click="resetFilters">重置</button>
      <button class="action-button primary" @click="applyFilters">应用筛选</button>
    </view>
    <view class="tools">
      <text class="tools-title">导出工具</text>
      <button class="tool-button" :class="{ disabled: csvLoading || !canExport }" :disabled="csvLoading || !canExport" @click="emit('export-csv')">{{ csvLoading ? '正在准备…' : '租售比 + 最近学校 CSV' }}</button>
      <button class="tool-button" :class="{ disabled: heatmapLoading || !canExport }" :disabled="heatmapLoading || !canExport" @click="emit('export-heatmap')">{{ heatmapLoading ? '正在生成…' : '当前行政区价格图' }}</button>
      <text v-if="!canExport" class="tools-note">筛选条件已修改，请先点击“应用筛选”。</text>
      <text class="tools-note">学校字段为同区最近点位估算，不代表官方学区或入学资格。</text>
    </view>
  </view>
</template>

<style scoped>
.filter-sheet { display: grid; gap: 14px; padding: 16px 18px 28px; }
.field-group { display: grid; gap: 6px; min-width: 0; }
.field-label { color: #40565a; font-size: 13px; font-weight: 700; }
.search-input, .picker-field, .price-input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid rgba(23, 52, 58, 0.16); border-radius: 7px; background: #fff; color: #17343a; font-size: 14px; }
.search-input { height: 42px; min-height: 42px; padding: 0 12px; line-height: 42px; }
.field-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 9px; }
.picker-field { display: flex; min-height: 42px; flex-direction: column; justify-content: center; gap: 2px; overflow: hidden; padding: 5px 10px; text-overflow: ellipsis; white-space: nowrap; }
.picker-label { color: #8a8580; font-size: 11px; }
.price-row { display: grid; grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr); align-items: center; gap: 7px; color: #617074; }
.price-label { grid-column: 1 / -1; }
.price-input { height: 40px; min-height: 40px; padding: 0 8px; line-height: 40px; text-align: center; }
.price-separator { color: #7a8587; font-size: 12px; text-align: center; }
.field-error { margin-top: -7px; color: #a83d34; font-size: 12px; line-height: 1.4; }
.switch-row { display: flex; align-items: center; justify-content: space-between; color: #40565a; font-size: 14px; }
.switch-control { transform: scale(0.78); transform-origin: right center; }
.actions { display: grid; grid-template-columns: 1fr 2fr; gap: 9px; margin-top: 4px; }
.action-button { min-height: 42px; margin: 0; border-radius: 7px; font-size: 14px; line-height: 40px; }
.action-button::after { display: none; }
.secondary { border: 1px solid rgba(23, 52, 58, 0.2); background: #fff; color: #617074; }
.primary { border: 1px solid #b64c39; background: #c93632; color: #fff; }
.tools { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; border-top: 1px solid rgba(23, 52, 58, 0.14); padding-top: 14px; }
.tools-title, .tools-note { grid-column: 1 / -1; }
.tools-title { color: #17343a; font-size: 13px; font-weight: 700; }
.tool-button { min-height: 40px; margin: 0; border: 1px solid rgba(23, 52, 58, 0.2); border-radius: 7px; background: #f7f1e6; padding: 7px 6px; color: #40565a; font-size: 12px; line-height: 1.25; }
.tool-button::after { display: none; }
.tool-button.disabled { opacity: 0.5; }
.tools-note { color: #8a8580; font-size: 11px; line-height: 1.5; }
</style>
