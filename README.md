# 深圳住区观察 Cloudflare 版

独立工程（`C:\code\Codex\shenzhenMap-web`），与数据车间解耦。前端只负责交互和展示，小区及街道数据存储在 Cloudflare D1，由 Worker 按当前地图范围提供。

项目状态：主体功能开发已完成，`1.2.1` 正在完成发布前回归，之后进入维护期。当前线上状态、待办和恢复开发步骤见 [`docs/PROJECT_HANDOFF.md`](./docs/PROJECT_HANDOFF.md)。

本仓库公开应用源码、数据处理结构和非密钥 Worker 资源配置，不包含真实小区/价格/学校/学区快照、生成 SQL、Cloudflare 登录凭据或其他密钥。公开仓库不能直接复现当前线上数据，需要准备自己的数据快照和 Cloudflare 资源。

数据车间 `fetch_house_prices`（私有仓库）保存可重建基线；每日生成的最新主数据与 `webmap/` 产物需要另行提交或归档。精确恢复当前生产状态还需要最新 D1 备份和本地生产配置，详见阶段性交付摘要。

## 架构

- Vue 3 + Vite：响应式前端
- Leaflet：地图渲染
- Cloudflare Worker：同域 `/api/*` 接口
- Cloudflare D1：小区、街道边界、学校和价格历史
- Workers Static Assets：部署前端构建产物

浏览器不再下载完整 `estates.js` 或 `streets.js`。这能避免直接暴露完整数据文件，但公开地图数据仍可能被分范围采集，不能视为绝对防抓取方案。

## 本地运行

需要 Node.js 24 或更高版本。建议使用 lockfile 安装依赖：

当前 uni-app H5 前端默认通过开发代理访问生产 API：

```bash
npm ci
npm --prefix uniapp ci
npm --prefix uniapp run dev:h5
```

如需同时调试本地 Worker/D1，先复制 `wrangler.example.jsonc` 为本地 `wrangler.jsonc`，填写 Worker 和 D1 配置，运行 Worker，并把 `uniapp/vite.config.ts` 的开发代理临时指向 `http://127.0.0.1:8787`：

```bash
npm run db:setup:local
npm run build          # 为 wrangler.example.jsonc 创建其要求的旧 Web Assets 目录
npm run dev:worker
```

本地数据文件参见 `data/README.md`。`npm run dev` 和 `npm run dev:web` 使用根目录 `src/`，仅用于旧 Web 回滚版本调试，不是当前 uni-app 前端入口。

旧 Web 与本地 Worker 的完整预览仍可运行：

```bash
npm run dev
```

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

## 旧原生微信小程序（仅回滚）

`miniprogram/` 是微信 `1.1.0` 的原生小程序回滚基线，直接调用 `https://map.okzer.xyz/api/*`，不依赖 `web-view`。新版本开发和发布统一使用下方 `uniapp/`，不要常规上传此目录。

该回滚版所需平台配置与新版本一致：

- request 合法域名：`map.okzer.xyz`
- downloadFile 合法域名：`map.okzer.xyz`（用于导出租售比+最佳学校 CSV）

当前不需要业务域名，因为页面不使用 `web-view`。旧版源码与运行说明见 [`miniprogram/README.md`](./miniprogram/README.md)。不应提交真实 AppID 或密钥。

## uni-app 迁移工程

`uniapp/` 是当前 Vue 3 + TypeScript 跨端客户端。共享页面、筛选、搜索、排行、详情、导出和地图适配均已完成；H5 已用于生产，旧 Web 与原生小程序暂作回滚保留：

当前生产 H5 仍是已验收的 `1.2.0` 基线；GitHub `1.2.1` 已通过本地自动构建，尚待预览浏览器回归和生产部署。

```bash
npm --prefix uniapp ci
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
npm run pipeline:uni             # 数据流水线并显式部署 uni-app H5
npm run rollback:worker          # 回滚上一 Worker/H5 Assets 版本，不回滚 D1
```

微信正式构建先运行 `npm run uni:build:mp-weixin`，再设置 `WECHAT_APP_ID` 并执行 `npm run uni:prepare:mp-weixin`。公众平台必须配置 `https://map.okzer.xyz` 的 request/downloadFile 合法域名和相册隐私用途。

双端分层、地图适配、状态管理、扩展步骤和发布验收约束见 [`docs/UNIAPP_IMPLEMENTATION_GUIDE.md`](./docs/UNIAPP_IMPLEMENTATION_GUIDE.md)。后续前端需求以该方案为基线，不再同步修改旧 `src/` 或 `miniprogram/`。

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
- `data/school_zones.geojson`

小区属性含 `ref_price`（官方二手住房成交参考价，2024 年度发布，2,881/3,594 匹配，80.2%）。官方参考价由数据车间 `fetch_official_reference_prices.py` 抓取、`match_official_reference_prices.py` 匹配，源数据为深圳市住房和建设局房地产信息平台发布的 2024 年版官方成交参考价（经本地宝转载 HTML 表结构整理）。官方参考价具有年度性，用于与每日更新的挂牌均价对比展示。

`schools.geojson` 当前包含 228 所学校：南山区 129 所使用官方学校点和官方学区多边形；光明区 81 所名单完整，但学区为社区/Voronoi 近似；宝安区 12 所、罗湖区 5 所、龙华区 1 所来自乐有家补充，点位为附近小区质心且学区为近似圆。学校点和边界统一使用 WGS84。招生范围具有年度性，近似数据不能视为官方划片，请以主管部门最新公告为准。

`npm run update:generate` 根据快照生成 `seed/update.sql`。生成的 SQL 被 `.gitignore` 排除，避免把完整数据作为公开源码提交。正式部署时应通过受控环境导入数据库。

## Cloudflare 部署

1. 登录 Cloudflare：

```bash
npx wrangler login
```

2. 当前生产命令固定读取已跟踪的 `wrangler.uni-production.jsonc`。执行任何 `*:remote`、`pipeline*` 或部署命令前，必须确认当前 Cloudflare 账号、D1 ID 和域名属于目标环境。自建环境可先创建自己的 D1，再把资源标识写入自己的部署配置：

```bash
npx wrangler d1 create shenzhen-map --binding DB --update-config
```

3. 首次初始化远程数据库并导入当前数据：

```powershell
npm run db:migrate:remote
npm run seed:generate
$env:ALLOW_REMOTE_SEED = '1' # 仅限已确认的全新空数据库
npm run db:seed:remote
```

`db:seed:remote` 只用于空数据库初始化。初始化 SQL 不包含删除语句，数据库已有数据时会因唯一约束而拒绝重复导入，不会清空现有价格历史。

后续更新优先使用 `npm run pipeline`。`db:update:remote` 现在也走同一套测试、快照校验、本地 SQL 预演、迁移状态检查、备份和验证，只是使用已有的 `data/` 快照而不重新同步：

```bash
npm run db:update:remote
```

增量更新只修改有变化的小区和街道。每次导入无论价格是否变化，都会为每个小区记录一条"每日快照"到 `price_history`（`migrations/0014` 触发器，同一导入日幂等）；价格变化本身也会追加记录。历史保留 90 天，由 `npm run prune:history`（`scripts/prune-price-history.mjs`）循环清理，已接入 pipeline。

生产流水线会在修改 D1 前比较本地快照与线上 `sourceObservedAt`，拒绝时间更旧或小区数量低于线上 80% 的快照。也可单独运行 `npm run validate:data` 检查。生成的 SQL 分片会写入 SHA-256 manifest，预演和远端执行都会拒绝内容被改写的分片。恢复分片按错误提示使用 `npm run pipeline -- --profile=PROFILE --start=N --skip-migrate --skip-deploy`，该模式会绕过快照保护，必须人工确认数据。

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
- `GET /api/schools`：当前学校点位与招生社区，包含南山/光明主数据及宝安/罗湖/龙华补充数据（`/api/layers/school-scopes` 为别名）
- `GET /api/layers/school-zones`：学校学区范围多边形
- `GET /api/heatmap`：按行政区或街道返回逐个小区的热力图点（不返回小区名称），参数需包含 `district`，可选 `street`、`q`、`pricedOnly`、`missingRefPrice`、`minPrice`、`maxPrice`
- `GET /api/layers/{transit|planning}`：计划数据层，暂返回 404

地图接口强制传入 `west`、`south`、`east`、`north`，单次最多返回 1000 个明细点；低缩放级别返回服务端聚合结果。`/api/estates`、`/api/search`、`/api/ranking` 和导出接口支持 `missingRefPrice=1` 只返回无官方参考价的小区；`/api/estates` 和 `/api/search` 支持 `page`（1-1000）与 `pageSize`（1-50）分页，响应带 `pagination.hasMore`。

公开地图的 API 不能视为私有数据接口：浏览器需要读取的数据，终端用户都可以通过开发者工具或网络请求查看。当前 API 返回 `X-Robots-Tag: noindex, nofollow, noarchive`，仅用于避免搜索引擎建立索引，不提供访问控制。若需要限制批量读取，应在 Cloudflare 配置 Rate Limiting/WAF；若需要真正私有化，应为站点启用 Cloudflare Access 或登录鉴权。

## 从 GitHub 重建（新机器复现）

两个仓库拉到新机器后可以重建完整工作区。已经提交到 GitHub 的内容：

- `shenzhenMap-web`：应用源码、全部迁移、脚本、测试、`wrangler.example.jsonc`、小程序源码
- `fetch_house_prices`（私有）：已提交时点的主数据与 `webmap/` 构建产物；日更后的本地变化需要另行提交或归档

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

# 3. 初始化本地 D1
npm run db:setup:local

# 4. 创建本地 Wrangler 配置所需的 Assets 目录
npm run build

# 5. 终端一启动本地 API
npm run dev:worker

# 6. 将 uniapp/vite.config.ts 开发代理指向 127.0.0.1:8787 后，终端二启动当前 H5
npm --prefix uniapp run dev:h5

# 7. 远程数据流水线（需先 wrangler login；当前生产配置已跟踪）
npm run pipeline          # 测试 -> 同步 -> 快照校验 -> 生成 -> 备份 -> 迁移 -> 应用 -> prune -> 验证
npm run pipeline:uni      # 同上，并构建/部署 uni-app H5
npm run pipeline:legacy   # 同上，并构建/部署旧 Web
```

如果不想使用仓库内已提交的 `webmap/`，可在 `fetch_house_prices` 里重新运行采集流水线（`fetch_xq_leyoujia.py` → `build_web_map_data.py` 等）生成新的快照，但需要乐有家等数据源仍可访问。

## 一键每周数据更新

Windows 上可双击仓库根目录的 [`run-weekly-update.bat`](./run-weekly-update.bat)。确认后，它会依次执行小区采集、空间归属、官方参考价匹配、四套合并快照生成、学校/学区门禁、本地 SQL 全量预演、D1 备份、生产数据更新和远端验证，不部署 H5、Worker 或小程序客户端，也不会自动应用待处理数据库迁移。

命令行等价操作：

```powershell
npm run update:weekly -- --yes
```

首次运行前可只检查路径和执行计划，不采集或写入生产：

```powershell
npm run update:weekly -- --dry-run
```

常用选项：

- `--full`：执行完整小区列表审计，而不是常规地图范围刷新。
- `--with-rent`：同时更新租金样本。
- `--allow-school-id-replacements`：允许经人工审查的学校 ID 替换；常规更新不要使用。
- `--allow-school-content-changes`：允许发布日期相同但内容发生变化的学校/学区；仅用于人工确认的边界修正。
- `--allow-school-geometry-warnings`：允许人工确认的新拓扑或点/学区警告；常规更新不要使用。
- `--workshop=DIR`：指定私有数据车间目录。

脚本不会抓取或自动补齐宝安、龙华官方学校/学区。它只合并 `fetch_house_prices` 中现有的光明、南山和补充源文件；新增官方数据必须先整理为现有 Point/Polygon 契约，再由脚本校验和发布。

## 一次性分类更新工具

以下两个 Windows 工具只更新指定的数据表，都会先执行迁移门禁、数据校验、本地 SQL 预演和 D1 备份，最后上传 Cloudflare D1 并验证；不会部署 H5、Worker 或小程序客户端：

```text
run-school-data-update-once.bat
run-estate-price-update-once.bat
```

`run-school-data-update-once.bat` 会先运行数据车间的 `build_web_map_data.py`，然后只同步和写入 `schools`、`school_zones` 及对应版本元数据。它默认不会抓取教育局数据；运行前应先更新 `fetch_house_prices` 中的学校/学区源文件。如需自动重新采集官方源，再组装并上传，使用显式开关（需 `AMAP_KEY` 与网络）：

```powershell
npm run update:schools -- --yes --refresh-sources
```

`--refresh-sources` 会在组装前调用 `fetch_house_prices/refresh_school_sources.py`，按依赖顺序跑完：抓取光明区政府划片表、高德地理编码、乐有家学校详情与补充、构建光明学区近似范围、构建南山学校（需你放置的解密源 `ns_xqdt_dec.json` 或你自写的 `fetch_ns_school_zones.py`）、组装 `webmap/schools.geojson`。仅采集本地、不触碰生产。单独做本地采集可用 `fetch_house_prices/refresh-school-sources.bat`。学校 ID、同发布日期内容或几何警告发生受控变化时，使用脚本提示的人工审核参数。

`run-estate-price-update-once.bat` 会执行常规小区采集、空间归属、官方参考价匹配和 webmap 构建，然后只写入 `estates`、`streets` 及对应版本元数据。`price_history` 由 D1 触发器生成同日幂等快照，并在成功后清理 90 天前记录；学校和学区表不会改变。

只检查执行计划、不采集或写入生产时使用命令行入口；BAT 固定执行对应的生产 profile，不转发自定义参数：

```powershell
npm run update:schools -- --dry-run
npm run update:estate-prices -- --dry-run
```

命令行等价入口为 `npm run update:schools -- --yes` 和 `npm run update:estate-prices -- --yes`。三个生产更新入口在当前机器、当前 checkout 内共用 `.production-data-update.lock`，不能并行执行；该文件锁不能阻止其他机器、其他 clone 或直接 Wrangler 命令写入同一个 D1。

学校门禁要求必填字段完整且格式规范、学校 ID 唯一、发布时间不倒退、Point 位于深圳安全范围、每所学校恰好对应一个无内环的 Polygon/MultiPolygon 学区、学校与学区的行政区/学段一致，并禁止各区学校数量下降、未授权 ID 替换或同日期内容变化。已知旧拓扑问题只能原样保留或修复，不允许静默替换为另一份错误几何，也不允许新增自相交学区或新增“学校点落在学区外”的情况。`pipeline` 会更新全部四类数据，不是学校专用更新；执行前仍需审查私有仓库中的小区变化。

一键周更使用当前 checkout 的生产数据锁，与原日更及直接执行 `pipeline` 互斥。进程异常退出后的死锁会在确认原 PID 不存在时自动清理；如果锁仍属于存活进程，必须先确认该任务状态，不能直接删除锁文件。

## 自动化运维

每日数据更新已配置计划任务，但受登录、电源和开机状态约束：

- 计划任务 `\ShenzhenMapDailyUpdate`（03:30）执行 `fetch_house_prices/scripts/run-daily.bat`，再调用 `daily-update.mjs`
- 仅在用户已登录、机器开机并使用市电时运行；错过计划时间不会自动补跑
- 链路：采集 → 空间归属 → 官方参考价匹配 → 重建 webmap → 测试/同步/快照校验/本地 SQL 预演/迁移状态检查/备份/应用/prune/验证，不自动应用迁移，也不构建或部署客户端
- 备份：`scripts/backup-d1.mjs` 每天导出远程 D1，保留最近 14 份到 `backups/`
- 历史清理：`npm run prune:history` 保留最近 90 天价格快照，已在 pipeline 中执行
- 失败日志：`fetch_house_prices/logs/daily-update.log`
- 失败通知：环境变量 `NOTIFY_WEBHOOK` 未配置，维护期必须人工巡检任务结果和日志

Windows 上 Wrangler 命令完成后进程可能不退出（zombie 进程）。自动生产流水线中的备份、迁移、更新、清理和部署调用使用 `scripts/run-wrangler.mjs`；手工命令若不退出，需要检查输出后结束残留进程。

## 后续数据更新

`price_history` 表已保留历史价格。通过增量 Upsert 更新 `estates.price` 时，数据库触发器会自动追加历史记录。不要直接执行全表删除，也不要把抓取密钥或更新入口放到前端。

学校数据更新由数据车间脚本和南山区官方学区地图接口生成。高德 Web 服务 Key 仅通过 `AMAP_KEY` 环境变量传入，不能写入源码或同步快照。
