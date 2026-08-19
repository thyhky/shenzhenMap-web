<script setup lang="ts">
import { computed } from 'vue'
import type { MapSelection } from '@/domain/types'

const props = defineProps<{ item: MapSelection | null }>()

const detail = computed(() => {
  const item = props.item
  if (!item) return null
  if ('kind' in item && item.kind === 'estate') {
    return {
      title: item.name,
      subtitle: `${item.district} · ${item.street}`,
      primary: item.price ? `${(item.price / 10000).toFixed(1)}万/㎡` : '暂无价格',
      rows: [
        `租售比：${item.rentYield === null ? '暂无' : `${item.rentYield.toFixed(2)}%`}`,
        `官方参考价：${item.refPrice ? `${(item.refPrice / 10000).toFixed(1)}万/㎡` : '暂无'}`,
      ],
      note: '完整学校、价格历史和数据来源将在详情迁移阶段接入。',
    }
  }
  if ('kind' in item) {
    return {
      title: `${item.count} 个小区`,
      subtitle: `${item.pricedCount} 个有有效价格`,
      primary: `均价 ${item.avgPrice ? `${(item.avgPrice / 10000).toFixed(1)}万/㎡` : '暂无'}`,
      rows: [],
      note: '聚合范围已放大，请继续选择具体小区查看详情。',
    }
  }
  if ('id' in item.properties) {
    const phone = item.properties.phones[0]
    return {
      title: item.properties.name,
      subtitle: `${item.properties.levelLabel} · ${item.properties.district}`,
      primary: `${item.properties.zones.length} 个招生社区`,
      rows: [
        item.properties.address || '暂无地址',
        phone ? `咨询电话：${phone}` : '暂无咨询电话',
        item.properties.zoneText || '暂无招生范围说明',
      ],
      note: item.properties.degreePolicyNote || `数据来源年份：${item.properties.sourceYear}`,
    }
  }
  return {
    title: item.properties.name,
    subtitle: `${item.properties.levelLabel} · ${item.properties.district}`,
    primary: `${item.properties.zones.length} 个招生社区`,
    rows: [item.properties.zones.join('、') || '暂无招生社区'],
    note: item.properties.method === 'official-boundary'
      ? '官方划片边界'
      : '基于官方招生社区名称生成的近似范围，非官方边界。',
  }
})
</script>

<template>
  <view v-if="detail" class="detail-sheet">
    <text class="name">{{ detail.title }}</text>
    <text>{{ detail.subtitle }}</text>
    <text class="price">{{ detail.primary }}</text>
    <text v-for="row in detail.rows" :key="row">{{ row }}</text>
    <text class="note">{{ detail.note }}</text>
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
