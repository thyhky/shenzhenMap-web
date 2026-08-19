<script setup lang="ts">
import type { MapItem } from '@/domain/types'

const props = defineProps<{ item: MapItem }>()
const emit = defineEmits<{ close: []; details: [] }>()

function priceText() {
  const price = props.item.kind === 'cluster' ? props.item.avgPrice : props.item.price
  return price ? `${(price / 10000).toFixed(1)}万/㎡` : '暂无价格'
}
</script>

<template>
  <view class="brief-card">
    <view class="copy">
      <text class="name">{{ item.kind === 'cluster' ? `${item.count} 个小区` : item.name }}</text>
      <text class="meta">
        {{ item.kind === 'cluster' ? `${item.pricedCount} 个有有效价格` : `${item.district} · ${item.street}` }}
      </text>
    </view>
    <text class="price">{{ priceText() }}</text>
    <button class="details" @click="emit('details')">查看</button>
    <button class="close" @click="emit('close')">×</button>
  </view>
</template>

<style scoped>
.brief-card { position: fixed; z-index: 7; right: 20rpx; bottom: calc(124rpx + env(safe-area-inset-bottom)); left: 20rpx; display: flex; align-items: center; gap: 18rpx; border: 1rpx solid rgba(23, 52, 58, 0.16); border-radius: 14rpx; background: rgba(250, 246, 237, 0.97); padding: 17rpx 18rpx; box-shadow: 0 12rpx 36rpx rgba(18, 42, 46, 0.18); }
.copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 4rpx; }
.name { overflow: hidden; color: #17343a; font-size: 24rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.meta { overflow: hidden; color: #7a8587; font-size: 18rpx; text-overflow: ellipsis; white-space: nowrap; }
.price { flex: none; color: #b64c39; font-size: 21rpx; font-weight: 700; }
.details, .close { flex: none; margin: 0; border: 0; border-radius: 8rpx; line-height: 1; }
.details { background: #17343a; padding: 13rpx 16rpx; color: #fff; font-size: 19rpx; }
.close { background: transparent; padding: 10rpx; color: #7a8587; font-size: 32rpx; }
.details::after, .close::after { display: none; }
</style>
