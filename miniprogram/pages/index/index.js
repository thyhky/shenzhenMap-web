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

function priceFillColor(price) {
  if (!price) return '#b7c0bd'
  if (price < 35000) return '#9ab5c0'
  if (price < 50000) return '#91c4bd'
  if (price < 70000) return '#b6d19f'
  if (price < 90000) return '#ecd28f'
  if (price < 120000) return '#eab08f'
  return '#df9297'
}

function polygonCoordinates(geometry) {
  if (!geometry || geometry.type !== 'Polygon') return []
  const ring = geometry.coordinates[0] || []
  return ring.map(([longitude, latitude]) => ({ longitude, latitude }))
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
    districtIndex: 0,
    streets: [],
    streetOptions: [{ name: '全部街道', value: '' }],
    streetIndex: 0,
    district: '',
    street: '',
    minWan: 0,
    maxWan: 32,
    pricedOnly: true,
    showSchools: true,
    showZones: true,
    showResults: true,
    latitude: 22.57,
    longitude: 114.05,
    scale: 10,
    markers: [],
    mapItems: [],
    circles: [],
    estateCircles: [],
    schoolCircles: [],
    polygons: [],
    visiblePolygons: [],
    results: [],
    total: 0,
    averagePrice: '-',
    selected: null,
  },

  mapContext: null,
  loadingMap: false,
  regionTimer: null,
  mapRequestId: 0,

  onLoad() {
    this.mapContext = wx.createMapContext('main-map', this)
    this.loadMeta()
    this.loadMap()
    this.loadSchools()
  },

  async loadMeta() {
    try {
      const meta = await request('/api/meta')
      const districts = meta.districts || []
      const streets = meta.streets || []
      this.setData({
        districts,
        districtOptions: ['全部区域'].concat(districts),
        districtIndex: 0,
        streets,
        streetOptions: [{ name: '全部街道', value: '' }].concat(streets),
        streetIndex: 0,
      })
    } catch (error) {
      this.showError(error)
    }
  },

  async loadMap(view = initialRegion, zoom = this.data.scale) {
    if (this.loadingMap) return
    this.loadingMap = true
    const requestId = ++this.mapRequestId
    this.setData({ loading: true })
    try {
      const map = await request('/api/estates', {
        ...view,
        zoom,
        minPrice: this.data.minWan * 10000,
        maxPrice: this.data.maxWan * 10000,
        pricedOnly: this.data.pricedOnly ? 1 : 0,
        page: 1,
        pageSize: 20,
        district: this.data.district,
        street: this.data.street,
      })
      const circles = (map.items || []).map((item) => ({
        latitude: item.lat,
        longitude: item.lng,
        radius: item.kind === 'cluster' ? Math.min(1100, 160 + Math.sqrt(item.count) * 32) : 70,
        color: priceColor(item.kind === 'cluster' ? item.avgPrice : item.price),
        fillColor: priceFillColor(item.kind === 'cluster' ? item.avgPrice : item.price),
        strokeWidth: 1,
      }))
      if (requestId !== this.mapRequestId) return
      this.setData({
        markers: [],
        mapItems: map.items || [],
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
      this.loadingMap = false
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
        color: feature.properties.level === 'junior' ? '#c93f77' : '#6d3fc9',
        fillColor: feature.properties.level === 'junior' ? '#f0c6d5' : '#d5c9f2',
        strokeWidth: 2,
        school: feature.properties,
      }))
      const polygons = (zones.features || []).map((feature) => ({
        points: polygonCoordinates(feature.geometry),
        strokeColor: feature.properties.level === 'junior' ? '#c93f77' : '#6d3fc9',
        fillColor: feature.properties.level === 'junior' ? '#f8e4eb' : '#eee9fa',
        strokeWidth: 2,
        zone: feature.properties,
      }))
      this.setData({
        schoolCircles,
        polygons,
        visiblePolygons: this.data.showZones ? polygons : [],
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
    this.setData({
      district,
      districtIndex: district ? this.data.districtOptions.indexOf(district) : 0,
      street: '',
      streets,
      streetOptions: [{ name: '全部街道', value: '' }].concat(streets),
      streetIndex: 0,
    }, () => this.loadMap())
  },

  selectStreet(event) {
    const option = this.data.streetOptions[event.detail.value]
    this.setData({ street: option?.value || '', streetIndex: event.detail.value }, () => this.loadMap())
  },

  toggleSchools() {
    const showSchools = !this.data.showSchools
    this.setData({
      showSchools,
      circles: showSchools ? (this.data.estateCircles || []).concat(this.data.schoolCircles || []) : (this.data.estateCircles || []),
    })
  },

  toggleZones() {
    const showZones = !this.data.showZones
    this.setData({ showZones, visiblePolygons: showZones ? this.data.polygons : [] })
  },

  toggleResults() {
    this.setData({ showResults: !this.data.showResults })
  },

  handleMarkerTap(event) {
    const marker = this.data.markers.find((item) => item.id === event.detail.markerId)
    if (!marker) return
    if (marker.item.kind === 'cluster') {
      this.setData({
        latitude: marker.item.lat,
        longitude: marker.item.lng,
        scale: Math.min(16, this.data.scale + 2),
        selected: {
          ...marker.item,
          name: `${marker.item.count} 个小区`,
          district: '',
          street: '',
          priceText: priceText(marker.item.avgPrice),
        },
      })
      return
    }
    this.setData({ selected: { ...marker.item, priceText: priceText(marker.item.price) } })
  },

  handleMapTap(event) {
    const { latitude, longitude } = event.detail
    const threshold = Math.max(0.002, 0.04 / Math.pow(2, this.data.scale - 10))
    const candidates = []
    if (this.data.showSchools) {
      this.data.schoolCircles.forEach((circle) => candidates.push({
        item: circle.school,
        lat: circle.latitude,
        lng: circle.longitude,
        kind: 'school',
      }))
    }
    this.data.mapItems.forEach((item) => candidates.push({ item, lat: item.lat, lng: item.lng, kind: 'estate' }))
    let nearest = null
    let nearestDistance = Number.POSITIVE_INFINITY
    candidates.forEach((candidate) => {
      const distance = Math.hypot(candidate.lat - latitude, candidate.lng - longitude)
      if (distance < nearestDistance) {
        nearest = candidate
        nearestDistance = distance
      }
    })
    if (!nearest || nearestDistance > threshold) return
    if (nearest.kind === 'school') {
      this.setData({ selected: { ...nearest.item, priceText: '' } })
      return
    }
    const item = nearest.item
    if (item.kind === 'cluster') {
      this.setData({
        latitude: item.lat,
        longitude: item.lng,
        scale: Math.min(16, this.data.scale + 2),
        selected: {
          ...item,
          name: `${item.count} 个小区`,
          district: '',
          street: '',
          priceText: priceText(item.avgPrice),
        },
      })
      return
    }
    this.setData({ selected: { ...item, priceText: priceText(item.price) } })
  },

  handleRegionChange(event) {
    const detail = event.detail || {}
    if (detail.type !== 'end' || detail.causedBy === 'update' || !this.mapContext || this.loadingMap) return
    if (this.regionTimer) clearTimeout(this.regionTimer)
    this.regionTimer = setTimeout(() => {
      const region = detail.region
      const scale = detail.scale
      if (region && scale) {
        this.reloadRegion(region, scale)
        return
      }
      this.mapContext.getRegion({ success: (currentRegion) => this.reloadRegion(currentRegion, this.data.scale) })
    }, 350)
  },

  reloadRegion(region, scale) {
    const zoom = Math.max(6, Math.min(18, Number(scale || this.data.scale)))
    this.setData({ latitude: region.centerLatitude, longitude: region.centerLongitude, scale: zoom })
    this.loadMap({
      west: region.southwest.longitude,
      south: region.southwest.latitude,
      east: region.northeast.longitude,
      north: region.northeast.latitude,
    }, zoom)
  },

  handleResultTap(event) {
    const item = this.data.results[event.currentTarget.dataset.index]
    if (!item) return
    const delta = 0.008
    this.setData({
      latitude: item.lat,
      longitude: item.lng,
      scale: 15,
      selected: item,
    })
    this.loadMap({
      west: item.lng - delta,
      south: item.lat - delta,
      east: item.lng + delta,
      north: item.lat + delta,
    }, 15)
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
