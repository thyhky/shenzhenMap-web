# 深圳住区观察 uni-app 客户端

这是 Web 与微信小程序的渐进式统一客户端。当前处于第一阶段：双端工程、共享状态/API、移动端外壳和地图适配接口已经建立，但尚未替换生产客户端。

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

- H5 地图组件目前是 Leaflet 迁移占位适配器。
- 微信地图组件已使用原生 `<map>`，能渲染聚合圆和数量标签。
- 元数据、地图请求和筛选草稿/应用状态已共用。
- 结果和详情目前只包含第一阶段基础字段。

迁移进度见 `../docs/UNIAPP_FEATURE_MATRIX.md`。
