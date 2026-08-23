import type { HeatmapResponse, Position } from '@/domain/types'
import { wgs84ToGcj02 } from '@/utils/coordinates'
import { PRICE_BANDS, priceColorRgba } from '@/utils/priceBands'

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
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void
  measureText(text: string): { width: number }
  textBaseline: string
}

function heatmapColor(price: number | null) {
  return priceColorRgba(price)
}

function drawPriceLegend(
  context: DrawingContext,
  x: number,
  y: number,
  width: number,
  bands: typeof PRICE_BANDS,
) {
  const swatch = Math.max(12, Math.round(width * 0.013))
  const gap = Math.max(8, Math.round(width * 0.008))
  const fontPx = Math.max(9, Math.round(width * 0.0095))
  context.font = `${fontPx}px sans-serif`
  context.textBaseline = 'middle'
  let cursor = x
  const center = y + swatch / 2
  bands.forEach((band) => {
    context.fillStyle = band.rgba
    context.fillRect(cursor, y, swatch, swatch)
    context.fillStyle = '#3a474a'
    context.fillText(band.label, cursor + swatch + 4, center)
    cursor += swatch + 4 + context.measureText(band.label).width + gap
  })
  context.textBaseline = 'alphabetic'
}

const OSM_TILE = (z: number, x: number, y: number) =>
  `https://a.tile.openstreetmap.org/${z}/${((x % 2 ** z) + 2 ** z) % 2 ** z}/${y}.png`

const TENCENT_TILE = (z: number, x: number, y: number) =>
  `https://rt${((x + y) % 4)}.map.gtimg.com/tile?z=${z}&x=${x}&y=${y}&type=roadmap&styleid=1`

function lngToTileX(lng: number, z: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}
function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}
function tileXToLng(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180
}
function tileYToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

async function loadOsmTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  if (typeof document === 'undefined') return null
  return new Promise((resolve) => {
    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = OSM_TILE(z, x, y)
  })
}

export interface HeatmapRenderOptions {
  tileProvider?: 'osm' | 'tencent'
  loadTileImage?: (src: string) => Promise<unknown | null>
}

export async function renderHeatmap(
  context: DrawingContext,
  width: number,
  height: number,
  data: HeatmapResponse,
  options: HeatmapRenderOptions = {},
) {
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

  const provider = options.tileProvider ?? 'osm'
  const drewTiles = await drawTileBackground(context, provider, options.loadTileImage, width, height, projectionBounds, scale, project)
  if (!drewTiles) {
    context.fillStyle = '#e8e1d4'
    context.fillRect(0, 0, width, height)
  } else {
    context.fillStyle = 'rgba(255, 255, 255, 0.16)'
    context.fillRect(0, 0, width, height)
  }

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

  context.fillStyle = '#617074'
  context.font = `${Math.max(10, Math.round(width * 0.009))}px sans-serif`
  context.fillText('颜色：小区挂牌均价', padding, height - padding * 1.02)
  drawPriceLegend(context, padding, height - padding * 0.92, width, PRICE_BANDS)
  context.fillStyle = '#617074'
  context.font = `${Math.max(9, Math.round(width * 0.0075))}px sans-serif`
  context.fillText('每个圆点代表一个小区 · 仅供研究参考', padding, height - padding * 0.4)

  const attr = provider === 'tencent' ? '底图 © 腾讯地图' : '底图 © OpenStreetMap'
  const attrW = Math.max(width * 0.16, 120)
  context.fillStyle = 'rgba(250, 246, 237, 0.92)'
  context.fillRect(width - padding - attrW, height - padding * 0.62, attrW, padding * 0.36)
  context.fillStyle = '#617074'
  context.fillText(attr, width - padding - attrW + 8, height - padding * 0.37)
}

async function fetchTile(
  provider: 'osm' | 'tencent',
  loadTileImage: ((src: string) => Promise<unknown | null>) | undefined,
  z: number,
  x: number,
  y: number,
  attempts = 2,
): Promise<unknown | null> {
  const src = provider === 'tencent' ? TENCENT_TILE(z, x, y) : OSM_TILE(z, x, y)
  for (let attempt = 0; attempt < attempts; attempt++) {
    const img = provider === 'tencent'
      ? (loadTileImage ? await loadTileImage(src) : null)
      : await loadOsmTile(z, x, y)
    if (img) return img
  }
  return null
}

async function drawTileBackground(
  context: DrawingContext,
  provider: 'osm' | 'tencent',
  loadTileImage: ((src: string) => Promise<unknown | null>) | undefined,
  width: number,
  height: number,
  bounds: { west: number; south: number; east: number; north: number },
  scale: number,
  project: (lngLat: Position) => [number, number],
): Promise<boolean> {
  let sourceBounds = bounds
  if (provider === 'tencent') {
    const northWest = wgs84ToGcj02(bounds.north, bounds.west)
    const southEast = wgs84ToGcj02(bounds.south, bounds.east)
    sourceBounds = {
      west: northWest.longitude,
      south: southEast.latitude,
      east: southEast.longitude,
      north: northWest.latitude,
    }
  } else if (typeof document === 'undefined' && !loadTileImage) {
    return false
  }
  const zoom = Math.max(1, Math.min(19, Math.floor(Math.log2((scale * 360) / 256))))
  const x0 = lngToTileX(sourceBounds.west, zoom)
  const x1 = lngToTileX(sourceBounds.east, zoom)
  const y0 = latToTileY(sourceBounds.north, zoom)
  const y1 = latToTileY(sourceBounds.south, zoom)
  const tiles: Array<[number, number]> = []
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) tiles.push([tx, ty])
  }
  const loaded = await Promise.all(tiles.map(async ([tx, ty]) => {
    const wrappedX = ((tx % 2 ** zoom) + 2 ** zoom) % 2 ** zoom
    const img = await fetchTile(provider, loadTileImage, zoom, wrappedX, ty)
    if (!img) return null
    const [sx, sy] = project([tileXToLng(tx, zoom), tileYToLat(ty, zoom)])
    const [ex, ey] = project([tileXToLng(tx + 1, zoom), tileYToLat(ty + 1, zoom)])
    return { img, x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy) }
  }))
  let drawn = false
  for (const tile of loaded) {
    if (!tile) continue
    context.drawImage(tile.img, tile.x, tile.y, tile.w, tile.h)
    drawn = true
  }
  return drawn
}

export function heatmapFilename(label: string) {
  return `${label.replace(/[\\/:*?"<>|]/g, '-')}-小区热力图.png`
}
