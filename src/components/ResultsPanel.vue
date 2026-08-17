<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EstateSort, EstateSummary } from '../types'

const props = defineProps<{
  results: EstateSummary[]
  total: number
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
}>()

const emit = defineEmits<{
  select: [estate: EstateSummary]
  'load-more': []
}>()

const sort = defineModel<EstateSort>('sort', { default: 'price-desc' })

const listFilter = ref('')

const SORT_OPTIONS: Array<{ value: EstateSort; label: string }> = [
  { value: 'price-desc', label: '价格从高到低' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'rent-yield', label: '租售比从高到低' },
]

const filteredResults = computed(() => {
  const keyword = listFilter.value.trim().toLowerCase()
  if (!keyword) return props.results
  return props.results.filter((estate) => (
    estate.name.toLowerCase().includes(keyword)
    || estate.district.toLowerCase().includes(keyword)
    || estate.street.toLowerCase().includes(keyword)
  ))
})

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}
</script>

<template>
  <section class="results-content">
    <div class="section-heading">
      <span>当前范围</span>
      <strong>已加载 {{ filteredResults.length }} / {{ total }}</strong>
    </div>
    <div class="result-toolbar">
      <select v-model="sort" class="sort-select" aria-label="结果排序">
        <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <input
        v-model="listFilter"
        class="list-search"
        type="search"
        placeholder="在结果中搜索..."
        aria-label="在结果列表中搜索"
      >
    </div>
    <div v-if="loading" class="panel-message">正在读取当前地图范围...</div>
    <div v-else-if="!filteredResults.length" class="panel-message">
      {{ listFilter ? '结果中没有匹配的小区。' : '当前条件下没有匹配的小区。' }}
    </div>
    <template v-else>
      <button
        v-for="estate in filteredResults"
        :key="estate.id"
        type="button"
        class="estate-row"
        @click="emit('select', estate)"
      >
        <span class="estate-copy">
          <strong>{{ estate.name }}</strong>
          <small>{{ estate.district }} · {{ estate.street }}</small>
        </span>
        <span class="estate-price" :class="{ muted: !estate.price }">{{ priceText(estate.price) }}</span>
      </button>
      <button
        v-if="hasMore && !listFilter"
        type="button"
        class="load-more-button"
        :disabled="loadingMore"
        @click="emit('load-more')"
      >
        {{ loadingMore ? '正在加载...' : '加载更多' }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.result-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.sort-select,
.list-search {
  border: 1px solid var(--line, #c9bda9);
  border-radius: 6px;
  background: var(--surface, #faf6ed);
  color: inherit;
  font-size: 12px;
  padding: 6px 8px;
}
.sort-select {
  flex: 0 0 auto;
  max-width: 148px;
}
.list-search {
  flex: 1;
  min-width: 0;
}
</style>