# 项目阶段性交付摘要

状态日期：2026-08-21

主体功能开发已完成。GitHub 最新 `1.2.1` 代码已同步到本地并通过自动构建，仍需完成 H5 浏览器回归/发布和微信真机复测后，才能正式进入维护期；线上服务和每日数据更新继续运行。

## 当前状态

| 项目 | 状态 |
| --- | --- |
| H5 Web | uni-app 生产版本运行于 `https://map.okzer.xyz`；GitHub 最新 UI 优化尚未部署 |
| 微信小程序 | uni-app `1.2.1` 构建和开发者工具 CLI 预览通过，待真机复测后上传、审核并发布 |
| Worker API | 生产运行正常，H5 和微信共用 `https://map.okzer.xyz/api/*` |
| Cloudflare D1 | 生产运行正常，每日数据流水线继续更新 |
| 旧 Web | 根目录 `src/` 仅作短期回滚保留 |
| 旧微信小程序 | `miniprogram/` 是线上 `1.1.0` 源码基线，`1.2.1` 发布后仅作回滚保留 |

2026-08-21 远端验证结果：

- `/api/health` 正常。
- 4,300 个在售有价小区，10 个行政区。
- 78 条街道边界、228 所学校、228 个学区要素。
- 缓存、搜索、地图聚合、详情、历史、分页、榜单和 CSV 导出通过。
- H5 SPA、方法说明、学校/学区图层和历史价格功能标记通过。
- 旧静态数据路径不会暴露完整数据集。

数据数量会随每日任务变化，上述数字只是交付时快照，不应写入业务判断。

2026-08-21 同步 GitHub 最新代码后的本地验证：

- Node.js `24.13.1`、npm `11.8.0`。
- 根工程和 uni-app 均通过 `npm ci`；DCloud 构建链仍报告 42 个已知开发依赖告警。
- 自动测试 34/34 通过（数据/学校校验 15 项、生产锁 2 项、Worker 17 项），根工程和 uni-app 类型检查通过。
- 当前学校门禁识别 99 个近似学区、19 个既有拓扑警告和 8 个既有点/学区警告；允许旧问题原样保留，但拒绝新增同类问题。
- H5 和微信构建通过，生产 Wrangler dry-run 到达 `--dry-run: exiting now`。
- 微信正式 AppID 注入成功，CLI 预览包 `177.5 KB`。
- 微信产物启用 JS 压缩、`requiredComponents` 按需注入，未扫描到调试 JS 或非法 WXSS 后代选择器。

## 运行中的代码

```text
uniapp/src/                 H5 与微信共享前端源码
worker/                     当前生产 API
migrations/                 当前 D1 schema 迁移
scripts/                    构建、部署、数据更新和验证工具
wrangler.uni-production.jsonc
                             uni-app H5 生产部署配置
```

构建产物不进入 Git：

```text
uniapp/dist/build/h5/          Web 发布产物
uniapp/dist/build/mp-weixin/   微信开发者工具上传产物
```

以下目录不是新需求开发入口：

```text
src/                         旧 Web 前端
miniprogram/                 旧原生微信小程序
```

## 已交付能力

- H5 桌面三栏、移动端底栏和上拉抽屉。
- 微信原生地图适配和 WGS84/GCJ-02 转换。
- 当前视口查询、低缩放聚合、六档价格颜色和地图点选。
- 行政区、街道、关键词、价格和无官方参考价筛选。
- 结果分页、全市搜索、价格/租售比榜单。
- 小区详情、官方参考价、附近学校和 7/30/90 天价格历史。
- 街道边界、学校点位和学区图层。
- CSV 文件导出/分享和区域热力图导出。
- 数据来源、版本、免责声明和方法说明。
- 请求防乱序、图层缓存、微信覆盖物限制和地图交互防抖。
- H5 自动部署验证与失败回滚；微信上传质量配置。

详细实现约束见 [`UNIAPP_IMPLEMENTATION_GUIDE.md`](./UNIAPP_IMPLEMENTATION_GUIDE.md)，功能验收状态见 [`UNIAPP_FEATURE_MATRIX.md`](./UNIAPP_FEATURE_MATRIX.md)。

## 版本待办

GitHub 最新版本还需要完成：

1. 将 H5 部署到独立预览并完成桌面、移动竖屏/横屏和键盘无障碍回归。
2. 验收通过后再部署 H5 生产版本并运行远端验证。

微信发布步骤：

1. 提前确认 request/downloadFile 合法域名及相册隐私用途已配置。
2. 最后一次构建完成后注入正式 AppID，再导入 `uniapp/dist/build/mp-weixin/`。
3. 完成开发者工具和真机关键路径复测后，上传版本 `1.2.1`。
4. 审核备注填写“升级多端架构，优化地图交互”。
5. 公众平台提交审核并发布。
6. 发布后做地图、请求、文件分享和相册保存冒烟验证。
7. 将本文件和 `UNIAPP_MIGRATION_PLAN.md` 的状态更新为“已发布”。

不要上传旧 `miniprogram/` 目录。完整命令见 [`../uniapp/RELEASE_NOTES.md`](../uniapp/RELEASE_NOTES.md)。

## 自动运行任务

Windows 计划任务 `\ShenzhenMapDailyUpdate` 计划每天 03:30 触发：

```text
C:\code\Codex\fetch_house_prices\scripts\run-daily.bat
```

2026-08-21 03:30 最近一次运行结果为 `0`，下一次计划运行时间为 2026-08-22 03:30。任务执行采集、空间归属、参考价匹配、重建数据、测试、快照校验、备份 D1、更新 D1、清理历史并验证生产，不构建或部署客户端。

该任务仅在用户已登录、机器开机并接通市电时运行；错过计划时间不会自动补跑。失败日志位于 `C:\code\Codex\fetch_house_prices\logs\daily-update.log`。`NOTIFY_WEBHOOK` 尚未配置，维护期需要定期人工检查任务结果和日志，否则失败不会主动通知。

手工周更可双击根目录 `run-weekly-update.bat`，或执行 `npm run update:weekly -- --yes`。该入口会合并已经准备好的学校/学区源文件，执行学校门禁和本地 SQL 预演，但不会自动采集宝安、龙华官方学区，也不会自动应用数据库迁移。仅检查计划可使用 `npm run update:weekly -- --dry-run`。

## 已知限制

- 微信地图当前只处理 Polygon/MultiPolygon 外环，含内环孔洞的新图层需要先扩展绘制和命中逻辑。
- 微信程序化视口保护采用 700ms 时间窗，修改地图动画或兼容范围后需要重新真机验证。
- 微信覆盖物受数量和点数限制，新图层必须继续做视口裁剪和几何简化。
- H5 底图依赖 OpenStreetMap 公共瓦片服务。
- uni-app/DCloud 编译器依赖链存在开发依赖审计告警，不应使用 `npm audit fix --force` 单独替换核心编译包。
- `npm run rollback:worker` 回滚 Worker/H5 Assets，不会回滚 D1；回滚前后都要确认 schema 兼容并运行远端验证。
- 仓库包含非密钥的生产资源标识和部署拓扑，不包含 Cloudflare 凭证、真实数据、AppID 注入产物和本地旧 Web 配置。
- `fetch_house_prices` 的每日数据产物当前有本地未提交变化；精确恢复当前生产数据不能只依赖 GitHub。
- D1 备份仅保存在本机 `backups/`，尚无异机备份保障。日常流水线在应用当天更新前导出恢复点；交付时已额外导出更新后快照 `d1-2026-08-21T00-35-53.sql`。

## 恢复开发

一段时间后恢复开发时，按以下顺序建立上下文：

1. 拉取 `shenzhenMap-web` 和私有 `fetch_house_prices` 的最新 `master`，确认工作区没有未知修改。
2. 阅读本文件和 `UNIAPP_IMPLEMENTATION_GUIDE.md`；`WORK_PLAN.md` 是本机忽略文件，只能作为可选现场记录。
3. 恢复 Cloudflare 登录凭证。当前 uni-app 部署和生产数据流水线都使用已跟踪的 `wrangler.uni-production.jsonc`；只有显式部署旧 Web 时才需要被忽略的 `wrangler.jsonc`。
4. 恢复应用数据有两条独立路径：私有数据仓库/归档恢复 `webmap` 后运行 `npm run sync:data`；D1 灾难恢复则人工审查并执行更新后的 SQL 备份。`sync:data` 不能从 D1 反向生成快照。
5. 检查 `https://map.okzer.xyz`、Cloudflare、微信线上版本、D1 迁移和计划任务状态。
6. 安装根项目和 uni-app 依赖。
7. 只在 `uniapp/src/` 开发新前端需求；后端需求修改 `worker/` 和对应测试。
8. 完成双端构建、H5 浏览器和微信真机验证后再发布。

```powershell
npm ci
npm --prefix uniapp ci
npx wrangler login
npm run sync:data
npm test
npm run typecheck
npm run uni:typecheck
npm run uni:build:h5
npm run uni:build:mp-weixin
npm run verify:remote
```

新机器需要重新创建日更计划任务，以下命令中的仓库路径必须与实际位置一致：

```powershell
$action = New-ScheduledTaskAction -Execute 'C:\code\Codex\fetch_house_prices\scripts\run-daily.bat'
$trigger = New-ScheduledTaskTrigger -Daily -At '03:30'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 72)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'ShenzhenMapDailyUpdate' -Action $action -Trigger $trigger -Settings $settings -Principal $principal
```

## 发布与回滚

交付时生产 Worker/H5 版本为 `b0b4e0f6-ae0e-4a47-a217-7b44f29de890`。版本号仅用于定位交付基线，后续部署会变化。

```powershell
# H5 预览与生产
npm run deploy:uni:preview
npm run deploy:uni:production

# 微信构建
npm run uni:build:mp-weixin
$env:WECHAT_APP_ID = '<正式 AppID>'
npm run uni:prepare:mp-weixin

# Worker/H5 回滚，随后必须验证
npm run rollback:worker
npm run verify:remote

# 显式重新构建并部署旧 Web，需要本地生产 wrangler.jsonc
npm run deploy:legacy
```

`rollback:worker` 只选择上一 Worker/Assets 版本，不保证它就是旧 Web。微信回退在公众平台“版本管理”中选择上一线上版本。D1 没有自动恢复流程，本机 `backups/` 中的 SQL 需要人工审查后恢复。

生产 D1 更新仍遵循非破坏性流程：禁止在已有数据库上执行 `db:seed:remote`。常规生产更新使用 `npm run pipeline`；`db:update:remote` 也使用相同保护，但读取现有 `data/` 快照而不重新同步。

分片更新中断时按错误提示使用 `npm run pipeline -- --profile=PROFILE --start=N --skip-migrate --skip-deploy` 复用现有 manifest/parts，不要重新同步或生成；该恢复模式绕过快照保护，执行前必须人工确认剩余分片和数据时点。
