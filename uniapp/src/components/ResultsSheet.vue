<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EstateSort, EstateSummary, RankingItem, RankingSort } from '@/domain/types'

const props = defineProps<{
  mode: 'results' | 'ranking'
  results: EstateSummary[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  sort: EstateSort
  ranking: RankingItem[]
  rankingTotal: number
  rankingLoading: boolean
  rankingLoadingMore: boolean
  rankingHasMore: boolean
  rankingSort: RankingSort
}>()

const emit = defineEmits<{
  select: [estate: EstateSummary]
  'update:mode': [mode: 'results' | 'ranking']
  'update:sort': [sort: EstateSort]
  'update:ranking-sort': [sort: RankingSort]
  'load-more-results': []
  'load-more-ranking': []
}>()

const listKeyword = ref('')
const hasListKeyword = computed(() => Boolean(listKeyword.value.trim()))
const visibleResults = computed(() => {
  const keyword = listKeyword.value.trim().toLowerCase()
  if (!keyword) return props.results
  return props.results.filter((item) => (
    item.name.toLowerCase().includes(keyword)
    || item.district.toLowerCase().includes(keyword)
    || item.street.toLowerCase().includes(keyword)
  ))
})

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}

function rankingValue(item: RankingItem) {
  if (props.rankingSort === 'price') return priceText(item.price)
  return item.rentYield === null ? '暂无租售比' : `${item.rentYield.toFixed(2)}%`
}
</script>

<template>
  <view class="results-sheet">
    <view class="tabs" role="tablist" aria-label="结果类型">
      <button class="tab-button" :class="{ active: mode === 'results' }" role="tab" :aria-selected="mode === 'results'" @click="emit('update:mode', 'results')">范围结果</button>
      <button class="tab-button" :class="{ active: mode === 'ranking' }" role="tab" :aria-selected="mode === 'ranking'" @click="emit('update:mode', 'ranking')">小区榜单</button>
    </view>

    <template v-if="mode === 'results'">
      <view class="sorts">
        <button class="sort-button" :class="{ active: sort === 'price-desc' }" :aria-pressed="sort === 'price-desc'" @click="emit('update:sort', 'price-desc')">价格从高到低</button>
        <button class="sort-button" :class="{ active: sort === 'price-asc' }" :aria-pressed="sort === 'price-asc'" @click="emit('update:sort', 'price-asc')">价格从低到高</button>
        <button class="sort-button" :class="{ active: sort === 'rent-yield' }" :aria-pressed="sort === 'rent-yield'" @click="emit('update:sort', 'rent-yield')">租售比</button>
      </view>
      <input v-model="listKeyword" class="list-search" placeholder="仅搜索已加载结果" aria-label="搜索已加载结果" />
      <view class="summary" aria-live="polite">已加载 {{ results.length }} / {{ total }}<text v-if="hasListKeyword"> · 当前匹配 {{ visibleResults.length }}</text></view>
      <view v-if="loading && !results.length" class="empty">正在加载结果…</view>
      <view v-else-if="!visibleResults.length" class="empty">{{ listKeyword ? '已加载结果中没有匹配' : '当前筛选没有结果' }}</view>
      <template v-else>
        <button v-for="estate in visibleResults" :key="estate.id" class="result-row" @click="emit('select', estate)">
          <view class="copy"><text class="name">{{ estate.name }}</text><text class="meta">{{ estate.district }} · {{ estate.street }}</text></view>
          <view class="value"><text class="price">{{ priceText(estate.price) }}</text><text v-if="estate.rentYield !== null" class="yield">{{ estate.rentYield.toFixed(2) }}%</text></view>
        </button>
      </template>
      <button v-if="hasMore && !hasListKeyword" class="load-more" :class="{ disabled: loadingMore }" :disabled="loadingMore" @click="emit('load-more-results')">
        {{ loadingMore ? '正在加载…' : '加载更多结果' }}
      </button>
    </template>

    <template v-else>
      <view class="sorts ranking-sorts">
        <button class="sort-button" :class="{ active: rankingSort === 'rentYield' }" :aria-pressed="rankingSort === 'rentYield'" @click="emit('update:ranking-sort', 'rentYield')">租售比排行</button>
        <button class="sort-button" :class="{ active: rankingSort === 'price' }" :aria-pressed="rankingSort === 'price'" @click="emit('update:ranking-sort', 'price')">价格排行</button>
      </view>
      <view class="summary">已加载 {{ ranking.length }} / {{ rankingTotal }}</view>
      <view v-if="rankingLoading && !ranking.length" class="empty">正在加载榜单…</view>
      <view v-else-if="!ranking.length" class="empty">当前筛选没有榜单数据</view>
      <template v-else>
        <button v-for="estate in ranking" :key="estate.id" class="result-row" @click="emit('select', estate)">
          <text class="rank">#{{ estate.rank }}</text>
          <view class="copy"><text class="name">{{ estate.name }}</text><text class="meta">{{ estate.district }} · {{ estate.street }}</text></view>
          <text class="price">{{ rankingValue(estate) }}</text>
        </button>
      </template>
      <button v-if="rankingHasMore" class="load-more" :class="{ disabled: rankingLoadingMore }" :disabled="rankingLoadingMore" @click="emit('load-more-ranking')">
        {{ rankingLoadingMore ? '正在加载…' : '加载更多榜单' }}
      </button>
    </template>
  </view>
</template>

<style scoped>
.results-sheet { padding: 10rpx 28rpx 40rpx; }
.tabs, .sorts { display: flex; gap: 7rpx; }
.tabs { margin-bottom: 12rpx; border-bottom: 1rpx solid rgba(23, 52, 58, 0.14); padding-bottom: 10rpx; }
.tab-button, .sort-button { flex: 1; margin: 0; border: 1rpx solid rgba(23, 52, 58, 0.14); border-radius: 8rpx; background: transparent; padding: 11rpx 7rpx; color: #617074; font-size: 18rpx; line-height: 1.1; }
.tab-button::after, .sort-button::after, .load-more::after { display: none; }
.tab-button.active, .sort-button.active { border-color: #17343a; background: #17343a; color: #fff; }
.list-search { box-sizing: border-box; width: 100%; height: 40px; min-height: 40px; margin-top: 12rpx; border: 1rpx solid rgba(23, 52, 58, 0.16); border-radius: 9rpx; background: #fffdf8; padding: 0 12px; color: #17343a; font-size: 14px; line-height: 40px; }
.summary { border-bottom: 1rpx solid rgba(23, 52, 58, 0.14); padding: 13rpx 0; color: #617074; font-size: 20rpx; }
.result-row { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; width: 100%; margin: 0; border: 0; border-bottom: 1rpx solid rgba(23, 52, 58, 0.1); border-radius: 0; background: transparent; padding: 20rpx 0; text-align: left; line-height: 1.3; }
.result-row::after { display: none; }
.rank { flex: none; width: 52rpx; color: #b64c39; font: 700 18rpx monospace; }
.copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 5rpx; }
.name { overflow: hidden; color: #17343a; font-size: 25rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.meta { color: #7a8587; font-size: 18rpx; }
.value { display: flex; flex: none; flex-direction: column; align-items: flex-end; gap: 3rpx; }
.price { flex: none; color: #b64c39; font-size: 21rpx; }
.yield { color: #2f7867; font-size: 17rpx; }
.load-more { width: 100%; margin: 18rpx 0 0; border: 1rpx solid #17343a; border-radius: 9rpx; background: transparent; padding: 15rpx; color: #17343a; font-size: 20rpx; line-height: 1; }
.load-more.disabled { opacity: 0.5; }
.empty { padding: 70rpx 20rpx; color: #7a8587; font-size: 22rpx; text-align: center; }
</style>
