<script setup lang="ts">
import type { SheetName } from '@/domain/types'

defineProps<{
  active: SheetName
  district: string
  total: number
  selectedName: string
}>()

const emit = defineEmits<{
  select: [sheet: Exclude<SheetName, ''>]
}>()
</script>

<template>
  <view class="bottom-nav">
    <button class="nav-item" :class="{ active: active === 'filters' }" @click="emit('select', 'filters')">
      <text>筛选</text><text class="meta">{{ district || '全部区域' }}</text>
    </button>
    <button class="nav-item" :class="{ active: active === 'results' }" @click="emit('select', 'results')">
      <text>结果</text><text class="meta">{{ total }} 个</text>
    </button>
    <button class="nav-item" :class="{ active: active === 'detail' }" @click="emit('select', 'detail')">
      <text>详情</text><text class="meta">{{ selectedName || '未选择' }}</text>
    </button>
  </view>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 8;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  min-height: calc(104rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid rgba(23, 52, 58, 0.14);
  background: rgba(250, 246, 237, 0.97);
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -12rpx 36rpx rgba(18, 42, 46, 0.14);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  margin: 0;
  border: 0;
  border-right: 1rpx solid rgba(23, 52, 58, 0.12);
  border-radius: 0;
  background: transparent;
  color: #17343a;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.3;
}

.nav-item::after { display: none; }
.nav-item:last-child { border-right: 0; }
.nav-item.active { color: #b64c39; }
.meta { max-width: 190rpx; overflow: hidden; color: #7a8587; font-size: 17rpx; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
</style>
