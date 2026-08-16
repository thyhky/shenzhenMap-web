<script setup lang="ts">
import type { RankingItem } from '../types'

const props = defineProps<{
  items: RankingItem[]
  total: number
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  sort: 'price' | 'rentYield'
}>()

const emit = defineEmits<{
  select: [estate: RankingItem]
  'load-more': []
  'change-sort': [sort: 'price' | 'rentYield']
}>()

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}

function yieldText(value: number | null) {
  return value !== null && value !== undefined ? `${value.toFixed(2)}%` : '暂无租金'
}
</script>

<template>
  <section class="results-content ranking-content">
    <div class="section-heading">
      <span>小区榜单</span>
      <strong>{{ total }} 个</strong>
    </div>
    <div class="rank-controls">
      <button type="button" :class="{ active: sort === 'rentYield' }" @click="emit('change-sort', 'rentYield')">租售比</button>
      <button type="button" :class="{ active: sort === 'price' }" @click="emit('change-sort', 'price')">价格</button>
    </div>
    <div v-if="loading" class="panel-message">正在加载榜单...</div>
    <div v-else-if="!items.length" class="panel-message">当前条件下没有可排名的小区。</div>
    <template v-else>
      <button
        v-for="estate in props.items"
        :key="estate.id"
        type="button"
        class="estate-row ranking-row"
        @click="emit('select', estate)"
      >
        <span class="rank-badge">{{ estate.rank }}</span>
        <span class="estate-copy">
          <strong>{{ estate.name }}</strong>
          <small>{{ estate.district }} · {{ estate.street }}</small>
        </span>
        <span class="estate-price" :class="{ muted: !estate.price && !estate.rentYield }">
          {{ sort === 'price' ? priceText(estate.price) : yieldText(estate.rentYield) }}
        </span>
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
