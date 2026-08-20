<script setup lang="ts">
import { computed } from 'vue'
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
</script>

<template>
  <view class="filter-sheet">
    <input
      class="search-input"
      type="text"
      :value="filters.keyword"
      placeholder="输入小区名称，如：香蜜湖"
      @input="emit('update', { keyword: inputValue($event) })"
    >
    <view class="field-row">
      <picker :range="districtOptions" :value="districtIndex" @change="selectDistrict">
        <view class="picker-field">区域：{{ filters.district || '全部区域' }}</view>
      </picker>
      <picker :range="streetOptions" range-key="name" :value="streetIndex" @change="selectStreet">
        <view class="picker-field">街道：{{ filters.street || '全部街道' }}</view>
      </picker>
    </view>
    <view class="price-row">
      <text>单价（万/㎡）</text>
      <input class="price-input" type="number" :value="filters.minWan" @input="emit('update', { minWan: Number(inputValue($event)) })">
      <text>—</text>
      <input class="price-input" type="number" :value="filters.maxWan" @input="emit('update', { maxWan: Number(inputValue($event)) })">
    </view>
    <view class="switch-row"><text>只显示有价小区</text><switch class="switch-control" color="#b64c39" :checked="filters.pricedOnly" @change="emit('update', { pricedOnly: !filters.pricedOnly })" /></view>
    <view class="switch-row"><text>只看无官方参考价</text><switch class="switch-control" color="#b64c39" :checked="filters.missingRefPrice" @change="emit('update', { missingRefPrice: !filters.missingRefPrice })" /></view>
    <view class="actions">
      <button class="action-button secondary" @click="emit('reset')">重置</button>
      <button class="action-button primary" @click="emit('apply')">应用筛选</button>
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
.filter-sheet { display: grid; gap: 18rpx; padding: 24rpx 28rpx 40rpx; }
.search-input, .picker-field, .price-input { border: 1rpx solid rgba(23, 52, 58, 0.16); border-radius: 10rpx; background: #fff; padding: 16rpx; color: #17343a; font-size: 22rpx; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14rpx; }
.price-row { display: flex; align-items: center; gap: 10rpx; color: #617074; font-size: 21rpx; }
.price-input { width: 105rpx; padding: 10rpx 6rpx; text-align: center; }
.switch-row { display: flex; align-items: center; justify-content: space-between; color: #40565a; font-size: 22rpx; }
.switch-control { transform: scale(0.78); transform-origin: right center; }
.actions { display: grid; grid-template-columns: 1fr 2fr; gap: 14rpx; margin-top: 8rpx; }
.action-button { margin: 0; border-radius: 10rpx; font-size: 22rpx; }
.action-button::after { display: none; }
.secondary { border: 1rpx solid rgba(23, 52, 58, 0.2); background: #fff; color: #617074; }
.primary { border: 1rpx solid #b64c39; background: #c93632; color: #fff; }
.tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10rpx; margin-top: 8rpx; border-top: 1rpx solid rgba(23, 52, 58, 0.14); padding-top: 18rpx; }
.tools-title, .tools-note { grid-column: 1 / -1; }
.tools-title { color: #17343a; font-size: 21rpx; font-weight: 700; }
.tool-button { margin: 0; border: 1rpx solid rgba(23, 52, 58, 0.2); border-radius: 9rpx; background: #f7f1e6; padding: 14rpx 9rpx; color: #40565a; font-size: 18rpx; line-height: 1.25; }
.tool-button::after { display: none; }
.tool-button.disabled { opacity: 0.5; }
.tools-note { color: #8a8580; font-size: 17rpx; line-height: 1.5; }
</style>
