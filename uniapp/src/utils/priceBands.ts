export interface PriceBand {
  limit: number
  label: string
  color: string
  rgba: string
}

export const PRICE_BANDS: PriceBand[] = [
  { limit: 35000, label: '3.5万以下', color: '#1f5fbf', rgba: 'rgba(31, 95, 191, 0.72)' },
  { limit: 50000, label: '3.5–5万', color: '#12b5c4', rgba: 'rgba(18, 181, 196, 0.72)' },
  { limit: 70000, label: '5–7万', color: '#36a832', rgba: 'rgba(54, 168, 50, 0.72)' },
  { limit: 90000, label: '7–9万', color: '#f2c200', rgba: 'rgba(242, 194, 0, 0.8)' },
  { limit: 120000, label: '9–12万', color: '#f5821f', rgba: 'rgba(245, 130, 31, 0.8)' },
  { limit: Infinity, label: '12万以上', color: '#e23b2e', rgba: 'rgba(226, 59, 46, 0.82)' },
]

export const NO_PRICE_COLOR = '#8a9494'

export function priceBandIndex(price: number | null): number {
  if (price == null) return -1
  for (let index = 0; index < PRICE_BANDS.length; index += 1) {
    if (price < PRICE_BANDS[index].limit) return index
  }
  return PRICE_BANDS.length - 1
}

export function priceColor(price: number | null): string {
  if (price == null) return NO_PRICE_COLOR
  return PRICE_BANDS[priceBandIndex(price)].color
}

export function priceColorRgba(price: number | null): string {
  if (price == null) return 'rgba(138, 148, 148, 0.6)'
  return PRICE_BANDS[priceBandIndex(price)].rgba
}
