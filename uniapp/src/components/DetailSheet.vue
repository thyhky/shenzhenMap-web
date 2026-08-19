<script setup lang="ts">
import type { EstateSummary } from '@/domain/types'

defineProps<{ estate: EstateSummary | null }>()
</script>

<template>
  <view v-if="estate" class="detail-sheet">
    <text class="name">{{ estate.name }}</text>
    <text>{{ estate.district }} · {{ estate.street }}</text>
    <text class="price">{{ estate.price ? `${(estate.price / 10000).toFixed(1)}万/㎡` : '暂无价格' }}</text>
    <text>租售比：{{ estate.rentYield === null ? '暂无' : `${estate.rentYield.toFixed(2)}%` }}</text>
    <text>官方参考价：{{ estate.refPrice ? `${(estate.refPrice / 10000).toFixed(1)}万/㎡` : '暂无' }}</text>
    <text class="note">完整学校、价格历史和数据来源将在详情迁移阶段接入。</text>
  </view>
  <view v-else class="empty">点击地图或结果列表选择一个小区</view>
</template>

<style scoped>
.detail-sheet { display: flex; flex-direction: column; gap: 12rpx; padding: 26rpx 28rpx 44rpx; color: #617074; font-size: 22rpx; }
.name { color: #17343a; font-family: serif; font-size: 34rpx; font-weight: 700; }
.price { color: #b64c39; font-family: serif; font-size: 29rpx; }
.note { margin-top: 18rpx; border-left: 4rpx solid #c29a74; padding-left: 14rpx; color: #85614d; font-size: 19rpx; line-height: 1.6; }
.empty { padding: 90rpx 20rpx; color: #7a8587; font-size: 22rpx; text-align: center; }
</style>
