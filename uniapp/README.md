# 深圳住区观察 uni-app 客户端

这是 Web 与微信小程序的渐进式统一客户端。双端工程、共享状态/API、移动端外壳和小区地图闭环已经建立，但尚未替换生产客户端。

## 开发与构建

```bash
npm install
npm run type-check
npm run dev:h5
npm run build:h5
npm run build:mp-weixin
```

微信开发者工具导入 `dist/build/mp-weixin/`。正式体验版之前需要在 `src/manifest.json` 中替换 `touristappid`，并确认 `https://map.okzer.xyz` 的 request/downloadFile 合法域名。

## 当前边界

- H5 已接入 Leaflet 和 OpenStreetMap，支持真实视口请求、小区/聚合渲染及点选。
- 微信地图已接入 circles、聚合数量 marker、regionchange 视口刷新、最近点命中及 WGS84/GCJ-02 成对转换。
- 元数据、地图请求、请求防乱序和筛选草稿/应用状态已共用。
- 结果和详情目前只包含第一阶段基础字段。
- 街道边界、学校、学区和完整详情仍待迁移。

迁移进度见 `../docs/UNIAPP_FEATURE_MATRIX.md`。
