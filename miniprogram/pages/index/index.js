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

function estateRadius(item, zoom) {
  if (item.kind === 'cluster') return Math.min(1100, 160 + Math.sqrt(item.count) * 32)
  return Math.max(12, Math.min(70, 70 / Math.pow(2, Math.max(0, zoom - 12) / 2)))
}

function polygonCoordinateSets(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0] || []
    return [ring.map(([longitude, latitude]) => ({ longitude, latitude }))]
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || [])
      .map((polygon) => (polygon[0] || []).map(([longitude, latitude]) => ({ longitude, latitude })))
      .filter((points) => points.length >= 3)
  }
  return []
}

function pointInPolygon(point, polygonPoints) {
  let inside = false
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = polygonPoints[i].longitude
    const yi = polygonPoints[i].latitude
    const xj = polygonPoints[j].longitude
    const yj = polygonPoints[j].latitude
    const intersect = ((yi > point.latitude) !== (yj > point.latitude))
      && (point.longitude < ((xj - xi) * (point.latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function markerTitle(item) {
  if (item.kind === 'cluster') return `${item.count} 个小区`
  return item.name
}

function priceText(price) {
  return price ? `${(price / 10000).toFixed(1)}万` : '暂无'
}

function schoolDetailText(school) {
  return {
    ...school,
    phoneText: (school.phones || []).join('、'),
    zoneText: (school.zones || []).join('、'),
  }
}

function rentText(value) {
  return value ? `${value.toFixed(2)} 元/㎡/月` : '暂无租金样本'
}

function rentYieldText(value) {
  return value || value === 0 ? `${value.toFixed(2)}%` : '暂无租售比'
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
    keyword: '',
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
    selectedLoading: false,
    rankingSort: 'rentYield',
    rankingItems: [],
    rankingTotal: 0,
    rankingHasMore: false,
    rankingPage: 1,
    rankingLoading: false,
  },

  mapContext: null,
  loadingMap: false,
  regionTimer: null,
  mapRequestId: 0,
  schoolById: {},

  composeCircles(estateCircles = [], schoolCircles = [], showSchools) {
    const enabled = typeof showSchools === 'boolean' ? showSchools : this.data.showSchools
    if (!enabled) return estateCircles
    const maxCircleCount = 980
    const schoolCount = schoolCircles.length
    const estateLimit = Math.max(0, maxCircleCount - schoolCount)
    return estateCircles.slice(0, estateLimit).concat(schoolCircles)
  },

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
      }, () => this.loadRanking(1))
    } catch (error) {
      this.showError(error)
    }
  },

  async loadMap(view = initialRegion, zoom = this.data.scale) {
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
        q: this.data.keyword,
      })
      const circles = (map.items || []).map((item) => ({
        latitude: item.lat,
        longitude: item.lng,
        radius: estateRadius(item, zoom),
        color: priceColor(item.kind === 'cluster' ? item.avgPrice : item.price),
        fillColor: priceFillColor(item.kind === 'cluster' ? item.avgPrice : item.price),
        strokeWidth: 1,
      }))
      if (requestId !== this.mapRequestId) return
      this.setData({
        markers: [],
        mapItems: map.items || [],
        estateCircles: circles,
        circles: this.composeCircles(circles, this.data.schoolCircles || []),
        results: (map.results || []).map((item) => ({ ...item, priceText: priceText(item.price) })),
        total: map.stats?.total || 0,
        averagePrice: map.stats?.averagePrice ? `${(map.stats.averagePrice / 10000).toFixed(1)}万` : '-',
        loading: false,
      })
    } catch (error) {
      if (requestId === this.mapRequestId) this.showError(error)
    } finally {
      if (requestId === this.mapRequestId) {
        this.loadingMap = false
        this.setData({ loading: false })
      }
    }
  },

  async loadRanking(page = 1) {
    this.setData({ rankingLoading: true })
    try {
      const ranking = await request('/api/ranking', {
        sort: this.data.rankingSort,
        minSamples: 3,
        page,
        pageSize: 20,
        district: this.data.district,
        street: this.data.street,
        q: this.data.keyword,
        minPrice: this.data.minWan * 10000,
        maxPrice: this.data.maxWan * 10000,
        pricedOnly: this.data.pricedOnly ? 1 : 0,
      })
      const rows = (ranking.items || []).map((item) => ({
        ...item,
        rankLabel: `#${item.rank}`,
        rankingValue: this.data.rankingSort === 'price'
          ? priceText(item.price)
          : rentYieldText(item.rentYield),
      }))
      this.setData({
        rankingItems: rows,
        rankingTotal: ranking.stats?.total || 0,
        rankingHasMore: Boolean(ranking.pagination?.hasMore),
        rankingPage: ranking.pagination?.page || 1,
        rankingLoading: false,
      })
    } catch (error) {
      this.setData({ rankingLoading: false })
      this.showError(error)
    }
  },

  async loadMoreRanking() {
    if (!this.data.rankingHasMore || this.data.rankingLoading) return
    const page = this.data.rankingPage + 1
    this.setData({ rankingLoading: true })
    try {
      const ranking = await request('/api/ranking', {
        sort: this.data.rankingSort,
        minSamples: 3,
        page,
        pageSize: 20,
        district: this.data.district,
        street: this.data.street,
        q: this.data.keyword,
        minPrice: this.data.minWan * 10000,
        maxPrice: this.data.maxWan * 10000,
        pricedOnly: this.data.pricedOnly ? 1 : 0,
      })
      const seen = new Set(this.data.rankingItems.map((item) => item.id))
      const rows = (ranking.items || [])
        .filter((item) => !seen.has(item.id))
        .map((item) => ({
          ...item,
          rankLabel: `#${item.rank}`,
          rankingValue: this.data.rankingSort === 'price'
            ? priceText(item.price)
            : rentYieldText(item.rentYield),
        }))
      this.setData({
        rankingItems: this.data.rankingItems.concat(rows),
        rankingHasMore: Boolean(ranking.pagination?.hasMore),
        rankingPage: ranking.pagination?.page || page,
        rankingLoading: false,
      })
    } catch (error) {
      this.setData({ rankingLoading: false })
      this.showError(error)
    }
  },

  async loadSchools() {
    try {
      const [schools, zones] = await Promise.all([
        request('/api/schools'),
        request('/api/layers/school-zones'),
      ])
      const schoolById = {}
      const schoolFeatures = schools.features || []
      schoolFeatures.forEach((feature) => {
        schoolById[feature.properties.id] = feature.properties
      })
      const schoolCircles = schoolFeatures.map((feature) => ({
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        radius: 170,
        color: feature.properties.level === 'junior' ? '#c93f77' : '#6d3fc9',
        fillColor: feature.properties.level === 'junior' ? '#f0c6d5' : '#d5c9f2',
        strokeWidth: 2,
        school: feature.properties,
      }))
      const polygons = (zones.features || []).flatMap((feature) => {
        return polygonCoordinateSets(feature.geometry).map((points) => ({
          points,
          strokeColor: feature.properties.level === 'junior' ? '#c93f77' : '#6d3fc9',
          fillColor: feature.properties.level === 'junior' ? '#f8e4eb' : '#eee9fa',
          strokeWidth: 2,
          zone: feature.properties,
        }))
      })
      this.setData({
        schoolCircles,
        polygons,
        visiblePolygons: this.data.showZones ? polygons : [],
        circles: this.composeCircles(this.data.estateCircles || [], schoolCircles),
      })
      this.schoolById = schoolById
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
    }, () => {
      this.loadMap()
      this.loadRanking(1)
    })
  },

  selectStreet(event) {
    const option = this.data.streetOptions[event.detail.value]
    this.setData({ street: option?.value || '', streetIndex: event.detail.value }, () => {
      this.loadMap()
      this.loadRanking(1)
    })
  },

  handleKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
  },

  applyFilters() {
    this.loadMap()
    this.loadRanking(1)
  },

  switchRankingSort(event) {
    const sort = event.currentTarget.dataset.sort
    if (!sort || sort === this.data.rankingSort) return
    this.setData({ rankingSort: sort }, () => this.loadRanking(1))
  },

  handlePriceInput(event) {
    const field = event.currentTarget.dataset.field
    const value = Number(event.detail.value)
    if (field === 'min') this.setData({ minWan: Math.min(value, this.data.maxWan) })
    if (field === 'max') this.setData({ maxWan: Math.max(value, this.data.minWan) })
  },

  togglePricedOnly() {
    this.setData({ pricedOnly: !this.data.pricedOnly }, () => this.loadRanking(1))
  },

  toggleSchools() {
    const showSchools = !this.data.showSchools
    this.setData({
      showSchools,
      circles: this.composeCircles(this.data.estateCircles || [], this.data.schoolCircles || [], showSchools),
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
    if (this.data.showZones && this.data.visiblePolygons?.length) {
      const zone = this.data.visiblePolygons.find((item) => pointInPolygon({ latitude, longitude }, item.points))
      if (zone?.zone) {
        const linkedSchool = this.schoolById?.[zone.zone.schoolId]
        this.setData({
          selected: {
            ...schoolDetailText(linkedSchool || zone.zone),
            type: 'school-zone',
            priceText: '',
            nearbySchoolsText: '',
            zoneText: (zone.zone.zones || []).join('、'),
          },
          selectedLoading: false,
        })
        return
      }
    }
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
      this.setData({ selected: { ...schoolDetailText(nearest.item), type: 'school', priceText: '' }, selectedLoading: false })
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
          type: 'cluster',
          name: `${item.count} 个小区`,
          district: '',
          street: '',
          priceText: priceText(item.avgPrice),
        },
      })
      return
    }
    this.selectEstate(item.id)
  },

  handleRegionChange(event) {
    const rawDetail = event.detail || {}
    const eventType = rawDetail.type || rawDetail.detail?.type || event.type
    const causedBy = rawDetail.causedBy || rawDetail.detail?.causedBy || event.causedBy
    const detail = rawDetail.detail || rawDetail
    if (eventType !== 'end' || causedBy === 'update' || !this.mapContext) return
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
    })
    this.selectEstate(item.id)
    this.loadMap({
      west: item.lng - delta,
      south: item.lat - delta,
      east: item.lng + delta,
      north: item.lat + delta,
    }, 15)
  },

  handleRankingTap(event) {
    const item = this.data.rankingItems[event.currentTarget.dataset.index]
    if (!item) return
    const delta = 0.008
    this.setData({ latitude: item.lat, longitude: item.lng, scale: 15 })
    this.selectEstate(item.id)
    this.loadMap({
      west: item.lng - delta,
      south: item.lat - delta,
      east: item.lng + delta,
      north: item.lat + delta,
    }, 15)
  },

  async selectEstate(id) {
    this.setData({ selectedLoading: true })
    try {
      const detail = await request(`/api/estates/${id}`)
      const bestSchool = detail.bestSchool
      const degreeTimeText = bestSchool
        ? `${bestSchool.name}：建议提前持有${bestSchool.holdYearsAdvised || 0}年（学位锁定${bestSchool.lockYears || (bestSchool.level === 'primary' ? 6 : 3)}年）`
        : ''
      this.setData({
        selected: {
          ...detail,
          type: 'estate',
          priceText: priceText(detail.price),
          rentText: rentText(detail.rentPrice),
          rentYieldText: rentYieldText(detail.rentYield),
          degreeTimeText,
          degreePolicyNote: bestSchool?.degreePolicyNote || '',
          nearbySchoolsText: (detail.nearbySchools || []).map((school) => `${school.name} · ${school.distanceMeters}m`).join('；'),
        },
        selectedLoading: false,
      })
    } catch (error) {
      this.showError(error)
      this.setData({ selectedLoading: false })
    }
  },

  expandCluster() {
    const selected = this.data.selected
    if (!selected || selected.type !== 'cluster') return
    const zoom = Math.min(16, this.data.scale + 2)
    const delta = zoom >= 15 ? 0.008 : zoom >= 13 ? 0.02 : 0.05
    this.setData({ latitude: selected.lat, longitude: selected.lng, scale: zoom })
    this.loadMap({
      west: selected.lng - delta,
      south: selected.lat - delta,
      east: selected.lng + delta,
      north: selected.lat + delta,
    }, zoom)
  },

  handleSchoolTap(event) {
    const index = event.currentTarget.dataset.index
    const school = this.data.schoolCircles?.[index]?.school
    if (school) this.setData({ selected: { ...schoolDetailText(school), type: 'school', priceText: '' } })
  },

  clearSelected() {
    this.setData({ selected: null })
  },

  retry() {
    this.setData({ error: '' }, () => this.loadMap())
  },
})
