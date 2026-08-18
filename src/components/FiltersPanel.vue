<script setup lang="ts">
import { computed } from 'vue'
import type { EstateFilters, MetaResponse } from '../types'

const props = defineProps<{
  modelValue: EstateFilters
  meta: MetaResponse | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: EstateFilters]
  apply: []
}>()

const streets = computed(() => {
  const all = props.meta?.streets ?? []
  return props.modelValue.district
    ? all.filter((item) => item.district === props.modelValue.district)
    : all
})

const selectedConditions = computed(() => {
  const items: Array<{ key: 'price' | 'district' | 'street' | 'keyword' | 'missingRefPrice'; label: string }> = []
  if (props.modelValue.minWan !== 2 || props.modelValue.maxWan !== 32) {
    items.push({ key: 'price', label: `单价 ${props.modelValue.minWan.toFixed(1)}-${props.modelValue.maxWan.toFixed(1)} 万/㎡` })
  }
  if (props.modelValue.district) items.push({ key: 'district', label: `行政区 ${props.modelValue.district}` })
  if (props.modelValue.street) items.push({ key: 'street', label: `街道 ${props.modelValue.street}` })
  if (props.modelValue.keyword.trim()) items.push({ key: 'keyword', label: `小区 ${props.modelValue.keyword.trim()}` })
  if (props.modelValue.missingRefPrice) items.push({ key: 'missingRefPrice', label: '无官方参考价' })
  return items
})

function streetLabel(item: { name: string; estates: number; avgPrice: number | null }) {
  const stats = item.estates > 0
    ? `（${item.estates} 个 · ${item.avgPrice ? `${(item.avgPrice / 10000).toFixed(1)}万/㎡` : '暂无均价'}）`
    : ''
  return `${item.name}${stats}`
}

function update(patch: Partial<EstateFilters>) {
  const next = { ...props.modelValue, ...patch }
  const nextStreets = (props.meta?.streets ?? []).filter(
    (item) => !next.district || item.district === next.district,
  )
  if ('district' in patch && !nextStreets.some((item) => item.name === next.street)) {
    next.street = ''
  }
  emit('update:modelValue', next)
}

function reset() {
  emit('update:modelValue', {
    ...props.modelValue,
    district: '',
    street: '',
    keyword: '',
    pricedOnly: true,
    missingRefPrice: false,
    minWan: 2,
    maxWan: 32,
  })
}

function clearCondition(key: 'price' | 'district' | 'street' | 'keyword' | 'missingRefPrice') {
  if (key === 'price') update({ minWan: 2, maxWan: 32 })
  if (key === 'district') update({ district: '', street: '' })
  if (key === 'street') update({ street: '' })
  if (key === 'keyword') update({ keyword: '' })
  if (key === 'missingRefPrice') update({ missingRefPrice: false })
}
</script>

<template>
  <section class="filter-content">
    <div class="selected-heading">
      <strong>已选条件 <em>{{ selectedConditions.length }}</em></strong>
      <button class="text-button" type="button" @click="reset">清空</button>
    </div>
    <div v-if="selectedConditions.length" class="filter-chips" aria-label="已选筛选条件">
      <button
        v-for="condition in selectedConditions"
        :key="condition.key"
        type="button"
        @click="clearCondition(condition.key)"
      >{{ condition.label }} <span>×</span></button>
    </div>
    <p v-else class="filter-empty">当前使用默认全市范围</p>

    <label class="field">
      <span>小区名称</span>
      <input
        type="search"
        placeholder="例如：香蜜湖"
        :value="modelValue.keyword"
        @input="update({ keyword: ($event.target as HTMLInputElement).value })"
        @keyup.enter="emit('apply')"
      >
    </label>

    <div class="field-row">
      <label class="field">
        <span>行政区</span>
        <select
          :value="modelValue.district"
          @change="update({ district: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">全部区域</option>
          <option v-for="district in meta?.districts" :key="district" :value="district">
            {{ district }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>街道</span>
        <select
          :value="modelValue.street"
          @change="update({ street: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">全部街道</option>
          <option v-for="item in streets" :key="`${item.district}-${item.name}`" :value="item.name">
            {{ streetLabel(item) }}
          </option>
        </select>
      </label>
    </div>

    <div class="section-heading price-heading">
      <strong>单价范围（万元/㎡）</strong>
    </div>

    <div class="price-input-row">
      <input
        type="number"
        min="0"
        max="50"
        step="0.5"
        aria-label="最低单价"
        :value="modelValue.minWan"
        @change="update({ minWan: Math.min(Math.max(0, Number(($event.target as HTMLInputElement).value)), modelValue.maxWan) })"
      >
      <span>—</span>
      <input
        type="number"
        min="1"
        max="50"
        step="0.5"
        aria-label="最高单价"
        :value="modelValue.maxWan"
        @change="update({ maxWan: Math.max(Math.min(50, Number(($event.target as HTMLInputElement).value)), modelValue.minWan) })"
      >
    </div>

    <label class="range-field">
      <span>最低价</span>
      <input
        type="range"
        min="0"
        max="50"
        step="0.5"
        :value="modelValue.minWan"
        @input="update({ minWan: Math.min(Number(($event.target as HTMLInputElement).value), modelValue.maxWan) })"
      >
    </label>
    <label class="range-field">
      <span>最高价</span>
      <input
        type="range"
        min="1"
        max="50"
        step="0.5"
        :value="modelValue.maxWan"
        @input="update({ maxWan: Math.max(Number(($event.target as HTMLInputElement).value), modelValue.minWan) })"
      >
    </label>

    <label class="check-field ref-price-filter">
      <input
        type="checkbox"
        :checked="modelValue.missingRefPrice"
        @change="update({ missingRefPrice: ($event.target as HTMLInputElement).checked })"
      >
      <span>只看无官方参考价</span>
    </label>

    <button class="apply-filters-button" type="button" @click="emit('apply')">
      应用筛选 <span v-if="selectedConditions.length">（{{ selectedConditions.length }}）</span>
    </button>

  </section>
</template>
