# uni-app 客户端迁移计划

## 目标

将现有 Vue Web（`src/`）和微信原生小程序（`miniprogram/`）逐步迁移到 `uniapp/`，最终由一套 Vue 3 + TypeScript 业务代码生成 H5 和微信小程序。

迁移期间继续保留并维护现有客户端。Worker、D1、迁移脚本、数据流水线和线上 API 不改架构。

## 稳定基线

- Git：`4cc1a66`（网页与小程序点击后只显示地图简略信息，详情由用户主动打开）
- 微信小程序已提交版本：`1.2.0`
- 生产地址：`https://map.okzer.xyz`
- API 健康检查：`GET /api/health`
- Worker 契约测试：21 项

## 技术决策

- 使用官方 `dcloudio/uni-preset-vue#vite-ts` 模板对应的 Vue 3/Vite 编译器版本。
- `uniapp/` 使用独立 `package.json` 和 lockfile，不与现有 Web 的 Vite 8 依赖混装。
- H5 地图最终使用 Leaflet + OpenStreetMap；微信端使用原生 `<map>`。
- 页面、筛选草稿、API、结果、详情和格式化逻辑共用；地图渲染由平台适配组件隔离。
- 不使用 `web-view`，不改变现有微信 request/downloadFile 合法域名配置。

## 目录演进

```text
shenzhenMap-web/
├─ src/                 # 现有 Web，迁移期间保留
├─ miniprogram/         # 现有小程序，迁移期间保留
├─ uniapp/              # 新跨端客户端
├─ worker/              # 共用 API
├─ migrations/          # 共用 D1 结构
└─ scripts/             # 共用数据与部署脚本
```

功能对等、体验版验证和线上回归全部通过后，旧客户端才进入归档阶段。

## 阶段

1. 建立双端可构建工程、共享类型/API/筛选状态和移动端外壳。
2. 迁移微信原生地图适配器，复用现有 circles、markers、polygons、regionchange 方案。
3. 迁移 H5 Leaflet 适配器，恢复聚合、街道边界、学校、学区和 popup。
4. 迁移结果、排行、详情、价格历史、数据说明和导出功能。
5. 在共享移动组件上增加桌面三栏断点，不复制业务状态。
6. 部署预览 H5，上传微信体验版，按功能矩阵逐项验收。
7. 切换生产入口，并保留旧客户端至少一个发布周期用于回滚。

## 构建命令

```bash
cd uniapp
npm install
npm run build:h5
npm run build:mp-weixin
```

H5 输出到 `uniapp/dist/build/h5/`；微信小程序输出到 `uniapp/dist/build/mp-weixin/`。

## 第一阶段验证记录

- 官方模板编译器：`5.24 (Vue 3)` / `3.0.0-5020420260813003`
- `npm run type-check`：通过
- `npm run build:h5`：通过
- `npm run build:mp-weixin`：通过
- 原客户端 Worker 测试：21/21 通过
- 原 Web 类型检查和生产构建：通过

`npm audit --omit=dev` 当前报告 31 个 DCloud 编译器依赖链告警。自动 `audit fix --force` 会将 `uni-cli-shared`、`uni-mp-weixin` 等核心包替换为不兼容旧版本，因此不执行强制修复；后续升级官方 uni-app 编译器时重新审计。该 CLI 仅用于构建，不作为线上 Node 服务运行。

## 地图迁移进度

阶段 2 和阶段 3 的小区地图闭环已完成代码迁移：

- H5 已接入 Leaflet、OpenStreetMap、真实 bbox/zoom、六档价格点、服务端聚合和点选。
- 微信已接入原生 map 的 circles、聚合数量 marker、regionchange、MapContext 视口读取、最近点命中及 WGS84/GCJ-02 成对转换。
- 两端共用当前视口筛选、请求防乱序、结果定位、聚合放大和地图外简略卡。
- 街道、学校和学区由页面按需加载并缓存；H5 使用 GeoJSON/marker，微信使用 polygons/circles。
- 微信只下发当前视口覆盖物：circle 总数不超过 980，polygon 不超过 400、简化后总点数不超过 6000；绘制和命中共用同一简化 ring。
- H5、`mp-weixin` 构建和类型检查通过；微信真机交互尚未验收。

阶段 3 的地图图层代码迁移已完成，仍需在 H5 浏览器、微信开发者工具和真机逐项验收。

## 约束

- 不在 uni-app 迁移中修改价格、学校、学区的数据口径。
- 筛选仍采用“编辑草稿，点击应用后请求”的交互。
- 点击小区只显示地图简略信息，详情由用户主动打开。
- 微信原生地图覆盖物数量必须受限，低缩放级别必须使用聚合。
- 微信端覆盖物使用 WGS84 → GCJ-02，视口 bbox 使用 GCJ-02 → WGS84；正式验收仍须检查底图偏移和边缘查询。
- 任何生产切换都必须先通过现有 Worker 测试和双端手工验收。
