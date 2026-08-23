<script setup lang="ts">
import { PRICE_BANDS, NO_PRICE_COLOR } from '@/utils/priceBands'

defineProps<{ absolute?: boolean }>()
</script>

<template>
  <view class="price-legend" :class="{ absolute }">
    <view class="legend-row" v-for="band in PRICE_BANDS" :key="band.label">
      <view class="swatch" :style="{ background: band.color }" />
      <text class="legend-label">{{ band.label }}</text>
    </view>
    <view class="legend-row">
      <view class="swatch" :style="{ background: NO_PRICE_COLOR }" />
      <text class="legend-label">暂无价格</text>
    </view>
  </view>
</template>

<style scoped>
.price-legend {
  position: fixed;
  z-index: 7;
  left: 20rpx;
  bottom: calc(150rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  border: 1rpx solid rgba(23, 52, 58, 0.14);
  border-radius: 10rpx;
  background: rgba(250, 246, 237, 0.94);
  padding: 10rpx 12rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 42, 46, 0.12);
}
.price-legend.absolute {
  position: absolute;
  bottom: 16px;
  left: 16px;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.swatch {
  width: 22rpx;
  height: 22rpx;
  border-radius: 4rpx;
  border: 1rpx solid rgba(23, 52, 58, 0.25);
}
.legend-label {
  color: #3a474a;
  font-size: 18rpx;
  line-height: 1.1;
}
</style>
