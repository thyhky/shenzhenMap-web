<script setup lang="ts">
import { computed } from 'vue'
import type {
  EstateDetail,
  EstateMapItem,
  HistoryDays,
  MapSelection,
  PriceHistoryResponse,
} from '@/domain/types'

const props = defineProps<{
  item: MapSelection | null
  estateDetail: EstateDetail | null
  history: PriceHistoryResponse | null
  historyDays: HistoryDays
  loading: boolean
  historyLoading: boolean
  error: string
  historyError: string
}>()

const emit = defineEmits<{ 'update:historyDays': [days: HistoryDays] }>()

const periods: Array<{ label: string; days: HistoryDays }> = [
  { label: '1周', days: 7 },
  { label: '1月', days: 30 },
  { label: '1季度', days: 90 },
]

const selectedEstate = computed<EstateMapItem | EstateDetail | null>(() => {
  if (!props.item || !('kind' in props.item) || props.item.kind !== 'estate') return null
  return props.estateDetail?.id === props.item.id ? props.estateDetail : props.item
})

const otherDetail = computed(() => {
  const item = props.item
  if (!item || selectedEstate.value) return null
  if ('kind' in item) {
    if (item.kind === 'estate') return null
    return {
      title: `${item.count} 个小区`,
      subtitle: `${item.pricedCount} 个有有效价格`,
      primary: `均价 ${priceText(item.avgPrice)}`,
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

const refGap = computed(() => {
  const estate = selectedEstate.value
  if (!estate?.refPrice || !estate.price) return ''
  const difference = estate.price - estate.refPrice
  const percent = Math.abs(difference / estate.refPrice * 100).toFixed(1)
  return `挂牌${difference >= 0 ? '高于' : '低于'}参考价 ${percent}%`
})

const historyRows = computed(() => [...(props.history?.history ?? [])].reverse().map((point, index) => ({
  key: `${point.capturedAt}-${index}`,
  date: point.capturedAt.slice(0, 10),
  price: priceText(point.price),
  source: point.source,
})))

const historyTrend = computed(() => {
  const points = props.history?.history ?? []
  if (points.length < 2) return ''
  const first = points[0].price
  const last = points[points.length - 1].price
  const change = last - first
  const percent = first ? `（${(change / first * 100).toFixed(1)}%）` : ''
  return `${change >= 0 ? '+' : ''}${Math.round(change)} 元/㎡${percent}`
})

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(2)} 万元/㎡` : '暂无价格'
}

function distanceText(distance: number) {
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`
}
</script>

<template>
  <view v-if="selectedEstate" class="detail-sheet">
    <text class="eyebrow">{{ selectedEstate.district }} · {{ selectedEstate.street }}</text>
    <text class="name">{{ selectedEstate.name }}</text>
    <text class="price">{{ priceText(selectedEstate.price) }}</text>

    <view class="fact-grid">
      <view class="fact-card"><text class="fact-label">租金估算</text><text class="fact-value">{{ selectedEstate.rentPrice ? `${selectedEstate.rentPrice.toFixed(2)} 元/㎡/月` : '暂无' }}</text></view>
      <view class="fact-card"><text class="fact-label">租售比</text><text class="fact-value">{{ selectedEstate.rentYield === null ? '暂无' : `${selectedEstate.rentYield.toFixed(2)}%` }}</text></view>
      <view class="fact-card"><text class="fact-label">官方参考价</text><text class="fact-value">{{ priceText(selectedEstate.refPrice) }}</text></view>
      <view class="fact-card"><text class="fact-label">租金样本</text><text class="fact-value">{{ selectedEstate.rentSamples || 0 }}</text></view>
    </view>
    <text v-if="refGap" class="gap">{{ refGap }}</text>

    <text v-if="loading" class="status">正在读取完整详情…</text>
    <text v-if="error" class="error">{{ error }}</text>

    <view v-if="estateDetail?.nearbySchools.length" class="section">
      <text class="section-title">邻近学校参考</text>
      <view v-for="school in estateDetail.nearbySchools" :key="school.id" class="school-row">
        <text>{{ school.name }} · {{ school.levelLabel }}</text>
        <text class="school-distance">{{ distanceText(school.distanceMeters) }}</text>
      </view>
      <text class="caption">按点位直线距离计算，不代表官方招生范围或入学资格。</text>
    </view>

    <view v-if="estateDetail?.bestSchool" class="section policy">
      <text class="section-title">学位时间参考</text>
      <text>建议提前持有 {{ estateDetail.bestSchool.holdYearsAdvised ?? 0 }} 年</text>
      <text>学位锁定 {{ estateDetail.bestSchool.lockYears ?? (estateDetail.bestSchool.level === 'primary' ? 6 : 3) }} 年</text>
      <text v-if="estateDetail.bestSchool.degreePolicyNote" class="caption">{{ estateDetail.bestSchool.degreePolicyNote }}</text>
    </view>

    <view class="section history">
      <view class="history-head">
        <text class="section-title">价格记录</text>
        <view class="periods">
          <button
            v-for="period in periods"
            :key="period.days"
            class="period-button"
            :class="{ active: historyDays === period.days }"
            @click="emit('update:historyDays', period.days)"
          >{{ period.label }}</button>
        </view>
      </view>
      <text v-if="!historyLoading && !historyError && historyTrend" class="trend">{{ historyTrend }}</text>
      <text v-if="historyLoading" class="status">正在读取价格历史…</text>
      <text v-else-if="historyError" class="error">{{ historyError }}</text>
      <view v-else-if="historyRows.length" class="history-list">
        <view v-for="row in historyRows" :key="row.key" class="history-row">
          <text class="history-date">{{ row.date }}</text><text>{{ row.price }}</text>
        </view>
      </view>
      <text v-else class="caption">暂无价格历史。</text>
      <text v-if="history?.truncated" class="caption">仅展示最近 {{ historyRows.length }} 条记录</text>
    </view>

    <view v-if="estateDetail" class="section source-grid">
      <text>片区：{{ estateDetail.placeName || estateDetail.areaName || '未知' }}</text>
      <text>价格口径：{{ estateDetail.priceSource || '未知' }}</text>
      <text>租金来源：{{ estateDetail.rentSource || '未知' }}</text>
      <text>租金观测：{{ estateDetail.rentObservedAt || '未知' }}</text>
      <text>来源观测：{{ estateDetail.sourceObservedAt || '未知' }}</text>
      <text>平台导入：{{ estateDetail.importedAt || '未知' }}</text>
    </view>
  </view>

  <view v-else-if="otherDetail" class="detail-sheet">
    <text class="name">{{ otherDetail.title }}</text>
    <text>{{ otherDetail.subtitle }}</text>
    <text class="price">{{ otherDetail.primary }}</text>
    <text v-for="row in otherDetail.rows" :key="row">{{ row }}</text>
    <text class="note">{{ otherDetail.note }}</text>
  </view>

  <view v-else class="empty">点击地图或结果列表选择一个小区</view>
</template>

<style scoped>
.detail-sheet { display: flex; flex-direction: column; gap: 12rpx; padding: 26rpx 28rpx 44rpx; color: #617074; font-size: 22rpx; }
.eyebrow { color: #8a6653; font-size: 18rpx; letter-spacing: 1rpx; }
.name { color: #17343a; font-family: serif; font-size: 34rpx; font-weight: 700; }
.price { color: #b64c39; font-family: serif; font-size: 29rpx; }
.fact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10rpx; margin: 8rpx 0; }
.fact-card { display: flex; flex-direction: column; gap: 5rpx; border: 1rpx solid rgba(23, 52, 58, 0.12); border-radius: 9rpx; background: #f6f1e7; padding: 14rpx; }
.fact-grid .fact-label { color: #7a8587; font-size: 17rpx; }
.fact-grid .fact-value { color: #17343a; font-size: 21rpx; font-weight: 700; }
.gap, .trend { color: #b64c39; font-weight: 700; }
.section { display: flex; flex-direction: column; gap: 10rpx; margin-top: 8rpx; border-top: 1rpx solid rgba(23, 52, 58, 0.14); padding-top: 18rpx; }
.section-title { color: #17343a; font-size: 23rpx; font-weight: 700; }
.school-row, .history-row, .history-head { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.school-distance, .history-date { color: #7a8587; font-size: 18rpx; }
.caption { color: #8a8580; font-size: 18rpx; line-height: 1.55; }
.periods { display: flex; gap: 5rpx; }
.period-button { margin: 0; border: 1rpx solid rgba(23, 52, 58, 0.14); border-radius: 7rpx; background: transparent; padding: 8rpx 10rpx; color: #617074; font-size: 17rpx; line-height: 1; }
.period-button::after { display: none; }
.period-button.active { border-color: #b64c39; background: #b64c39; color: #fff; }
.history-list { display: flex; flex-direction: column; }
.history-row { border-bottom: 1rpx solid rgba(23, 52, 58, 0.08); padding: 9rpx 0; }
.source-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); color: #7a8587; font-size: 18rpx; }
.status { color: #85614d; }
.error { border-radius: 8rpx; background: #f4dfda; padding: 11rpx; color: #8e362e; }
.note { margin-top: 18rpx; border-left: 4rpx solid #c29a74; padding-left: 14rpx; color: #85614d; font-size: 19rpx; line-height: 1.6; }
.empty { padding: 90rpx 20rpx; color: #7a8587; font-size: 22rpx; text-align: center; }
</style>
