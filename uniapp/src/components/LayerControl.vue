<script setup lang="ts">
import type { MapLayerName } from '@/domain/types'

defineProps<{
  boundaries: boolean
  schools: boolean
  zones: boolean
  loading: Record<MapLayerName, boolean>
}>()

const emit = defineEmits<{ toggle: [layer: MapLayerName] }>()
</script>

<template>
  <view class="layer-control">
    <button class="layer-button" :class="{ active: boundaries }" @click="emit('toggle', 'boundaries')">
      {{ loading.boundaries ? '街道…' : '街道' }}
    </button>
    <button class="layer-button" :class="{ active: schools }" @click="emit('toggle', 'schools')">
      {{ loading.schools ? '学校…' : '学校' }}
    </button>
    <button class="layer-button" :class="{ active: zones }" @click="emit('toggle', 'zones')">
      {{ loading.zones ? '学区…' : '学区' }}
    </button>
  </view>
</template>

<style scoped>
.layer-control { position: fixed; z-index: 6; top: calc(112rpx + env(safe-area-inset-top)); right: 20rpx; display: flex; gap: 8rpx; border: 1rpx solid rgba(23, 52, 58, 0.14); border-radius: 10rpx; background: rgba(250, 246, 237, 0.94); padding: 6rpx; box-shadow: 0 8rpx 24rpx rgba(18, 42, 46, 0.12); }
.layer-button { margin: 0; border: 0; border-radius: 7rpx; background: transparent; padding: 10rpx 13rpx; color: #617074; font-size: 18rpx; line-height: 1; }
.layer-button::after { display: none; }
.layer-button.active { background: #17343a; color: #fff; }
</style>
