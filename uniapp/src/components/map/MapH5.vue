<script setup lang="ts">
import type { MapItem } from '@/domain/types'

defineProps<{
  latitude: number
  longitude: number
  zoom: number
  items: MapItem[]
}>()
</script>

<template>
  <view class="map-adapter map-h5">
    <view class="adapter-note">
      <text class="label">H5 MAP ADAPTER</text>
      <text>Leaflet 适配器将在下一阶段迁入</text>
      <text class="count">当前数据 {{ items.length }} 个地图对象</text>
    </view>
  </view>
</template>

<style scoped>
.map-adapter { position: absolute; inset: 0; overflow: hidden; background: #dbe4dc; }
.map-h5 { background-image: linear-gradient(rgba(49, 91, 109, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(49, 91, 109, 0.08) 1px, transparent 1px); background-size: 44px 44px; }
.adapter-note { position: absolute; top: 170rpx; left: 50%; display: flex; flex-direction: column; align-items: center; gap: 10rpx; width: 430rpx; transform: translateX(-50%); border: 1rpx solid rgba(23, 52, 58, 0.16); border-radius: 16rpx; background: rgba(250, 246, 237, 0.92); padding: 28rpx; color: #617074; font-size: 21rpx; text-align: center; }
.label { color: #b64c39; font: 18rpx monospace; letter-spacing: 2rpx; }
.count { color: #17343a; font-weight: 700; }
</style>
