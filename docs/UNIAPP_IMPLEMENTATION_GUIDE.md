# uni-app 双端实现方案

本文总结深圳住区观察从独立 Web 前端和原生微信小程序迁移到 uni-app 的最终方案。它用于指导后续功能开发，重点是稳定复用已经验证过的边界，而不是重新设计一套跨端框架。

## 1. 最终架构

`uniapp/` 是当前统一前端源码，同时产出 H5 和微信小程序。后端 Worker、D1 和数据流水线仍位于仓库根目录，由两个客户端共同使用。

```text
                         ┌─ MapH5.vue ───── Leaflet + OSM（WGS84）
uniapp/src/pages/index ──┤
       │                 └─ MapWeixin.vue ─ 原生 map（GCJ-02）
       │
       ├─ components/    共享展示与交互组件
       ├─ stores/        共享筛选状态
       ├─ services/      共享 API 客户端
       ├─ domain/        共享 TypeScript 契约
       └─ utils/         坐标、几何、图片绘制等纯逻辑
                         │
                         ▼
                  同域或 HTTPS /api/*
                         │
                         ▼
                  worker/ + Cloudflare D1
```

构建输出：

| 目标 | 源码 | 构建产物 | 运行方式 |
| --- | --- | --- | --- |
| Web H5 | `uniapp/src/` | `uniapp/dist/build/h5/` | Cloudflare Workers Static Assets |
| 微信小程序 | `uniapp/src/` | `uniapp/dist/build/mp-weixin/` | 微信开发者工具上传 |
| 后端 API | `worker/` | Wrangler 构建 | Cloudflare Worker |

根目录 `src/` 和 `miniprogram/` 分别是旧 Web、旧原生小程序，只用于一个发布周期内回滚。新需求不要再同步修改这两个目录。

## 2. 复用边界

### 应共享的部分

- 领域类型和 API 响应：`uniapp/src/domain/types.ts`
- 查询参数、错误处理和只读图层缓存：`uniapp/src/services/api.ts`
- 筛选草稿与已应用状态：`uniapp/src/stores/filters.ts`
- 页面业务编排：`uniapp/src/pages/index/index.vue`
- 筛选、结果、详情、底栏、抽屉和数据说明组件：`uniapp/src/components/`
- 坐标转换之外的纯计算、几何和绘图逻辑：`uniapp/src/utils/`

### 必须隔离的部分

- H5 地图使用 Leaflet，实现在 `MapH5.vue`。
- 微信地图使用原生 `<map>` 和 `MapContext`，实现在 `MapWeixin.vue`。
- 浏览器下载、DOM、Blob 和 Canvas 逻辑只能放在 `#ifdef H5` 中。
- 微信文件分享、相册授权和原生 Canvas 逻辑只能放在 `#ifdef MP-WEIXIN` 中。
- 平台专属类型不能泄漏到共享组件的 props 和 emits 契约中。

经验结论：跨端项目应统一业务，不应强行统一平台原生能力。地图、文件和权限是适配层；筛选、结果、详情和 API 才是共享层。

## 3. 页面与状态

`pages/index/index.vue` 负责业务编排和大部分页面运行态，并连接共享组件、地图适配器和 API。筛选 `draft`/`applied` 由模块级 `stores/filters.ts` 持有；展示组件只通过 props 接收状态，通过 emits 表达用户意图。

主要状态分为：

- 数据状态：`meta`、`snapshot`、`boundaries`、`schools`、`schoolZones`
- 地图状态：`viewport`、`mapCenter`、`mapZoom`、`focusBounds`
- 选择状态：`selected`、`estateDetail`、`priceHistory`
- UI 状态：`activeSheet`、桌面侧栏、图层开关、加载与错误状态
- 查询状态：筛选 `draft` 与 `applied`、结果/榜单分页和排序

### 筛选采用两阶段提交

用户编辑时只修改 `draft`，点击“应用筛选”后才复制到 `applied` 并请求数据。这样可以避免每次输入、选择或滑动都触发地图和榜单刷新。

新增筛选项时必须同时更新：

1. `domain/types.ts` 中的 `EstateFilters`。
2. `stores/filters.ts` 中的默认值。
3. `FilterSheet.vue` 的编辑控件和 `update` 事件。
4. `services/api.ts` 的参数映射。
5. Worker 参数校验、查询实现和契约测试。

### 异步请求必须防止旧响应覆盖新状态

地图、榜单、详情和历史分别维护递增的 request ID。请求完成时只有 ID 仍为最新值才允许写入状态。分页还要同时校验查询 key，并按 ID 去重合并。

不要只依赖 loading 标记。用户快速拖图、切换筛选或连续选择小区时，请求完成顺序并不可靠。

### 详情按需加载

地图或列表选中小区时只保存摘要并展示简略卡。用户主动打开详情后才请求完整详情和价格历史。这能减少地图浏览过程中的请求数量，也避免点击地图时自动打开大面板。

## 4. 地图适配契约

两个地图组件共享核心业务契约，但平台能力决定了图层数据传递方式不同：

- 共同输入：中心点、缩放级别、地图项、图层开关和聚焦边界。
- H5 直接通过 props 接收街道、学校、学区、当前选中项、`selectionRevision` 和是否显示选中弹窗。
- 微信通过共享 API 缓存读取图层，以 `layerRevision` 通知缓存快照已更新。
- 输出：`select`、`viewport-change`；H5 通过 `details` 请求打开详情，微信额外通过 `focus` 请求父页面改变受控中心点。

父页面只理解 `MapSelection`、`MapViewport` 和 WGS84 业务坐标，不理解 Leaflet 对象或微信事件结构。

### H5 地图

`MapH5.vue` 保持单一 Leaflet 实例：

- `onMounted` 创建地图、底图、pane 和各图层容器。
- props 变化时清空并重绘对应 LayerGroup/GeoJSON，不重建地图。
- H5 使用 Leaflet 选中弹窗展示摘要和“查看详情”；微信继续使用地图外简略卡。
- `moveend`、`zoomend` 经过短延迟后发送视口。
- `ResizeObserver` 在桌面侧栏开关或容器变化时调用 `invalidateSize`。
- `onBeforeUnmount` 清理定时器、Observer 和地图实例。

H5 使用 OSM/WGS84，不做微信坐标转换。弹窗文本通过 DOM 节点和 `textContent` 创建，避免把 API 文本直接拼入 HTML。

### 微信地图

`MapWeixin.vue` 需要额外处理原生地图限制：

- API、业务状态和几何统一使用 WGS84。
- 传入原生地图前执行 WGS84 → GCJ-02。
- 原生地图返回点击点和视口后执行 GCJ-02 → WGS84。
- 只渲染当前视口内的学校、街道和学区。
- circle 总数控制在 980 以内。
- polygon 总数控制在 400 以内，简化后总点数控制在约 6000 以内。
- 绘制和点击命中必须使用同一批简化 ring，避免“看得到但点不到”。
- 当前微信适配器只处理 Polygon/MultiPolygon 外环，不支持内环孔洞；接入含内环的新图层前必须同时扩展绘制和命中逻辑。

微信原生 map 的 circle 不提供可靠的业务点击事件，因此点击后按距离和 point-in-polygon 依次命中学校、小区/聚合、学区和街道。

### 点击和视口回写保护

微信地图必须保留三类保护：

- 单击延迟确认：在双击窗口内收到第二次点击时取消业务选中。
- marker/map 去重：marker 点击伴随的底图点击不能重复执行。
- 程序化视口保护：`includePoints` 后在 700ms 时间窗内只更新内部视口，不回写父级受控中心。

父页面的普通 `viewport-change` 只更新查询 bbox，不反向覆盖 `mapCenter` 和 `mapZoom`。只有明确的业务聚焦动作才修改受控中心，否则会形成“拖动 → 回写 → props 更新 → 地图回弹”的循环。当前程序化保护是时间窗抑制，不是原生事件提供的确定性标记，调整地图动画或兼容低端设备时必须重新真机验证窗口长度。

## 5. 响应式 UI

共享组件不复制业务状态，页面只按屏幕形态改变容器：

- 901px 以上：筛选侧栏 + 地图 + 结果/详情侧栏。
- 900px 以下：全屏地图 + 底部导航 + 上拉抽屉。
- 微信：沿用移动端底栏和抽屉，地图替换为原生组件。
- 小屏横屏且高度不超过 600px 时，60 秒无操作隐藏顶栏/底栏；触摸、指针、键盘或旋转会恢复导航。

桌面侧栏可独立关闭，地图容器必须保持 `min-width: 0`、`min-height: 0`，并通知 Leaflet 重算尺寸。移动端高度使用完整视口，底栏和弹层需要叠加 `safe-area-inset-bottom`。

H5 的 BottomSheet 和方法说明对话框必须保留 Tab 焦点循环、Escape 关闭及关闭后的焦点恢复。价格输入范围为 0–50 万/㎡，最小值不能大于最大值。桌面地图弹窗打开详情时，应自动重新打开右侧栏并切换到详情页。

微信 component WXSS 不应依赖标签后代选择器，例如 `.card text`。需要样式的节点应添加明确 class，并使用 `.card .label` 形式，避免微信组件样式隔离告警。

## 6. API 与网络

共享 API 客户端统一使用 `uni.request`：

- H5 的 `apiBase` 为空，生产环境通过同域 `/api/*` 请求 Worker。
- 微信的 `apiBase` 为 `https://map.okzer.xyz`。
- 街道、学校和学区是低频只读数据，在模块内缓存并按需加载。
- URL 导出接口通过统一参数构造器生成，避免页面自行拼接筛选参数。

本地 H5 开发由 `uniapp/vite.config.ts` 把 `/api` 代理到生产 API。需要调试后端变更时，应将代理指向本地 Worker，不要在业务代码中加入临时地址分支。

微信公众平台需要配置：

- request 合法域名：`https://map.okzer.xyz`
- downloadFile 合法域名：`https://map.okzer.xyz`
- 相册仅写入权限及对应隐私用途

## 7. 文件与图片导出

导出功能采用“纯计算共享，平台落盘分离”：

- CSV 查询参数和 URL 共享。
- H5 使用 fetch、Blob 和临时 `<a>` 下载。
- 微信使用 `uni.downloadFile` 和 `uni.shareFileMessage`。
- 热力图布局和绘制算法位于 `utils/heatmap.ts`。
- H5 使用浏览器 Canvas 并下载 PNG。
- 微信使用原生 2D Canvas、像素比缩放、临时文件和相册权限流程。

新增导出格式时，先提取不依赖平台的序列化或绘制函数，再分别实现 H5 和微信交付动作。不要让 DOM、wx 或 UniNamespace 类型进入共享算法。

## 8. 构建与发布

### 开发验证

```powershell
npm ci
npm --prefix uniapp ci
node --version # 必须为 24.x 或更高
npm test       # 当前应为 34/34
npm run typecheck
npm run uni:typecheck
npm run uni:build:h5
npm run uni:build:mp-weixin
```

所有发布都必须运行根测试和双端类型检查，不只是在修改 Worker/API 时运行。

### H5 发布

```powershell
npm run deploy:uni:preview
npm run deploy:uni:production
```

生产 Wrangler 配置将 `uniapp/dist/build/h5` 作为静态资源目录并启用 SPA fallback。`run_worker_first` 使所有请求先进入 Worker：Worker 处理 `/api/*`，其余请求转发给 Assets。生产部署脚本会先 dry-run；部署后自动执行远端验证，验证失败则回滚 Worker 版本。自动回滚不会再次验证，仍需人工运行 `npm run verify:remote`，确认旧 Worker/Assets 与当前 D1 可用。

### 微信发布

```powershell
npm run uni:build:mp-weixin
$env:WECHAT_APP_ID = '<正式 AppID>'
npm run uni:prepare:mp-weixin
```

微信开发者工具必须导入 `uniapp/dist/build/mp-weixin/`，不能导入旧 `miniprogram/`。真实 AppID 只注入被忽略的构建目录，不提交到源码。

正式 AppID 注入必须发生在最后一次 `uni:build:mp-weixin` 之后；再次构建会覆盖注入后的 `project.config.json`。当前发布版本应核对 `versionName=1.2.1`、`versionCode=121`。

`manifest.json` 必须保留以下上传质量配置：

```json
{
  "mp-weixin": {
    "lazyCodeLoading": "requiredComponents",
    "setting": {
      "urlCheck": true,
      "minified": true
    }
  }
}
```

每次构建后检查生成的 `project.config.json` 中 `minified` 为 `true`，`app.json` 中存在 `lazyCodeLoading: "requiredComponents"`。

## 9. 新功能实施模板

### 新增普通业务功能

1. 先在 `domain/types.ts` 定义跨端契约。
2. 在 `services/api.ts` 实现单一 API 入口。
3. 在页面层管理状态、请求 ID、加载和错误。
4. 用共享组件实现展示与用户意图。
5. 只把不可共享能力放入条件编译分支。
6. 同时执行 H5、微信构建和真机关键路径验证。

### 新增地图图层

1. 后端定义范围、缓存和数据量上限。
2. 增加共享 Feature/Collection 类型和 API 缓存。
3. 在页面添加开关、按需加载和 revision。
4. 在 `MapH5.vue` 增加独立 pane/layer 与清理逻辑。
5. 在 `MapWeixin.vue` 增加视口裁剪、简化、坐标转换和命中逻辑。
6. 检查数据是否含内环；当前微信适配器只支持外环，含内环时先补齐绘制和命中能力。
7. 验证低端真机的覆盖物数量、拖动帧率和点击准确性。

### 新增筛选或排序

1. 修改共享类型和默认值。
2. 修改 draft 控件与 applied 提交流程。
3. 修改 API 参数和 Worker 校验。
4. 将筛选纳入请求 key、缓存 key 和分页重置条件。
5. 增加 Worker 契约测试，并验证结果、榜单和导出是否需要同步口径。

## 10. 禁止事项

- 不在共享逻辑中直接使用 `window`、`document`、Leaflet 或 `wx`。
- 不为两端复制筛选、结果或详情状态。
- 不把地图 props 与用户拖动视口做无条件双向同步。
- 不在地图选中时自动请求所有详情。
- 不在响应式 computed 中发网络请求或修改其他状态。
- 不把真实 AppID、密钥或数据快照提交到公开仓库。
- 不直接修改 `dist/` 作为长期修复，配置必须回到 `src/manifest.json` 或源码。
- 不上传旧 `miniprogram/` 目录作为 uni-app 新版本。
- 不执行强制依赖升级来消除 DCloud 构建链审计告警，升级必须按官方编译器版本整体验证。

## 11. 验收清单

### 自动验证

- `npm test`
- `npm run typecheck`
- `npm run uni:typecheck`
- `npm run uni:build:h5`
- `npm run uni:build:mp-weixin`
- 生成 WXSS 无非法组件后代选择器
- 微信 CLI 预览成功且包体未超限
- Node.js 满足根 `package.json` 的 `>=24` 要求，当前自动测试应为 34 项

### H5 手工验证

- 桌面三栏和移动底栏均正常。
- 侧栏开关后地图无空白、错位或横向滚动。
- 拖动、缩放、聚合、点选和搜索聚焦正常。
- 验证 H5 选中弹窗、“查看详情”、右侧栏自动重开和详情切换。
- 验证小屏横屏 60 秒隐藏、交互恢复和旋转后的地图尺寸。
- 验证 Tab/Escape/焦点恢复、价格范围及最小值不大于最大值。
- 编辑筛选草稿时不请求；应用后地图/结果主查询一次，榜单处于活动状态时另刷新一次榜单。
- 结果分页、榜单、详情、历史和导出正常。
- 生产域名 API、SPA 刷新和缓存头正常。

### 微信手工验证

- WGS84/GCJ-02 底图点位无明显偏移。
- 拖动不回弹，程序化聚焦不重复请求。
- 单击、双击、marker 和底图点击不串扰。
- 低缩放显示聚合，覆盖物数量受限。
- 学校、学区和街道绘制与命中一致。
- CSV 文件分享和相册权限拒绝/重新授权流程正常。
- 验证价格输入、筛选、结果、详情和方法说明在 1.2.1 中正常。
- 上传检查中 JS 压缩和组件按需注入通过。

## 12. 回滚策略

- H5：`npm run rollback:worker` 回滚 Wrangler 选择的上一 Worker/Assets 版本，不回滚 D1 数据、迁移或绑定资源。执行前确认目标版本与当前 D1 schema 兼容，完成后运行 `npm run verify:remote`。
- 旧 Web：根目录 `src/` 和 `wrangler.jsonc` 暂时保留；`npm run deploy:legacy` 会重新构建并部署当前旧 Web 源码，不等同于恢复某个不可变历史版本。默认 `npm run deploy` 发布当前 uni-app H5。
- 微信：公众平台保留上一线上版本；`miniprogram/` 保留为 `1.1.0` 源码基线。
- 后端接口在迁移期间保持兼容，因此新旧客户端可以短期并行运行。

`pipeline:uni` 可能先更新 D1 再部署客户端，不能假设 Worker 回滚会恢复数据。分片中断后按 manifest profile 使用 `npm run pipeline -- --profile=PROFILE --start=N --skip-migrate --skip-deploy` 复用现有 manifest 和 parts；不要先重新同步、运行 `update:generate` 或生成新 parts。恢复模式会绕过快照时效/数量校验，必须人工确认，且 `--url` 只改变比较/验证地址，不会改变生产 D1 目标。一次性学校和小区价格工具分别使用 `schools`、`estate-prices` profile，禁止写入另一类业务表。

旧客户端只用于回滚，不再承接新需求。确认 H5 和微信新版本稳定运行一个发布周期后，再单独评估归档旧前端，不能连同 `worker/`、数据库迁移和运维脚本一起删除。
