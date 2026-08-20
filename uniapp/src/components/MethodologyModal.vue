<script setup lang="ts">
import type { MetaResponse } from '@/domain/types'

defineProps<{ meta: MetaResponse }>()
const emit = defineEmits<{ close: [] }>()

function statusText(status: string) {
  if (status === 'active') return '已接入'
  if (status === 'planned') return '待接入'
  return '已停用'
}

function openUrl(url: string | null) {
  if (!url) return
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({ data: url })
  // #endif
}
</script>

<template>
  <view class="method-mask" @click="emit('close')">
    <view class="method-card" @click.stop>
      <view class="method-head"><text>数据来源与方法</text><button class="method-close" @click="emit('close')">关闭</button></view>
      <scroll-view scroll-y class="method-scroll">
        <text class="disclaimer">{{ meta.catalog.disclaimer }}</text>
        <view v-for="scope in meta.catalog.scopes" :key="scope.id" class="scope-card">
          <view class="scope-head"><text>{{ scope.label }}</text><text :class="['status', scope.status]">{{ statusText(scope.status) }}</text></view>
          <button v-if="scope.source" class="source" @click="openUrl(scope.source.url)">{{ scope.source.name }}</button>
          <text v-if="scope.sourceVersion">来源版本：{{ scope.sourceVersion }}</text>
          <text v-if="scope.sourceObservedAt">来源观测：{{ scope.sourceObservedAt }}</text>
          <text v-if="scope.importedAt">平台导入：{{ scope.importedAt }}</text>
          <text v-if="scope.licenseNote">许可说明：{{ scope.licenseNote }}</text>
          <text v-if="scope.disclaimer" class="scope-note">{{ scope.disclaimer }}</text>
          <button v-if="scope.termsUrl" class="terms" @click="openUrl(scope.termsUrl)">查看服务条款</button>
        </view>
        <text class="version">数据版本：{{ meta.catalog.dataVersion || '未知' }}</text>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.method-mask { position: fixed; z-index: 30; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(11, 31, 35, 0.58); padding: 28rpx; }
.method-card { width: min(700rpx, 680px); max-height: 86vh; overflow: hidden; border: 1rpx solid rgba(23, 52, 58, 0.18); border-radius: 18rpx; background: #faf6ed; box-shadow: 0 24rpx 80rpx rgba(11, 31, 35, 0.35); }
.method-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1rpx solid rgba(23, 52, 58, 0.14); padding: 22rpx 25rpx; color: #17343a; font-family: serif; font-size: 29rpx; font-weight: 700; }
.method-close, .source, .terms { margin: 0; border: 0; background: transparent; padding: 5rpx; color: #b64c39; font-size: 19rpx; line-height: 1.2; text-align: left; }
.method-close::after, .source::after, .terms::after { display: none; }
.method-scroll { box-sizing: border-box; max-height: calc(86vh - 84rpx); padding: 22rpx 25rpx 35rpx; }
.disclaimer { display: block; border-left: 4rpx solid #c29a74; padding-left: 14rpx; color: #85614d; font-size: 19rpx; line-height: 1.6; }
.scope-card { display: flex; flex-direction: column; gap: 8rpx; margin-top: 16rpx; border: 1rpx solid rgba(23, 52, 58, 0.12); border-radius: 10rpx; background: #fffdf8; padding: 16rpx; color: #617074; font-size: 18rpx; }
.scope-head { display: flex; align-items: center; justify-content: space-between; color: #17343a; font-size: 22rpx; font-weight: 700; }
.status { border-radius: 99rpx; padding: 3rpx 9rpx; font-size: 15rpx; font-weight: 400; }
.status.active { background: #dcebe4; color: #2f7867; }
.status.planned { background: #eee6d6; color: #8a6653; }
.status.retired { background: #eadfdf; color: #8e4a47; }
.scope-note, .version { color: #8a8580; line-height: 1.5; }
.version { display: block; margin-top: 18rpx; font: 16rpx monospace; word-break: break-all; }
</style>
