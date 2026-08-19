const app = getApp()
const apiBase = app.globalData.apiBase
const initialRegion = { west: 113.75, south: 22.43, east: 114.35, north: 22.86 }

function buildQuery(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

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
  if (price < 35000) return '#2f5fb3'
  if (price < 50000) return '#10a09a'
  if (price < 70000) return '#79a82f'
  if (price < 90000) return '#e3b657'
  if (price < 120000) return '#df7b45'
  return '#bb3e45'
}

function priceFillColor(price) {
  if (!price) return '#b7c0bd'
  if (price < 35000) return '#9cb7e6'
  if (price < 50000) return '#8ed8d2'
  if (price < 70000) return '#bfd98f'
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

function heatmapColor(price) {
  if (!price) return '#7b8787'
  if (price < 35000) return '#2f5fb3'
  if (price < 50000) return '#10a09a'
  if (price < 70000) return '#79a82f'
  if (price < 90000) return '#e3b657'
  if (price < 120000) return '#df7b45'
  return '#bb3e45'
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
    minWan: 2,
    maxWan: 32,
    pricedOnly: true,
    missingRefPrice: false,
    appliedFilters: {
      district: '',
      street: '',
      keyword: '',
      minWan: 2,
      maxWan: 32,
      pricedOnly: true,
      missingRefPrice: false,
    },
    showSchools: false,
    showZones: false,
    activeSheet: '',
    showMoreTools: false,
    historyDays: 30,
    historyPeriods: [
      { label: '1周', days: 7 },
      { label: '1月', days: 30 },
      { label: '1季度', days: 90 },
    ],
    latitude: 22.6508,
    longitude: 114.0745,
    scale: 11,
    markers: [],
    mapItems: [],
    circles: [],
    estateCircles: [],
    schoolCircles: [],
    polygons: [],
    visiblePolygons: [],
    results: [],
    resultFilter: '',
    resultFiltered: [],
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
    exportingCsv: false,
    exportingHeatmap: false,
    showMethodology: false,
    catalog: null,
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
        catalog: meta.catalog || null,
      }, () => this.loadRanking(1))
    } catch (error) {
      this.showError(error)
    }
  },

  async loadMap(view = initialRegion, zoom = this.data.scale) {
    this.loadingMap = true
    const requestId = ++this.mapRequestId
    const applied = this.data.appliedFilters
    this.setData({ loading: true })
    try {
      const map = await request('/api/estates', {
        ...view,
        zoom,
        minPrice: applied.minWan * 10000,
        maxPrice: applied.maxWan * 10000,
        pricedOnly: applied.pricedOnly ? 1 : 0,
        missingRefPrice: applied.missingRefPrice ? 1 : 0,
        page: 1,
        pageSize: 20,
        district: applied.district,
        street: applied.street,
        q: applied.keyword,
      })
      const circles = (map.items || []).map((item) => ({
        latitude: item.lat,
        longitude: item.lng,
        radius: estateRadius(item, zoom),
        color: priceColor(item.kind === 'cluster' ? item.avgPrice : item.price),
        fillColor: priceFillColor(item.kind === 'cluster' ? item.avgPrice : item.price),
        strokeWidth: 1,
      }))
      const markers = (map.items || [])
        .filter((item) => item.kind === 'cluster')
        .map((item, index) => {
          const content = String(item.count)
          return {
            id: 1000000 + index,
            latitude: item.lat,
            longitude: item.lng,
            width: 1,
            height: 1,
            alpha: 0,
            label: {
              content,
              color: '#ffffff',
              fontSize: 10,
              anchorX: content.length >= 3 ? -9 : -6,
              anchorY: -5,
              textAlign: 'center',
            },
            item,
          }
        })
      if (requestId !== this.mapRequestId) return
      const results = (map.results || []).map((item) => ({ ...item, priceText: priceText(item.price) }))
      this.setData({
        markers,
        mapItems: map.items || [],
        estateCircles: circles,
        circles: this.composeCircles(circles, this.data.schoolCircles || []),
        results,
        resultFiltered: this.filterResults(results, this.data.resultFilter),
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
    const applied = this.data.appliedFilters
    try {
      const ranking = await request('/api/ranking', {
        sort: this.data.rankingSort,
        minSamples: 3,
        page,
        pageSize: 20,
        district: applied.district,
        street: applied.street,
        q: applied.keyword,
        minPrice: applied.minWan * 10000,
        maxPrice: applied.maxWan * 10000,
        pricedOnly: applied.pricedOnly ? 1 : 0,
        missingRefPrice: applied.missingRefPrice ? 1 : 0,
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
    const applied = this.data.appliedFilters
    this.setData({ rankingLoading: true })
    try {
      const ranking = await request('/api/ranking', {
        sort: this.data.rankingSort,
        minSamples: 3,
        page,
        pageSize: 20,
        district: applied.district,
        street: applied.street,
        q: applied.keyword,
        minPrice: applied.minWan * 10000,
        maxPrice: applied.maxWan * 10000,
        pricedOnly: applied.pricedOnly ? 1 : 0,
        missingRefPrice: applied.missingRefPrice ? 1 : 0,
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
    })
  },

  selectStreet(event) {
    const option = this.data.streetOptions[event.detail.value]
    this.setData({ street: option?.value || '', streetIndex: event.detail.value })
  },

  handleKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
  },

  applyFilters() {
    this.setData({
      activeSheet: '',
      appliedFilters: {
        district: this.data.district,
        street: this.data.street,
        keyword: this.data.keyword,
        minWan: this.data.minWan,
        maxWan: this.data.maxWan,
        pricedOnly: this.data.pricedOnly,
        missingRefPrice: this.data.missingRefPrice,
      },
    }, () => {
      this.loadMap()
      this.loadRanking(1)
    })
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
    this.setData({ pricedOnly: !this.data.pricedOnly })
  },

  toggleMissingRefPrice() {
    this.setData({ missingRefPrice: !this.data.missingRefPrice })
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
    this.setData({ activeSheet: this.data.activeSheet === 'results' ? '' : 'results' })
  },

  toggleFilters() {
    this.setData({ activeSheet: this.data.activeSheet === 'filters' ? '' : 'filters' })
  },

  toggleDetail() {
    this.setData({ activeSheet: this.data.activeSheet === 'detail' ? '' : 'detail' })
  },

  closeSheet() {
    this.setData({ activeSheet: '' })
  },

  toggleMoreTools() {
    this.setData({ showMoreTools: !this.data.showMoreTools })
  },

  toggleMethodology() {
    this.setData({ showMethodology: !this.data.showMethodology })
  },

  noop() {},

  exportHeatmap() {
    const applied = this.data.appliedFilters
    if (!applied.district) {
      wx.showToast({ title: '请先选择行政区，再导出热力图', icon: 'none' })
      return
    }
    if (this.data.exportingHeatmap) return
    this.setData({ exportingHeatmap: true })
    request('/api/heatmap', {
      district: applied.district,
      street: applied.street,
      pricedOnly: applied.pricedOnly ? 1 : 0,
      missingRefPrice: applied.missingRefPrice ? 1 : 0,
      minPrice: applied.minWan * 10000,
      maxPrice: applied.maxWan * 10000,
    }).then((data) => {
      if (!data.bounds) throw new Error('当前范围没有可导出的数据')
      this.renderHeatmap(data)
    }).catch((error) => {
      this.showError(error)
      this.setData({ exportingHeatmap: false })
    })
  },

  renderHeatmap(data) {
    wx.createSelectorQuery().in(this).select('#heatmap-canvas').fields({ node: true, size: true }).exec((result) => {
      if (!result?.[0]?.node) {
        this.setData({ exportingHeatmap: false })
        this.showError(new Error('画布初始化失败，请重试'))
        return
      }
      const canvas = result[0].node
      const width = result[0].width
      const height = result[0].height
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      const padding = 24
      const drawWidth = width - padding * 2
      const drawHeight = height - padding * 2
      const lngSpan = Math.max(data.bounds.east - data.bounds.west, 0.001)
      const latSpan = Math.max(data.bounds.north - data.bounds.south, 0.001)
      const scale = Math.min(drawWidth / lngSpan, drawHeight / latSpan)
      const project = (lng, lat) => [
        padding + (lng - data.bounds.west) * scale + (drawWidth - lngSpan * scale) / 2,
        height - padding - (lat - data.bounds.south) * scale - (drawHeight - latSpan * scale) / 2,
      ]
      context.fillStyle = '#e8e1d4'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#17343a'
      context.font = 'bold 22px sans-serif'
      context.fillText(`${data.label} 小区价格密度图`, padding, 34)
      context.font = '12px sans-serif'
      context.fillStyle = '#617074'
      context.fillText(`小区 ${data.total} · 有价 ${data.priced}`, padding, 54)
      context.strokeStyle = 'rgba(111, 82, 67, 0.52)'
      context.lineWidth = 1
      const drawRing = (points) => {
        if (!points || points.length < 3) return
        context.beginPath()
        points.forEach(([lng, lat], index) => {
          const [x, y] = project(lng, lat)
          if (index === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        })
        context.closePath()
        context.stroke()
      }
      const collectRings = (coordinates) => {
        if (!Array.isArray(coordinates) || !coordinates.length) return
        if (typeof coordinates[0]?.[0] === 'number') {
          drawRing(coordinates)
          return
        }
        coordinates.forEach(collectRings)
      }
      ;(data.boundaries || []).forEach((feature) => collectRings(feature.geometry?.coordinates))
      ;(data.points || []).forEach((point) => {
        const [x, y] = project(point.lng, point.lat)
        context.beginPath()
        context.fillStyle = heatmapColor(point.price)
        context.arc(x, y, point.price ? 3.5 : 2.5, 0, Math.PI * 2)
        context.fill()
      })
      context.fillStyle = 'rgba(250, 246, 237, 0.92)'
      context.fillRect(padding, height - 30, width - padding * 2, 22)
      context.fillStyle = '#617074'
      context.font = '10px sans-serif'
      context.fillText('颜色：小区挂牌均价；每个圆点代表一个小区；仅供研究参考', padding + 6, height - 14)
      wx.canvasToTempFilePath({
        canvas,
        success: (response) => {
          wx.saveImageToPhotosAlbum({
            filePath: response.tempFilePath,
            success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
            fail: () => wx.showToast({ title: '保存失败，请在设置中开启相册权限', icon: 'none' }),
            complete: () => this.setData({ exportingHeatmap: false }),
          })
        },
        fail: () => {
          this.showError(new Error('导出图片失败'))
          this.setData({ exportingHeatmap: false })
        },
      })
    })
  },

  handleMarkerTap(event) {
    const marker = this.data.markers.find((item) => item.id === event.detail.markerId)
    if (!marker) return
    if (marker.item.kind === 'cluster') {
      this.setData({
        latitude: marker.item.lat,
        longitude: marker.item.lng,
        scale: Math.min(16, this.data.scale + 2),
        activeSheet: '',
        selected: {
          ...marker.item,
          name: `${marker.item.count} 个小区`,
          district: '',
          street: '',
          priceText: priceText(marker.item.avgPrice),
          refPriceText: '',
          refGapText: '',
          historyRows: [],
          historyTrendText: '',
          historyTruncated: false,
        },
      })
      return
    }
    this.setData({ activeSheet: '', selected: { ...marker.item, priceText: priceText(marker.item.price), refPriceText: '', refGapText: '', historyRows: [], historyTrendText: '', historyTruncated: false } })
  },

  handleMapTap(event) {
    const { latitude, longitude } = event.detail
    if (this.data.showZones && this.data.visiblePolygons?.length) {
      const zone = this.data.visiblePolygons.find((item) => pointInPolygon({ latitude, longitude }, item.points))
      if (zone?.zone) {
        const linkedSchool = this.schoolById?.[zone.zone.schoolId]
        this.setData({
          activeSheet: '',
          selected: {
            ...schoolDetailText(linkedSchool || zone.zone),
            type: 'school-zone',
            priceText: '',
            nearbySchoolsText: '',
            zoneText: (zone.zone.zones || []).join('、'),
            refPriceText: '',
            refGapText: '',
            historyRows: [],
            historyTrendText: '',
            historyTruncated: false,
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
      this.setData({ activeSheet: '', selected: { ...schoolDetailText(nearest.item), type: 'school', priceText: '', refPriceText: '', refGapText: '', historyRows: [], historyTrendText: '', historyTruncated: false }, selectedLoading: false })
      return
    }
    const item = nearest.item
    if (item.kind === 'cluster') {
      this.setData({
        latitude: item.lat,
        longitude: item.lng,
        scale: Math.min(16, this.data.scale + 2),
        activeSheet: '',
        selected: {
          ...item,
          type: 'cluster',
          name: `${item.count} 个小区`,
          district: '',
          street: '',
          priceText: priceText(item.avgPrice),
          refPriceText: '',
          refGapText: '',
          historyRows: [],
          historyTrendText: '',
          historyTruncated: false,
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
    const centerLatitude = typeof region.centerLatitude === 'number'
      ? region.centerLatitude
      : (region.southwest.latitude + region.northeast.latitude) / 2
    const centerLongitude = typeof region.centerLongitude === 'number'
      ? region.centerLongitude
      : (region.southwest.longitude + region.northeast.longitude) / 2
    this.setData({ latitude: centerLatitude, longitude: centerLongitude, scale: zoom })
    this.loadMap({
      west: region.southwest.longitude,
      south: region.southwest.latitude,
      east: region.northeast.longitude,
      north: region.northeast.latitude,
    }, zoom)
  },

  filterResults(results, keyword) {
    const query = String(keyword || '').trim().toLowerCase()
    if (!query) return results
    return results.filter((item) => (
      item.name.toLowerCase().includes(query)
      || item.district.toLowerCase().includes(query)
      || item.street.toLowerCase().includes(query)
    ))
  },

  onResultFilterInput(event) {
    const value = event.detail.value || ''
    this.setData({
      resultFilter: value,
      resultFiltered: this.filterResults(this.data.results, value),
    })
  },

  handleResultTap(event) {
    const item = this.data.resultFiltered[event.currentTarget.dataset.index]
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

  exportRankingCsv() {
    if (this.data.exportingCsv) return
    const applied = this.data.appliedFilters
    const query = buildQuery({
      q: applied.keyword,
      district: applied.district,
      street: applied.street,
      minPrice: applied.minWan * 10000,
      maxPrice: applied.maxWan * 10000,
      pricedOnly: applied.pricedOnly ? 1 : 0,
      missingRefPrice: applied.missingRefPrice ? 1 : 0,
      minSamples: 3,
      limit: 5000,
    })
    const url = `${apiBase}/api/export/rent-yield.csv?${query}`
    this.setData({ exportingCsv: true })
    wx.showLoading({ title: '正在导出' })
    wx.downloadFile({
      url,
      success: (response) => {
        if (response.statusCode !== 200) {
          const message = response.statusCode === 404 ? '导出接口暂不可用，请先更新线上版本' : `导出失败 (${response.statusCode})`
          this.showError(new Error(message))
          return
        }
        wx.openDocument({
          filePath: response.tempFilePath,
          fileType: 'csv',
          showMenu: true,
          fail: () => {
            wx.showToast({ title: '已下载文件，请在文件管理中打开', icon: 'none' })
          },
        })
      },
      fail: () => {
        this.showError(new Error('导出失败，请检查网络与合法域名配置'))
      },
      complete: () => {
        wx.hideLoading()
        this.setData({ exportingCsv: false })
      },
    })
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
    this.setData({ selectedLoading: true, activeSheet: '' })
    try {
      const [detail, history] = await Promise.all([
        request(`/api/estates/${id}`),
        request(`/api/estates/${id}/price-history?days=${this.data.historyDays}&limit=100`),
      ])
      const bestSchool = detail.bestSchool
      const degreeTimeText = bestSchool
        ? `${bestSchool.name}：建议提前持有${bestSchool.holdYearsAdvised || 0}年（学位锁定${bestSchool.lockYears || (bestSchool.level === 'primary' ? 6 : 3)}年）`
        : ''
      const historyRows = (history.history || []).map((row, index) => ({
        key: `${row.capturedAt || ''}-${index}`,
        dateText: (row.capturedAt || '').slice(0, 10),
        priceText: `${(row.price / 10000).toFixed(2)}万`,
      }))
      let historyTrendText = ''
      if (historyRows.length >= 2) {
        const first = history.history[0].price
        const last = history.history[history.history.length - 1].price
        const change = last - first
        const percent = first ? ((last - first) / first) * 100 : null
        historyTrendText = `${change >= 0 ? '+' : ''}${Math.round(change)} 元/㎡${percent !== null ? `（${percent.toFixed(1)}%）` : ''}`
      }
      const refGap = detail.refPrice && detail.price
        ? { diff: detail.price - detail.refPrice, percent: ((detail.price - detail.refPrice) / detail.refPrice) * 100 }
        : null
      this.setData({
        selected: {
          ...detail,
          type: 'estate',
          priceText: priceText(detail.price),
          rentText: rentText(detail.rentPrice),
          rentYieldText: rentYieldText(detail.rentYield),
          refPriceText: detail.refPrice ? `${(detail.refPrice / 10000).toFixed(2)} 万元/㎡` : '',
          refGapText: refGap ? `挂牌${refGap.diff > 0 ? '高于' : '低于'}参考价 ${Math.abs(refGap.percent).toFixed(1)}%` : '',
          degreeTimeText,
          degreePolicyNote: bestSchool?.degreePolicyNote || '',
          nearbySchoolsText: (detail.nearbySchools || []).map((school) => `${school.name} · ${school.distanceMeters}m`).join('；'),
          historyRows,
          historyTrendText,
          historyTruncated: Boolean(history.truncated),
        },
        selectedLoading: false,
      })
    } catch (error) {
      this.showError(error)
      this.setData({ selectedLoading: false })
    }
  },

  async handleHistoryPeriod(event) {
    const days = Number(event.currentTarget.dataset.days)
    if (!days || days === this.data.historyDays) return
    const id = this.data.selected?.id
    if (typeof id !== 'number') return
    this.setData({ historyDays: days })
    await this.selectEstate(id)
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
    if (school) this.setData({ activeSheet: '', selected: { ...schoolDetailText(school), type: 'school', priceText: '', refGapText: '', refPriceText: '', historyRows: [], historyTrendText: '', historyTruncated: false } })
  },

  clearSelected() {
    this.setData({ selected: null, activeSheet: '' })
  },

  retry() {
    this.setData({ error: '' }, () => this.loadMap())
  },
})
