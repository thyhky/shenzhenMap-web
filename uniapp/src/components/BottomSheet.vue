<script setup lang="ts">
defineProps<{ visible: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <view v-if="visible" class="sheet-mask" @click="emit('close')">
    <view class="bottom-sheet" @click.stop>
      <view class="handle" />
      <view class="sheet-head">
        <text>{{ title }}</text>
        <button @click="emit('close')">关闭</button>
      </view>
      <scroll-view scroll-y class="sheet-scroll"><slot /></scroll-view>
    </view>
  </view>
</template>

<style scoped>
.sheet-mask { position: fixed; z-index: 10; inset: 0; background: rgba(11, 31, 35, 0.34); }
.bottom-sheet { position: fixed; right: 0; bottom: 0; left: 0; max-height: 74vh; border-radius: 30rpx 30rpx 0 0; background: #faf6ed; padding-bottom: env(safe-area-inset-bottom); box-shadow: 0 -18rpx 60rpx rgba(12, 35, 39, 0.28); }
.handle { width: 70rpx; height: 7rpx; margin: 14rpx auto 7rpx; border-radius: 99rpx; background: #c0b9ae; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1rpx solid rgba(23, 52, 58, 0.14); padding: 12rpx 28rpx; color: #17343a; font-family: serif; font-size: 28rpx; font-weight: 700; }
.sheet-head button { margin: 0; border: 0; background: transparent; padding: 8rpx; color: #b64c39; font-size: 21rpx; line-height: 1; }
.sheet-head button::after { display: none; }
.sheet-scroll { max-height: calc(74vh - 96rpx - env(safe-area-inset-bottom)); }
</style>
