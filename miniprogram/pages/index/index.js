const app = getApp()

Page({
  data: {
    mapUrl: '',
    loading: true,
    failed: false,
  },

  onLoad() {
    this.setData({ mapUrl: app.globalData.mapUrl })
  },

  onShow() {
    this.setData({ failed: false })
  },

  handleLoad() {
    this.setData({ loading: false, failed: false })
  },

  handleError() {
    this.setData({ loading: false, failed: true })
  },

  retry() {
    this.setData({ loading: true, failed: false })
  },
})
