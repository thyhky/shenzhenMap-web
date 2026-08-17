# 深圳住区观察 —— 开发记录与复查报告

> 最后更新：2026-08-17
> 适用仓库：`C:\code\Codex\shenzhenMap-web`（分支 `master`，与 `origin/master` 同步）
> 线上环境：`https://map.okzer.xyz`（Cloudflare Worker `shenzhen-estate-map`）

## 1. 背景与目标

用户要求：
1. 分析仓库已完成的功能阶段，确认 `map.okzer.xyz` 是否运行最新代码，确认小程序与网页端一致性。
2. 补齐线上缺失的部署（`dd15676` CSV 导出）。
3. 让小程序尽量与网页端对齐（小程序不能直接发网页版，必须原生适配）。
4. 按优先级完成剩余功能清单中的项目。

## 2. 初始分析结论（2026-08-16）

### 2.1 功能阶段划分（按 git 历史，15 个提交）

| 阶段 | 提交 | 内容 |
|---|---|---|
| 1 基础发布 | `a25e8e0` | Vue3+Vite 前端、Worker API、D1、迁移 0001-0010 |
| 2 工程化 | `011c6a3` | 数据车间路径支持 |
| 3 小程序 | `d9dd6ba`~`95888b1` | WebView 版、原生地图页、交互修复、缩放圆圈 |
| 4 增强 | `5a60982`~`dd15676` | 租售比/学位政策（0011/0012）、学区修复、CSV 导出 |

### 2.2 部署一致性结论（分析时点）

- 线上**缺失最新提交** `dd15676`：`/api/export/rent-yield.csv` 返回 404；线上首页资源为 `index-4mpSUR7c.js`，本地最新构建为 `index-DGISPSnQ.js`（含 CSV 导出逻辑）。
- 线上数据是新的：4,303 个在售小区、210 所学校、78 条街道边界、6 个 catalog scope。
- 小程序与网页**数据同源**（小程序直连 `map.okzer.xyz/api/*`），但**端能力不对齐**：网页有热力图导出、CSV 导出、价格历史趋势、方法论面板、参考价对比，小程序均缺。

### 2.3 测试基线问题

`npm test` 13 项中 11 项失败：测试 schema 只建到 migration 0010，而 worker/data-sql 已引用 0011（`rent_price`）和 0012（`lock_years`）的列。

## 3. 已完成修改（第一批，2026-08-16）

### 3.1 线上部署对齐

- 部署最新 Worker + 前端到 `map.okzer.xyz`（版本 `a5e3cf35` → 后续 `975d52fc`）。
- 线上 `/api/export/rent-yield.csv` 从 404 变为 200。
- 验证：`npm run verify:remote -- https://map.okzer.xyz` 全绿。

### 3.2 小程序 CSV 导出对齐

- 新增 `exportRankingCsv()`（`wx.downloadFile` + `wx.openDocument`），参数与网页 `getRankingExportUrl` 对齐（minSamples=3, limit=5000）。
- 新增 `buildQuery()` 统一拼接查询串（过滤空值、encodeURIComponent）。
- 文档更新：`miniprogram/README.md` 与 `README.md` 补充 downloadFile 合法域名要求。

### 3.3 测试基线修复（清单项 15）

- `tests/data-import.test.mjs`、`tests/worker.test.mjs` 的 schema 加载列表补上 `0011_estate_rent.sql`、`0012_school_degree_policy.sql`。
- 结果：13/13 通过。

### 3.4 小程序功能对齐（清单项 11~14）

| 项 | 功能 | 实现要点 |
|---|---|---|
| 11 | 价格历史与趋势 | `selectEstate` 并行请求 `/api/estates/:id/price-history`，详情卡显示涨跌文本 + 历史记录列表 |
| 12 | 数据来源/方法论面板 | `loadMeta` 存 `catalog`，新增 `toggleMethodology` 弹窗（disclaimer + scope 列表 + 内容版本） |
| 13 | 热力图 PNG 导出 | `exportHeatmap`/`renderHeatmap`：type=2d canvas 绘制边界+点位+图例 → `wx.canvasToTempFilePath` → `wx.saveImageToPhotosAlbum` |
| 14 | 官方参考价对比 | 详情卡显示 `refPriceText` + `refGapText`（挂牌高于/低于参考价 N%） |

注意点：非小区选中（学校/聚合）时需清理 `historyRows/refPriceText` 等字段，避免残留数据串卡；canvas 用 `wx:if` 挂载、`createSelectorQuery().fields({node,size})` 获取节点。

### 3.5 P0.1 缓存可用性解耦（清单项 1）

问题：`dataVersion()` 在每次缓存查找前查 D1，D1 宕机时所有 API（含缓存命中）全部失败。

方案（无需新增 KV 资源）：
- `dataVersion(env, ctx)` 每次成功读 D1 后，将版本号写入 Cache API 键 `https://worker-cache.invalid/7/data-version`（`ctx.waitUntil` 异步写，失败静默）。
- D1 查询失败时回退 `cachedDataVersion()`，有缓存版本则继续服务（旧版本键的缓存响应仍可命中）。
- 新增测试：D1 故障时 `/api/meta` 缓存命中仍 200。

### 3.6 P1.1 滥用防护（清单项 3）

- 速率限制：`rateLimit(request, url)`，基于 `CF-Connecting-IP` + 10 秒时间桶，存于 Cache API；分组限额 map 60 / search 30 / heatmap 10 / export 10 次，超限返回 429（`no-store`）。
- 视图跨度收紧：`parseBounds` 从 5 度改为东西 ≤2、南北 ≤1.5，并限定深圳服务区（113.2~115.2 / 21.8~23.5）。
- 新增测试：31 次搜索请求第 31 次 429；超范围/超宽 viewport 400。

### 3.7 遇到的问题与解决（重要复查点）

1. **测试 mock 的 string key bug**：版本缓存键/限流键是裸 string，而 `MemoryCache.match/put` 只处理 `Request` 对象（`request.url`），导致 `get(undefined)/set(undefined,…)` 全部错位 → D1 降级测试 500、限流测试 200。
   修复：`MemoryCache` 增加 `keyOf(request)` 统一处理 string 与 Request（`tests/worker.test.mjs`）。生产代码（Cloudflare Cache API 接受 string）无此问题。
2. **限流位置 bug**：最初把 `rateLimit` 放在 `canonicalCachePath` 检查之后，但 `/api/search` 不在 canonical 列表（即 P1.2 缺口），限流被直接 return 跳过 → 搜索不限流。
   修复：`rateLimit` 提前到 canonical 检查之前执行。
3. **`env.DB.prepare` 抛错时 `ctx.waitUntil` 的 promise**：`caches.default.put(...).catch(() => {})` 确保写失败不产生 unhandled rejection。

## 4. 验证方法（复查时直接执行）

```bash
cd C:\code\Codex\shenzhenMap-web
npm test                                    # 16/16
npm run build                               # typecheck + vite build
npm run verify:remote -- https://map.okzer.xyz
```

线上冒烟：

```bash
curl.exe -s "https://map.okzer.xyz/api/export/rent-yield.csv?district=%E5%8D%97%E5%B1%B1%E5%8C%BA&limit=3" -o NUL -w "%{http_code}"   # 200
curl.exe -s "https://map.okzer.xyz/api/estates?west=110&south=20&east=118&north=25&zoom=10"                                          # 400 地图范围过大
```

小程序复查清单（微信开发者工具导入 `miniprogram/`）：
- 筛选后点"导出租售比+最佳学校 CSV"：应下载并打开文件
- 选择南山区后点"导出当前区域热力图"：应保存到相册（需授权）
- 点击小区查看详情：应有价格历史、官方参考价对比、学位政策
- 品牌卡点"数据来源与方法"：应弹窗显示数据目录与免责声明

## 5. 当前状态

- 测试：16/16 通过（新增 3 项：D1 降级、限流、服务区限制）。
- 线上 Worker：最新版本已部署，verify 全绿。
- 小程序：功能已与网页端对齐（除 P1.4 网页端排序/分享等后续项）。

## 6. 剩余计划（第二批）

见下文"已完成修改（第二批）"——P0.2 索引、P1.2 搜索缓存、P1.3 自动化收尾、P1.4 UX、数据匹配率/学校扩展、robots/sitemap。

---

## 7. 已完成修改（第二批，2026-08-17）

### 7.1 P0.2 挂牌/价格查询索引（清单项 1）

- 新增 `migrations/0013_estates_listing_price_index.sql`：`CREATE INDEX idx_estates_listing_price ON estates (is_listed, has_price, price, id)`，覆盖地图/搜索/榜单的 WHERE+ORDER BY 组合。
- 已应用到远程 D1（`wrangler d1 migrations apply DB --remote`，✅）。
- 测试 schema 同步补 0013（`tests/worker.test.mjs`、`tests/data-import.test.mjs`）。

### 7.2 P1.2 /api/search 接入 Cache API（清单项 2）

- `canonicalCachePath()` 新增 `/api/search` 分支（`worker/index.ts:1040`）：无关键词返回 null（400 由 handler 抛），否则规范化 `q/district/street/pricedOnly/minPrice/maxPrice/sort/page/pageSize` 作为缓存键。
- 至此除 `/api/export/*`（流式 CSV）外所有 GET API 均走版本化缓存。
- 新增测试 `search responses are cached under a canonical key`：等价参数第二次请求 `X-Worker-Cache: HIT`。

### 7.3 P1.3 自动化收尾（清单项 3）

- 新增 `scripts/backup-d1.mjs`：`wrangler d1 export DB --remote` 全量导出到 `backups/d1-<时间戳>.sql`，轮转保留最新 14 份（`--keep=N` 可调），单次导出约 5MB。
- `scripts/pipeline.mjs` 在 migrate 前插入备份步骤（`--skip-backup` 可跳过）。
- 失败通知（`NOTIFY_WEBHOOK` / `--notify-url`）与自动验证（pipeline 内 verify 步骤）已存在；`fetch_house_prices/scripts/run-daily.bat` 增加 NOTIFY_WEBHOOK 未配置时的日志提示。计划任务 `\ShenzhenMapDailyUpdate` 未传 webhook，需在系统环境变量设置 `NOTIFY_WEBHOOK`。

### 7.4 P1.4 结果排序 / 列表内搜索 / 可分享 URL（清单项 4）

后端（`worker/index.ts`）：
- `SORT_CLAUSES` + `parseSort()`：`price-desc`（默认，同旧行为）/ `price-asc` / `rent-yield`，非法值回退默认。
- `/api/estates` 与 `/api/search` 的 results/map 明细 ORDER BY 按排序切换；集群模式不受影响（GROUP BY）。
- 排序值进入两接口的 canonical 缓存键。

Web 端：
- `types.ts` 新增 `EstateSort` 并加入 `EstateFilters`；`api.ts` 的 `mapParams/filterParams` 透传 `sort`。
- `ResultsPanel.vue`：新增排序下拉（v-model:sort 绑定 filters.sort，切换即触发地图/榜单重载）+ "在结果中搜索"输入框（客户端过滤当前已加载列表，过滤时隐藏"加载更多"）。注意加了 scoped style，面板是滚动容器无需改高度。
- `App.vue` 可分享 URL：`readUrlState()` 读取 `district/street/q/pricedOnly/minWan/maxWan/sort/bounds/schools/zones/lat/lng/zoom` 初始化状态；`syncUrl()`（防抖 400ms + `history.replaceState`）在筛选/图层/地图移动时回写 URL。地图初始中心/缩放从 URL 恢复。
- `MapView.vue`：新增 `initialView` prop；`moveend zoomend` 时 `viewchange` emit（leaflet `getCenter()` 返回 LatLng，需转 `[lat, lng]` 元组，否则 vue-tsc 报 TS2769——踩坑点）。
- `FiltersPanel.vue` reset() 改为保留 `sort` 字段（否则类型报错）。

小程序端（`miniprogram/pages/index/`）：
- 结果卡新增"在结果中搜索"输入框：`filterResults()` 客户端过滤 `resultFiltered`，`handleResultTap` 改用 `resultFiltered` 下标。已加载列表过滤，不重新请求。

### 7.5 安全与可发现性（清单项 6）

- `JSON_HEADERS` 增加 `Referrer-Policy: strict-origin-when-cross-origin`（此前仅静态资源有）。
- 新增 `public/robots.txt`（Disallow /api/，声明 sitemap）与 `public/sitemap.xml`（单页站点，仅首页 URL）。
- Cloudflare 面板级 Rate Limiting / WAF 规则依赖付费计划，代码层限流已覆盖（见 3.6），未做面板配置。

### 7.6 遇到的问题与解决（第二批，复查重点）

1. **leaflet LatLng 类型不匹配**：`map.getCenter()` 返回 `LatLng` 而非 `[number, number]`，emit 类型推断失败（TS2769 "not assignable to 'detail-loading'"——错误信息具误导性）。修复：显式 `[center.lat, center.lng]`。
2. **FiltersPanel reset 缺新字段**：EstateFilters 加 sort 后 reset() 字面量缺字段导致 vue-tsc 报错，改为 `...props.modelValue` 展开保留 sort。
3. **wrangler d1 export 命令退出慢**：备份/迁移命令实际成功但 wrangler 进程挂起导致 shell 超时——以输出内容为准，不是失败。
4. **emit 在 Leaflet 事件回调内类型推断崩坏**：回调闭包内 emit 推断错误，提到顶层 `handleMapMove` 函数后解决（vue-tsc 上下文类型问题）。

### 7.7 第二批验证结果

- 测试：18/18 通过（新增：搜索缓存、排序与缓存键区分）。
- typecheck / vite build 通过；部署成功（Worker 版本 `0c64a7c3`，assets 新增 robots.txt/sitemap.xml/新包）。
- 线上抽查：`sort=price-asc` 返回 9000/14967/15420 递增 ✓；`/api/meta` `X-Worker-Cache: HIT` ✓；备份文件 5,074,841 字节 ✓。

### 7.8 第二批剩余 / 未做

- 数据（清单项 5）：官方参考价匹配率提升、学校覆盖扩展到其他 8 区——依赖数据车间（`C:\code\Codex\fetch_house_prices`），需独立处理。
- Cloudflare 面板 WAF/Rate Limiting 规则（付费计划）。
- 小程序发版前：配置 downloadFile/request 合法域名、相册权限隐私声明。