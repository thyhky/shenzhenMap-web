<script setup lang="ts">
import type { MapItem } from '@/domain/types'

defineProps<{ item: MapItem | null }>()
</script>

<template>
  <view v-if="item?.kind === 'estate'" class="detail-sheet">
    <text class="name">{{ item.name }}</text>
    <text>{{ item.district }} · {{ item.street }}</text>
    <text class="price">{{ item.price ? `${(item.price / 10000).toFixed(1)}万/㎡` : '暂无价格' }}</text>
    <text>租售比：{{ item.rentYield === null ? '暂无' : `${item.rentYield.toFixed(2)}%` }}</text>
    <text>官方参考价：{{ item.refPrice ? `${(item.refPrice / 10000).toFixed(1)}万/㎡` : '暂无' }}</text>
    <text class="note">完整学校、价格历史和数据来源将在详情迁移阶段接入。</text>
  </view>
  <view v-else-if="item" class="detail-sheet">
    <text class="name">{{ item.count }} 个小区</text>
    <text>{{ item.pricedCount }} 个有有效价格</text>
    <text class="price">均价 {{ item.avgPrice ? `${(item.avgPrice / 10000).toFixed(1)}万/㎡` : '暂无' }}</text>
    <text class="note">聚合范围已放大，请继续选择具体小区查看详情。</text>
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
