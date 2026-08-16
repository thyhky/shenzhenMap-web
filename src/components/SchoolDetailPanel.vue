<script setup lang="ts">
import { computed } from 'vue'
import type { DataScopeMetadata, SchoolFeature } from '../types'

const props = defineProps<{
  school: SchoolFeature
  scope: DataScopeMetadata | null
}>()

const sourceName = computed(() => {
  const url = props.school.properties.sourceUrl
  if (url.includes('szgm.gov.cn')) return '光明区教育局公告'
  if (url.includes('szns.gov.cn')) return '南山区教育局公告'
  return '官方公告'
})
</script>

<template>
  <section class="detail-content school-detail">
    <div class="detail-title">
      <span>{{ school.properties.district }} · {{ school.properties.levelLabel }} · 2026 试点</span>
      <h2>{{ school.properties.name }}</h2>
    </div>
    <p v-if="school.properties.groupName" class="school-group">{{ school.properties.groupName }}</p>
    <section class="school-zones">
      <strong>官方招生社区</strong>
      <div class="zone-tags">
        <span v-for="zone in school.properties.zones" :key="zone">{{ zone }}</span>
      </div>
    </section>
    <dl class="detail-grid">
      <div><dt>学校地址</dt><dd>{{ school.properties.address }}</dd></div>
      <div><dt>咨询电话</dt><dd>{{ school.properties.phones.join('、') || '未公开' }}</dd></div>
      <div><dt>建议提前持有</dt><dd>{{ school.properties.holdYearsAdvised ?? 0 }} 年（入学前）</dd></div>
      <div><dt>学位锁定</dt><dd>{{ school.properties.lockYears ?? (school.properties.level === 'primary' ? 6 : 3) }} 年（入学后）</dd></div>
      <div><dt>公告日期</dt><dd>{{ school.properties.sourcePublished }}</dd></div>
      <div>
        <dt>官方来源</dt>
        <dd>
          <a :href="school.properties.sourceUrl" target="_blank" rel="noopener noreferrer">
            {{ sourceName }}
          </a>
        </dd>
      </div>
    </dl>
    <p v-if="school.properties.degreePolicyNote" class="detail-disclaimer">{{ school.properties.degreePolicyNote }}</p>
    <section v-if="school.properties.leyoujia" class="school-supplement">
      <div class="history-heading"><strong>乐有家补充</strong><span>公开详情页</span></div>
      <dl class="detail-grid">
        <div><dt>学校级别</dt><dd>{{ school.properties.leyoujia.level || '未提供' }}</dd></div>
        <div><dt>建校年份</dt><dd>{{ school.properties.leyoujia.established || '未提供' }}</dd></div>
      </dl>
      <p v-if="school.properties.leyoujia.admissionScores" class="admission-scores">
        <strong>历年录取积分</strong>{{ school.properties.leyoujia.admissionScores }}
      </p>
      <div v-if="school.properties.leyoujia.nearbyEstates.length" class="nearby-estates">
        <strong>页面所列附近小区</strong>
        <span v-for="estate in school.properties.leyoujia.nearbyEstates" :key="estate">{{ estate }}</span>
      </div>
      <p class="detail-disclaimer">录取积分与附近小区来自乐有家公开学校详情页；“附近”不代表官方划片。</p>
    </section>
    <p v-if="scope?.disclaimer" class="detail-disclaimer">{{ scope.disclaimer }}</p>
  </section>
</template>
