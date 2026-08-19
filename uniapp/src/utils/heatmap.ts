import type { HeatmapResponse, Position } from '@/domain/types'

export interface DrawingContext {
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  font: string
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
  fill(): void
  fillRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
}

function heatmapColor(price: number | null) {
  if (!price) return 'rgba(92, 105, 109, 0.42)'
  if (price < 35000) return 'rgba(47, 95, 179, 0.62)'
  if (price < 50000) return 'rgba(16, 160, 154, 0.62)'
  if (price < 70000) return 'rgba(121, 168, 47, 0.62)'
  if (price < 90000) return 'rgba(227, 182, 87, 0.62)'
  if (price < 120000) return 'rgba(223, 123, 69, 0.64)'
  return 'rgba(187, 62, 69, 0.66)'
}

export function renderHeatmap(context: DrawingContext, width: number, height: number, data: HeatmapResponse) {
  if (!data.bounds) throw new Error('当前范围没有可导出的数据')
  const boundaryPoints = data.boundaries.flatMap((feature) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
    return polygons.flatMap((polygon) => polygon.flat())
  })
  const projectionBounds = boundaryPoints.length
    ? {
        west: Math.min(data.bounds.west, ...boundaryPoints.map(([longitude]) => longitude)),
        south: Math.min(data.bounds.south, ...boundaryPoints.map(([, latitude]) => latitude)),
        east: Math.max(data.bounds.east, ...boundaryPoints.map(([longitude]) => longitude)),
        north: Math.max(data.bounds.north, ...boundaryPoints.map(([, latitude]) => latitude)),
      }
    : data.bounds
  const padding = Math.max(24, Math.round(Math.min(width, height) * 0.07))
  const titleY = Math.max(32, padding * 0.48)
  const subtitleY = titleY + Math.max(18, padding * 0.28)
  const drawWidth = width - padding * 2
  const drawHeight = height - padding * 2
  const longitudeSpan = Math.max(projectionBounds.east - projectionBounds.west, 0.001)
  const latitudeSpan = Math.max(projectionBounds.north - projectionBounds.south, 0.001)
  const scale = Math.min(drawWidth / longitudeSpan, drawHeight / latitudeSpan)
  const project = ([longitude, latitude]: Position): [number, number] => [
    padding + (longitude - projectionBounds.west) * scale + (drawWidth - longitudeSpan * scale) / 2,
    height - padding - (latitude - projectionBounds.south) * scale - (drawHeight - latitudeSpan * scale) / 2,
  ]

  context.fillStyle = '#e8e1d4'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#17343a'
  context.font = `700 ${Math.max(20, Math.round(width * 0.019))}px sans-serif`
  context.fillText(`${data.label} 小区价格密度图`, padding, titleY)
  context.font = `${Math.max(11, Math.round(width * 0.009))}px sans-serif`
  context.fillStyle = '#617074'
  context.fillText(`小区 ${data.total} · 有价 ${data.priced} · 平均 ${data.averagePrice ? `${(data.averagePrice / 10000).toFixed(1)} 万/㎡` : '暂无'}`, padding, subtitleY)

  context.strokeStyle = 'rgba(111, 82, 67, 0.52)'
  context.lineWidth = Math.max(1, width / 1400)
  data.boundaries.forEach((feature) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
    polygons.forEach((polygon) => polygon.forEach((ring) => {
      if (ring.length < 3) return
      const first = project(ring[0])
      context.beginPath()
      context.moveTo(first[0], first[1])
      ring.slice(1).forEach((point) => {
        const [x, y] = project(point)
        context.lineTo(x, y)
      })
      context.closePath()
      context.stroke()
    }))
  })

  data.points.forEach((point) => {
    const [x, y] = project([point.lng, point.lat])
    context.beginPath()
    context.fillStyle = heatmapColor(point.price)
    context.arc(x, y, point.price ? Math.max(3.5, width / 360) : Math.max(2.5, width / 460), 0, Math.PI * 2)
    context.fill()
  })

  context.fillStyle = 'rgba(250, 246, 237, 0.92)'
  context.fillRect(padding, height - padding * 0.62, Math.min(drawWidth, width * 0.5), padding * 0.36)
  context.fillStyle = '#617074'
  context.font = `${Math.max(9, Math.round(width * 0.0075))}px sans-serif`
  context.fillText('颜色：小区挂牌均价；每个圆点代表一个小区；仅供研究参考', padding + 8, height - padding * 0.37)
}

export function heatmapFilename(label: string) {
  return `${label.replace(/[\\/:*?"<>|]/g, '-')}-小区热力图.png`
}
