<script setup lang="ts">
import { computed } from 'vue'
import type { MapItem } from '@/domain/types'

const props = defineProps<{
  latitude: number
  longitude: number
  zoom: number
  items: MapItem[]
}>()

const emit = defineEmits<{
  select: [item: MapItem]
  regionChange: [detail: unknown]
}>()

const priceBands = [35000, 50000, 70000, 90000, 120000]
const colors = ['#2f5fb3', '#10a09a', '#79a82f', '#e3b657', '#df7b45', '#bb3e45']

function priceColor(price: number | null) {
  if (!price) return '#7b8787'
  const index = priceBands.findIndex((limit) => price < limit)
  return colors[index === -1 ? colors.length - 1 : index]
}

const circles = computed(() => props.items.map((item) => ({
  latitude: item.lat,
  longitude: item.lng,
  radius: item.kind === 'cluster' ? 12 : 5,
  color: priceColor(item.kind === 'cluster' ? item.avgPrice : item.price),
  fillColor: priceColor(item.kind === 'cluster' ? item.avgPrice : item.price),
  strokeWidth: 1,
})))

const clusterItems = computed(() => props.items.filter((item) => item.kind === 'cluster'))
const markers = computed(() => clusterItems.value.map((item, index) => ({
    id: 1000000 + index,
    latitude: item.lat,
    longitude: item.lng,
    width: 1,
    height: 1,
    alpha: 0,
    label: {
      content: item.kind === 'cluster' ? String(item.count) : '',
      color: '#ffffff',
      fontSize: 10,
      anchorX: item.kind === 'cluster' && item.count >= 100 ? -9 : -6,
      anchorY: -5,
    },
  })))

function markerTap(event: unknown) {
  const markerId = Number((event as { detail?: { markerId?: number } }).detail?.markerId)
  const index = markerId - 1000000
  const item = clusterItems.value[index]
  if (item) emit('select', item)
}
</script>

<template>
  <map
    id="atlas-map"
    class="map-adapter"
    :latitude="latitude"
    :longitude="longitude"
    :scale="zoom"
    :circles="circles"
    :markers="markers"
    enable-zoom
    enable-scroll
    @markertap="markerTap"
    @regionchange="emit('regionChange', $event)"
  />
</template>

<style scoped>
.map-adapter { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
