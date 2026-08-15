<script setup lang="ts">
import type { EstateSummary } from '../types'

defineProps<{
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

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}
</script>

<template>
  <section class="results-content">
    <div class="section-heading">
      <span>当前范围</span>
      <strong>已加载 {{ results.length }} / {{ total }}</strong>
    </div>
    <div v-if="loading" class="panel-message">正在读取当前地图范围...</div>
    <div v-else-if="!results.length" class="panel-message">当前条件下没有匹配的小区。</div>
    <template v-else>
      <button
        v-for="estate in results"
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
        v-if="hasMore"
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
