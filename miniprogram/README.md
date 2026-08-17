# 微信小程序 WebView 容器

这个目录是微信原生小程序版本，直接调用 `map.okzer.xyz/api/*`，不使用 `web-view`。地图、筛选器、学校图层、学区和小区结果在小程序页面中渲染。

这是第一版原生实现，功能优先于性能；真机测试时如果复杂学区多边形造成卡顿，下一步可以改成按行政区或当前地图范围加载学区。

## 开发工具

1. 安装微信开发者工具。
2. 导入本目录 `miniprogram/`。
3. 使用你自己的小程序 AppID 替换 `project.config.json` 中的 `touristappid`。
4. 编译并在模拟器或真机中预览。

## 微信公众平台配置

在小程序后台的“开发管理 → 开发设置 → 服务器域名”中配置：

- request 合法域名：`https://map.okzer.xyz`

当前没有使用 `web-view`、WebSocket 或 `wx.uploadFile`，因此暂时不需要配置业务域名、socket 合法域名或 uploadFile 合法域名。

当前原生页已支持“导出租售比+最佳学校 CSV”（`wx.downloadFile` + `wx.openDocument`）和“导出当前区域热力图”（画布渲染 + `wx.saveImageToPhotosAlbum`），发布前需在小程序后台额外配置：

- downloadFile 合法域名：`https://map.okzer.xyz`
- 相册保存权限：用户首次导出热力图时弹出授权；若用户拒绝，需要在“设置 → 隐私与权限”中开启相册权限
- 隐私保护指引：使用 `wx.saveImageToPhotosAlbum` 需在小程序后台声明“相册（仅写入）权限”用途（属于隐私接口）

## 运行边界

- 小程序直接使用 `wx.request` 调用线上 Worker API，因此需要网络连接和 request 合法域名配置。
- 当前原生版本实现了小区、聚合点、学校、学区、行政区/街道筛选、结果列表、租售比/价格榜单、小区价格历史与趋势、官方参考价对比、CSV 导出、热力图导出和数据来源说明。
- 真机测试时重点检查地图性能、网络错误、权限提示和不同屏幕尺寸。
