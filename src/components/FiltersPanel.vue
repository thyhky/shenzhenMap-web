<script setup lang="ts">
import { computed } from 'vue'
import type { EstateFilters, MetaResponse } from '../types'

const props = defineProps<{
  modelValue: EstateFilters
  meta: MetaResponse | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: EstateFilters]
}>()

const streets = computed(() => {
  const all = props.meta?.streets ?? []
  return props.modelValue.district
    ? all.filter((item) => item.district === props.modelValue.district)
    : all
})

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
    minWan: 2,
    maxWan: 32,
  })
}
</script>

<template>
  <section class="filter-content">
    <div class="section-heading">
      <span>查找范围</span>
      <button class="text-button" type="button" @click="reset">清空</button>
    </div>

    <label class="field">
      <span>小区名称</span>
      <input
        type="search"
        placeholder="例如：香蜜湖"
        :value="modelValue.keyword"
        @input="update({ keyword: ($event.target as HTMLInputElement).value })"
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
            {{ item.name }}
          </option>
        </select>
      </label>
    </div>

    <div class="section-heading price-heading">
      <span>单价范围</span>
      <strong>{{ modelValue.minWan.toFixed(1) }} - {{ modelValue.maxWan.toFixed(1) }} 万/㎡</strong>
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

  </section>
</template>
