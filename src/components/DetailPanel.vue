<script setup lang="ts">
import { computed } from 'vue'
import type { DataScopeMetadata, EstateDetail, PriceHistoryResponse } from '../types'

const props = defineProps<{
  estate: EstateDetail | null
  loading: boolean
  history: PriceHistoryResponse | null
  historyLoading: boolean
  scope: DataScopeMetadata | null
}>()

function priceText(price: number | null) {
  return price ? `${(price / 10000).toFixed(2)} 万元/㎡` : '暂无有效价格'
}

const refGap = computed(() => {
  if (!props.estate?.refPrice || !props.estate?.price) return null
  const diff = props.estate.price - props.estate.refPrice
  return { diff, percent: (diff / props.estate.refPrice) * 100 }
})

const historyPoints = computed(() => props.history?.history ?? [])
const trend = computed(() => {
  const points = historyPoints.value
  if (points.length < 2) return null
  const first = points[0].price
  const last = points[points.length - 1].price
  return {
    change: last - first,
    percent: first ? ((last - first) / first) * 100 : null,
  }
})
const chartPoints = computed(() => {
  const points = historyPoints.value
  if (points.length < 2) return ''
  const prices = points.map((point) => point.price)
  const min = Math.min(...prices)
  const span = Math.max(1, Math.max(...prices) - min)
  return points.map((point, index) => {
    const x = 4 + (index / (points.length - 1)) * 232
    const y = 66 - ((point.price - min) / span) * 58
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})
</script>

<template>
  <section class="detail-content">
    <div v-if="loading" class="panel-message">正在读取小区详情...</div>
    <div v-else-if="!estate" class="empty-detail">
      <span class="empty-mark">＋</span>
      <strong>选择一个小区</strong>
      <p>点击地图点位或结果列表，这里将展示完整信息。</p>
    </div>
    <template v-else>
      <div class="detail-title">
        <span>{{ estate.district }} · {{ estate.street }}</span>
        <h2>{{ estate.name }}</h2>
      </div>
      <div class="detail-price">{{ priceText(estate.price) }}</div>
      <div v-if="estate.refPrice" class="ref-price">
        <span>官方成交参考价</span>
        <strong>{{ (estate.refPrice / 10000).toFixed(2) }} 万元/㎡</strong>
        <small v-if="refGap" :class="{ up: refGap.diff > 0 }">
          挂牌{{ refGap.diff > 0 ? '高于' : '低于' }}参考价 {{ Math.abs(refGap.percent).toFixed(1) }}%
        </small>
      </div>
      <section v-if="estate.nearbySchools.length" class="nearby-schools">
        <strong>邻近学校参考</strong>
        <div v-for="school in estate.nearbySchools" :key="school.id">
          <span>{{ school.name }} · {{ school.levelLabel }}</span>
          <small>约 {{ school.distanceMeters >= 1000 ? `${(school.distanceMeters / 1000).toFixed(1)} km` : `${school.distanceMeters} m` }}</small>
        </div>
        <p>按学校与小区点位直线距离计算，不代表官方招生范围或入学资格。</p>
      </section>
      <section class="price-history" aria-label="价格历史">
        <div class="history-heading">
          <strong>价格记录</strong>
          <span v-if="trend" :class="{ down: trend.change < 0 }">
            {{ trend.change >= 0 ? '+' : '' }}{{ Math.round(trend.change) }} 元/㎡
            <template v-if="trend.percent !== null">（{{ trend.percent.toFixed(1) }}%）</template>
          </span>
        </div>
        <div v-if="historyLoading" class="history-empty">正在读取价格历史...</div>
        <svg v-else-if="historyPoints.length >= 2" viewBox="0 0 240 70" role="img" aria-label="价格变化折线">
          <polyline :points="chartPoints" fill="none" stroke="#bb5a3c" stroke-width="2.5" vector-effect="non-scaling-stroke" />
        </svg>
        <div v-else class="history-empty">
          {{ historyPoints.length === 1 ? '目前仅有一条价格记录，暂无趋势。' : '暂无价格历史。' }}
        </div>
        <small v-if="history?.truncated">仅展示最近 {{ historyPoints.length }} 条记录</small>
      </section>
      <dl class="detail-grid">
        <div><dt>片区</dt><dd>{{ estate.placeName || '未知' }}</dd></div>
        <div>
          <dt>数据来源</dt>
          <dd>
            <a v-if="scope?.source?.url" :href="scope.source.url" target="_blank" rel="noopener noreferrer">{{ scope.source.name }}</a>
            <template v-else>{{ scope?.source?.name || '未知' }}</template>
          </dd>
        </div>
        <div><dt>价格口径</dt><dd>{{ estate.priceSource || '未知' }}</dd></div>
        <div><dt>来源版本</dt><dd>{{ scope?.sourceVersion || '未知' }}</dd></div>
        <div><dt>来源观测</dt><dd>{{ estate.sourceObservedAt || '未知' }}</dd></div>
        <div><dt>平台导入</dt><dd>{{ estate.importedAt || '未知' }}</dd></div>
        <div><dt>记录变更</dt><dd>{{ estate.recordChangedAt || '未知' }}</dd></div>
        <div><dt>小区编号</dt><dd>{{ estate.id }}</dd></div>
      </dl>
      <p v-if="scope?.disclaimer" class="detail-disclaimer">{{ scope.disclaimer }}</p>
    </template>
  </section>
</template>
