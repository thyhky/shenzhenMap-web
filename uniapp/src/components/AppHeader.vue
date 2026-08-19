<script setup lang="ts">
defineProps<{
  total: number
  averagePrice: number | null
  loading: boolean
  observedAt: string | null
}>()

const emit = defineEmits<{ methodology: [] }>()
</script>

<template>
  <view class="header-card">
    <view class="brand-line">
      <text class="title">深圳住区观察</text>
      <text class="api-badge">UNI</text>
    </view>
    <view class="stats">
      <text>小区 {{ total }}</text>
      <text>均价 {{ averagePrice ? `${(averagePrice / 10000).toFixed(1)}万` : '-' }}</text>
      <text v-if="observedAt" class="observed">{{ observedAt.slice(0, 10) }}</text>
      <text v-if="loading">更新中</text>
      <button @click="emit('methodology')">数据说明</button>
    </view>
  </view>
</template>

<style scoped>
.header-card {
  position: fixed;
  z-index: 5;
  top: calc(20rpx + env(safe-area-inset-top));
  right: 20rpx;
  left: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  border: 1rpx solid rgba(23, 52, 58, 0.14);
  border-radius: 14rpx;
  background: rgba(250, 246, 237, 0.96);
  padding: 16rpx 20rpx;
  box-shadow: 0 12rpx 36rpx rgba(18, 42, 46, 0.16);
}

.brand-line,
.stats {
  display: flex;
  align-items: center;
}

.brand-line { flex: none; gap: 10rpx; white-space: nowrap; }
.title { color: #17343a; font-family: serif; font-size: 32rpx; font-weight: 700; }
.api-badge { border: 1rpx solid #2f7867; border-radius: 99rpx; padding: 2rpx 8rpx; color: #2f7867; font-size: 16rpx; }
.stats { gap: 16rpx; color: #617074; font-size: 19rpx; white-space: nowrap; }
.stats button { margin: 0; border: 0; background: transparent; padding: 5rpx; color: #b64c39; font-size: 18rpx; line-height: 1; }
.stats button::after { display: none; }
@media (max-width: 480px) {
  .header-card { gap: 8rpx; }
  .title { font-size: 27rpx; }
  .stats { min-width: 0; justify-content: flex-end; gap: 8rpx; font-size: 17rpx; }
  .observed { display: none; }
}
</style>
