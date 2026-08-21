# 深圳住区观察 uni-app 客户端

这是 Web 与微信小程序的统一客户端。共享状态/API、移动端外壳和小区地图闭环已经建立，H5 已替换生产客户端，原客户端暂作回滚保留。

## 开发与构建

```bash
npm ci
npm run type-check
npm run dev:h5
npm run build:h5
npm run build:mp-weixin
```

微信开发者工具导入 `dist/build/mp-weixin/`。正式体验版先构建，再从项目根目录设置 `WECHAT_APP_ID` 并执行 `npm run uni:prepare:mp-weixin`；真实 AppID 只写入忽略提交的构建目录。公众平台需确认 `https://map.okzer.xyz` 的 request/downloadFile 合法域名。

## 当前边界

- H5 已接入 Leaflet 和 OpenStreetMap，支持真实视口请求、小区/聚合渲染及点选。
- 微信地图已接入 circles、聚合数量 marker、regionchange 视口刷新、最近点命中及 WGS84/GCJ-02 成对转换。
- 元数据、地图请求、请求防乱序和筛选草稿/应用状态已共用。
- 街道、学校和学区按需加载并缓存，两端使用各自原生地图覆盖物渲染。
- 结果分页、全市搜索、排行、小区详情、7/30/90 天历史、导出和数据说明已迁移。
- H5 在 901px 以上使用三栏工作区，移动 H5 和微信继续使用底栏与上拉抽屉。
- `1.2.0` H5 已通过预览验收并切换生产，微信已通过真机交互验收；当前 `1.2.1` 双端构建和微信 CLI 预览通过，待 H5 浏览器回归/部署及微信真机复测/发布。

迁移进度见 `../docs/UNIAPP_FEATURE_MATRIX.md`。

后续开发见 [双端实现方案](../docs/UNIAPP_IMPLEMENTATION_GUIDE.md)。
