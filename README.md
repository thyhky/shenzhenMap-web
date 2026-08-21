# 深圳住区观察 Cloudflare 版

独立工程（`C:\code\Codex\shenzhenMap-web`），与数据车间解耦。前端只负责交互和展示，小区及街道数据存储在 Cloudflare D1，由 Worker 按当前地图范围提供。

本仓库公开的是应用源码、数据处理结构和 Worker 资源配置，不包含真实小区、价格、学校、学区快照、生成 SQL、Cloudflare 登录凭据或其他密钥。公开仓库不能直接复现当前线上数据，需要准备自己的数据快照和 Cloudflare 资源。

数据车间 `fetch_house_prices`（私有仓库）已提交全部主数据与 `webmap/` 构建产物（见下文"从 GitHub 重建"），因此从 GitHub 拉取两个仓库后可以重建完整本地工作区。

## 架构

- Vue 3 + Vite：响应式前端
- Leaflet：地图渲染
- Cloudflare Worker：同域 `/api/*` 接口
- Cloudflare D1：小区、街道边界、学校和价格历史
- Workers Static Assets：部署前端构建产物

浏览器不再下载完整 `estates.js` 或 `streets.js`。这能避免直接暴露完整数据文件，但公开地图数据仍可能被分范围采集，不能视为绝对防抓取方案。

## 本地运行

需要 Node.js 24 或更高版本。建议使用 lockfile 安装依赖：

先复制 `wrangler.example.jsonc` 为本地 `wrangler.jsonc`，填写自己的 Worker 名称和 D1 配置；本地数据文件请参见 `data/README.md`。

完整本地预览使用 Wrangler Worker、Assets 和本地 D1：

```bash
npm ci
npm run db:setup:local
npm run dev
```

访问 `http://127.0.0.1:8787`。`npm run dev` 会先构建前端，再启动本地 Worker。

如果只调试 Vue 页面，可拆成两个终端：

```bash
# 终端一：本地 Worker + D1 API
npm run dev:worker

# 终端二：Vite 热更新页面，访问 http://127.0.0.1:5173
npm run dev:web
```

Vite 已将 `/api` 代理到 `http://127.0.0.1:8787`。

### 本地数据调试

首次创建或重建本地 D1：

```bash
npm run db:setup:local
```

数据快照更新后，仅同步本地数据库：

```bash
npm run sync:data
npm run db:update:local
```

检查本地 API：

```bash
curl.exe http://127.0.0.1:8787/api/health
curl.exe http://127.0.0.1:8787/api/meta
curl.exe http://127.0.0.1:8787/api/schools
curl.exe http://127.0.0.1:8787/api/layers/school-zones
```

在 PowerShell 中，如果本地数据库状态损坏或迁移记录与表结构不一致，可清除本地 Wrangler 状态后重建。该操作只影响本地数据：

```powershell
Remove-Item -Recurse -Force .wrangler
npm run db:setup:local
```

`db:setup:local` 只适用于空的本地数据库。已有本地数据时重复执行 seed 可能触发唯一键冲突，应使用 `npm run db:update:local`。

## 微信小程序

`miniprogram/` 提供一个微信原生小程序页面，直接调用 `https://map.okzer.xyz/api/*`，不依赖 `web-view`。使用微信开发者工具导入该目录，并将 `project.config.json` 中的 `touristappid` 替换为自己的 AppID。

发布前需要在微信公众平台配置：

- request 合法域名：`map.okzer.xyz`
- downloadFile 合法域名：`map.okzer.xyz`（用于导出租售比+最佳学校 CSV）

当前不需要业务域名，因为页面不使用 `web-view`。详细步骤见 [`miniprogram/README.md`](./miniprogram/README.md)。不应提交真实 AppID 或密钥。

## uni-app 迁移工程

`uniapp/` 是当前 Vue 3 + TypeScript 跨端客户端。共享页面、筛选、搜索、排行、详情、导出和地图适配均已完成；H5 已用于生产，旧 Web 与原生小程序暂作回滚保留：

```bash
npm --prefix uniapp install
npm run uni:typecheck
npm run uni:build:h5
npm run uni:build:mp-weixin
```

微信构建结果位于 `uniapp/dist/build/mp-weixin/`。完整计划与逐项验收状态见 [`docs/UNIAPP_MIGRATION_PLAN.md`](./docs/UNIAPP_MIGRATION_PLAN.md) 和 [`docs/UNIAPP_FEATURE_MATRIX.md`](./docs/UNIAPP_FEATURE_MATRIX.md)。

H5 独立预览地址：<https://shenzhen-estate-map-uni-preview.shenzhen-estate-map-cloudflare.workers.dev>。该地址不承载生产域名流量。

uni-app 发布命令：

```bash
npm run deploy:uni:preview       # 独立 Workers 预览地址
npm run deploy:uni:production    # 验收后切换 map.okzer.xyz
npm run deploy                   # 等同于 deploy:uni:production
npm run deploy:legacy            # 显式重新部署旧 Web 静态资源
npm run pipeline:uni             # 生产切换后的每日数据流水线
npm run rollback:worker          # 回滚 Worker/API 到上一部署版本
```

微信正式构建先运行 `npm run uni:build:mp-weixin`，再设置 `WECHAT_APP_ID` 并执行 `npm run uni:prepare:mp-weixin`。公众平台必须配置 `https://map.okzer.xyz` 的 request/downloadFile 合法域名和相册隐私用途。

## 数据来源

数据快照存放在 `./data/`，由 `npm run sync:data` 从独立的私有数据车间同步。默认来源是当前仓库同级的 `fetch_house_prices/webmap`，也可以使用 `DATA_WORKSHOP_PATH` 或 `--from=` 指定其他路径：

```powershell
# 默认并列目录
npm run sync:data

# 指定私有数据车间
$env:DATA_WORKSHOP_PATH = 'D:\private\shenzhenMap-data\webmap'
npm run sync:data

# 单次指定来源
npm run sync:data -- --from='D:\private\shenzhenMap-data\webmap'
```

- `data/estates.geojson`
- `data/streets.geojson`
- `data/schools.geojson`

小区属性含 `ref_price`（官方二手住房成交参考价，2024 年度发布，2,881/3,594 匹配，80.2%）。官方参考价由数据车间 `fetch_official_reference_prices.py` 抓取、`match_official_reference_prices.py` 匹配，源数据为深圳市住房和建设局房地产信息平台发布的 2024 年版官方成交参考价（经本地宝转载 HTML 表结构整理）。官方参考价具有年度性，用于与每日更新的挂牌均价对比展示。

学校数据当前覆盖光明区和南山区：`schools.geojson` 含 2026 年官方数据的 228 所学校，包含学校名称、地址、对应社区和咨询电话。光明区学区范围依据官方招生社区名称按社区中心点 Voronoi 划分，为近似范围；南山区学区范围采用南山区教育局学区地图的官方多边形。学校点位和南山区边界经坐标转换为 WGS84，用于地图展示。招生范围具有年度性，请以主管部门最新公告为准。

`npm run update:generate` 根据快照生成 `seed/update.sql`。生成的 SQL 被 `.gitignore` 排除，避免把完整数据作为公开源码提交。正式部署时应通过受控环境导入数据库。

## Cloudflare 部署

1. 登录 Cloudflare：

```bash
npx wrangler login
```

2. 首次部署会按 `wrangler.jsonc` 自动创建 D1，也可以手动创建：

```bash
npx wrangler d1 create shenzhen-map --binding DB --update-config
```

3. 首次初始化远程数据库并导入当前数据：

```bash
npm run db:migrate:remote
npm run seed:generate
npm run db:seed:remote
```

`db:seed:remote` 只用于空数据库初始化。初始化 SQL 不包含删除语句，数据库已有数据时会因唯一约束而拒绝重复导入，不会清空现有价格历史。

后续更新数据使用增量 Upsert：

```bash
npm run db:update:remote
```

增量更新只修改有变化的小区和街道。每次导入无论价格是否变化，都会为每个小区记录一条"每日快照"到 `price_history`（`migrations/0014` 触发器，同一导入日幂等）；价格变化本身也会追加记录。历史保留 90 天，由 `npm run prune:history`（`scripts/prune-price-history.mjs`）循环清理，已接入 pipeline。

4. 构建并部署：

```bash
npm run deploy
```

如需自定义域名，在 Cloudflare Dashboard 的 Worker 设置中添加 Custom Domain。

## API

- `GET /api/health`：健康检查
- `GET /api/meta`：行政区、街道、总量和更新时间
- `GET /api/estates`：按地图边界、缩放级别和筛选条件查询或聚合
- `GET /api/search`：不受当前地图视野限制的全市小区搜索
- `GET /api/estates/:id`：读取单个小区详情
- `GET /api/estates/:id/price-history`：小区价格历史（`?limit=1..200`，`?days=1..90` 按最近天数过滤，默认 30 天）
- `GET /api/streets`：街道几何（`/api/layers/streets` 为别名）
- `GET /api/schools`：光明区、南山区 2026 公办学校点位与招生社区（`/api/layers/school-scopes` 为别名）
- `GET /api/layers/school-zones`：学校学区范围多边形
- `GET /api/heatmap`：按行政区或街道返回逐个小区的热力图点（不返回小区名称），参数需包含 `district`，可选 `street`、`pricedOnly`、`minPrice`、`maxPrice`
- `GET /api/layers/{transit|planning}`：计划数据层，暂返回 404

地图接口强制传入 `west`、`south`、`east`、`north`，单次最多返回 1000 个明细点；低缩放级别返回服务端聚合结果。`/api/estates`、`/api/search`、`/api/ranking` 和导出接口支持 `missingRefPrice=1` 只返回无官方参考价的小区；`/api/estates` 和 `/api/search` 支持 `page`（1-1000）与 `pageSize`（1-50）分页，响应带 `pagination.hasMore`。

公开地图的 API 不能视为私有数据接口：浏览器需要读取的数据，终端用户都可以通过开发者工具或网络请求查看。当前 API 返回 `X-Robots-Tag: noindex, nofollow, noarchive`，仅用于避免搜索引擎建立索引，不提供访问控制。若需要限制批量读取，应在 Cloudflare 配置 Rate Limiting/WAF；若需要真正私有化，应为站点启用 Cloudflare Access 或登录鉴权。

## 从 GitHub 重建（新机器复现）

两个仓库拉到新机器后可以重建完整工作区。已经提交到 GitHub 的内容：

- `shenzhenMap-web`：应用源码、全部迁移、脚本、测试、`wrangler.example.jsonc`、小程序源码
- `fetch_house_prices`（私有）：全部主数据（`xq_index.json`、`official_reference_prices.json`、`schools_gm.json`、`rent_index.json` 等）与 `webmap/` 构建产物

未提交、需要现场准备的内容：

- `shenzhenMap-web` 的 `data/*.geojson`、`seed/*.sql`、`seed/update-parts/`（可从数据车间 webmap 同步再生成）、`wrangler.jsonc`（复制 `wrangler.example.jsonc` 并填入自己的 D1 ID）、`.dev.vars`、`backups/`
- `fetch_house_prices` 的 `official_reference_matches.json`、`*_state.json`（抓取检查点，可从主数据重算）、抓取密钥（`AMAP_KEY` 等只走环境变量）

新机器搭建步骤：

```powershell
# 1. 克隆并安装根工程与 uni-app 的独立依赖
git clone <shenzhenMap-web>
git clone <fetch_house_prices>
cd shenzhenMap-web
npm ci
npm --prefix uniapp ci

# 2. 同步数据（默认读取并列目录 fetch_house_prices/webmap）
npm run sync:data

# 3. 本地预览（自动建本地 D1 并 seed）
npm run db:setup:local
npm run dev

# 4. 远程部署（需先 wrangler login；只有旧 Web 发布需要本地 wrangler.jsonc）
npm run pipeline          # 同步 -> 生成 parts -> 备份 -> 迁移 -> 应用 -> prune -> 验证当前线上版本
npm run pipeline:uni      # 同上，并构建/部署 uni-app H5
npm run pipeline:legacy   # 同上，并构建/部署旧 Web
```

如果不想使用仓库内已提交的 `webmap/`，可在 `fetch_house_prices` 里重新运行采集流水线（`fetch_xq_leyoujia.py` → `build_web_map_data.py` 等）生成新的快照，但需要乐有家等数据源仍可访问。

## 自动化运维

每日数据更新已全自动，不需要手动执行任何命令：

- 计划任务 `\ShenzhenMapDailyUpdate`（03:30）执行 `fetch_house_prices/scripts/daily-update.mjs`
- 链路：采集 → 空间归属 → 官方参考价匹配 → 重建 webmap → `shenzhenMap-web` 的完整 pipeline（同步/生成 parts/备份/迁移/应用/prune/构建/部署/验证）
- 备份：`scripts/backup-d1.mjs` 每天导出远程 D1，保留最近 14 份到 `backups/`
- 历史清理：`npm run prune:history` 保留最近 90 天价格快照，已在 pipeline 中执行
- 失败通知：环境变量 `NOTIFY_WEBHOOK` 未配置（需要钉钉/企微机器人地址），配置后可在每日更新失败时收到通知

Windows 上 wrangler 命令完成后进程可能不退出（zombie 进程），所有 wrangler 调用统一走 `scripts/run-wrangler.mjs`（完成模式匹配后主动结束进程树），不要直接用 `wrangler ...` 裸命令。

## 后续数据更新

`price_history` 表已保留历史价格。通过增量 Upsert 更新 `estates.price` 时，数据库触发器会自动追加历史记录。不要直接执行全表删除，也不要把抓取密钥或更新入口放到前端。

学校数据更新由数据车间脚本和南山区官方学区地图接口生成。高德 Web 服务 Key 仅通过 `AMAP_KEY` 环境变量传入，不能写入源码或同步快照。
