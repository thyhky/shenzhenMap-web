const app = getApp()
const apiBase = app.globalData.apiBase
const initialRegion = { west: 113.75, south: 22.43, east: 114.35, north: 22.86 }

function request(path, data = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase}${path}`,
      data,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data)
        else reject(new Error(response.data?.error || `请求失败 (${response.statusCode})`))
      },
      fail: reject,
    })
  })
}

function priceColor(price) {
  if (!price) return '#7b8787'
  if (price < 35000) return '#315b6d'
  if (price < 50000) return '#2d817c'
  if (price < 70000) return '#79a86b'
  if (price < 90000) return '#e3b657'
  if (price < 120000) return '#df7b45'
  return '#bb3e45'
}

function polygonCoordinates(geometry) {
  if (!geometry || geometry.type !== 'Polygon') return []
  return geometry.coordinates.map((ring) => ring.map(([longitude, latitude]) => ({ longitude, latitude })))
}

function markerTitle(item) {
  if (item.kind === 'cluster') return `${item.count} 个小区`
  return item.name
}

function priceText(price) {
  return price ? `${(price / 10000).toFixed(1)}万` : '暂无'
}

Page({
  data: {
    loading: true,
    error: '',
    districts: [],
    districtOptions: ['全部区域'],
    streets: [],
    district: '',
    street: '',
    minWan: 0,
    maxWan: 32,
    pricedOnly: true,
    showSchools: true,
    showZones: true,
    showResults: true,
    markers: [],
    circles: [],
    estateCircles: [],
    schoolCircles: [],
    polygons: [],
    results: [],
    total: 0,
    averagePrice: '-',
    selected: null,
  },

  onLoad() {
    this.loadMeta()
    this.loadMap()
    this.loadSchools()
  },

  async loadMeta() {
    try {
      const meta = await request('/api/meta')
      const districts = meta.districts || []
      this.setData({ districts, districtOptions: ['全部区域'].concat(districts), streets: meta.streets || [] })
    } catch (error) {
      this.showError(error)
    }
  },

  async loadMap() {
    this.setData({ loading: true })
    try {
      const map = await request('/api/estates', {
        ...initialRegion,
        zoom: 10,
        minPrice: this.data.minWan * 10000,
        maxPrice: this.data.maxWan * 10000,
        pricedOnly: this.data.pricedOnly ? 1 : 0,
        page: 1,
        pageSize: 20,
        district: this.data.district,
        street: this.data.street,
      })
      const markers = (map.items || []).map((item, index) => ({
        id: index + 1,
        latitude: item.lat,
        longitude: item.lng,
        title: markerTitle(item),
        callout: { content: markerTitle(item), display: 'BYCLICK', padding: 6, borderRadius: 4 },
        item,
      }))
      const circles = (map.items || []).map((item) => ({
        latitude: item.lat,
        longitude: item.lng,
        radius: item.kind === 'cluster' ? Math.min(1800, 250 + Math.sqrt(item.count) * 45) : 90,
        color: `${priceColor(item.kind === 'cluster' ? item.avgPrice : item.price)}88`,
        fillColor: `${priceColor(item.kind === 'cluster' ? item.avgPrice : item.price)}55`,
        strokeWidth: 1,
      }))
      this.setData({
        markers,
        estateCircles: circles,
        circles: this.data.showSchools ? circles.concat(this.data.schoolCircles || []) : circles,
        results: (map.results || []).map((item) => ({ ...item, priceText: priceText(item.price) })),
        total: map.stats?.total || 0,
        averagePrice: map.stats?.averagePrice ? `${(map.stats.averagePrice / 10000).toFixed(1)}万` : '-',
        loading: false,
      })
    } catch (error) {
      this.showError(error)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadSchools() {
    try {
      const [schools, zones] = await Promise.all([
        request('/api/schools'),
        request('/api/layers/school-zones'),
      ])
      const schoolCircles = (schools.features || []).map((feature) => ({
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        radius: 170,
        color: feature.properties.level === 'junior' ? '#c93f7788' : '#6d3fc988',
        fillColor: feature.properties.level === 'junior' ? '#c93f7755' : '#6d3fc955',
        strokeWidth: 2,
        school: feature.properties,
      }))
      const schoolMarkers = (schools.features || []).map((feature, index) => ({
        id: 100000 + index,
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        title: feature.properties.name,
        callout: { content: feature.properties.name, display: 'BYCLICK', padding: 6, borderRadius: 4 },
        item: feature.properties,
      }))
      const polygons = (zones.features || []).map((feature) => ({
        points: polygonCoordinates(feature.geometry),
        strokeColor: feature.properties.level === 'junior' ? '#c93f77aa' : '#6d3fc9aa',
        fillColor: feature.properties.level === 'junior' ? '#c93f7722' : '#6d3fc922',
        strokeWidth: 2,
        zone: feature.properties,
      }))
      this.setData({
        schoolCircles,
        polygons,
        markers: this.data.markers.concat(schoolMarkers),
        circles: this.data.showSchools ? (this.data.estateCircles || []).concat(schoolCircles) : (this.data.estateCircles || []),
      })
    } catch (error) {
      this.showError(error)
    }
  },

  showError(error) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    this.setData({ error: message, loading: false })
  },

  selectDistrict(event) {
    const district = this.data.districtOptions[event.detail.value] === '全部区域'
      ? ''
      : this.data.districtOptions[event.detail.value]
    const streets = this.data.streets.filter((item) => !district || item.district === district)
    this.setData({ district, street: '', streets }, () => this.loadMap())
  },

  selectStreet(event) {
    this.setData({ street: event.detail.value }, () => this.loadMap())
  },

  toggleSchools() {
    const showSchools = !this.data.showSchools
    const schoolMarkers = this.data.markers.filter((item) => item.id < 100000)
    this.setData({
      showSchools,
      markers: showSchools ? this.data.markers : schoolMarkers,
      circles: showSchools ? (this.data.estateCircles || []).concat(this.data.schoolCircles || []) : (this.data.estateCircles || []),
    })
  },

  toggleZones() {
    this.setData({ showZones: !this.data.showZones })
  },

  toggleResults() {
    this.setData({ showResults: !this.data.showResults })
  },

  handleMarkerTap(event) {
    const marker = this.data.markers.find((item) => item.id === event.detail.markerId)
    if (marker) this.setData({ selected: { ...marker.item, priceText: priceText(marker.item.price) } })
  },

  handleSchoolTap(event) {
    const index = event.currentTarget.dataset.index
    const school = this.data.schoolCircles?.[index]?.school
    if (school) this.setData({ selected: { ...school, priceText: '' } })
  },

  clearSelected() {
    this.setData({ selected: null })
  },

  retry() {
    this.setData({ error: '' }, () => this.loadMap())
  },
})
