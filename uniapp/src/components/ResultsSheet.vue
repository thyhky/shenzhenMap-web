<script setup lang="ts">
import type { EstateSummary } from '@/domain/types'

defineProps<{ results: EstateSummary[]; total: number; loading: boolean }>()
const emit = defineEmits<{ select: [estate: EstateSummary] }>()

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}
</script>

<template>
  <view class="results-sheet">
    <view class="summary">已加载 {{ results.length }} / {{ total }}</view>
    <view v-if="loading" class="empty">正在加载当前范围…</view>
    <view v-else-if="!results.length" class="empty">当前范围没有结果</view>
    <template v-else>
      <button v-for="estate in results" :key="estate.id" class="result-row" @click="emit('select', estate)">
        <view class="copy"><text class="name">{{ estate.name }}</text><text class="meta">{{ estate.district }} · {{ estate.street }}</text></view>
        <text class="price">{{ priceText(estate.price) }}</text>
      </button>
    </template>
  </view>
</template>

<style scoped>
.results-sheet { padding: 10rpx 28rpx 40rpx; }
.summary { border-bottom: 1rpx solid rgba(23, 52, 58, 0.14); padding: 12rpx 0; color: #617074; font-size: 20rpx; }
.result-row { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; width: 100%; margin: 0; border: 0; border-bottom: 1rpx solid rgba(23, 52, 58, 0.1); border-radius: 0; background: transparent; padding: 20rpx 0; text-align: left; line-height: 1.3; }
.result-row::after { display: none; }
.copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 5rpx; }
.name { overflow: hidden; color: #17343a; font-size: 25rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.meta { color: #7a8587; font-size: 18rpx; }
.price { flex: none; color: #b64c39; font-size: 22rpx; }
.empty { padding: 70rpx 20rpx; color: #7a8587; font-size: 22rpx; text-align: center; }
</style>
