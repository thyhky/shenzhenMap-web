# 微信小程序 1.2.1

上传目录：`uniapp/dist/build/mp-weixin/`

审核备注（20 字以内）：

> 升级多端架构，优化地图交互

发布前从项目根目录执行：

```powershell
npm ci
npm --prefix uniapp ci
npm test
npm run typecheck
npm run uni:typecheck
npm run uni:build:h5
npm run uni:build:mp-weixin
$env:WECHAT_APP_ID = '<正式 AppID>'
npm run uni:prepare:mp-weixin
```

确认 Node.js >= 24、34 项测试通过，且 `manifest.json` 为 `1.2.1/121`。最终微信构建后再注入 AppID，不要在注入后重新构建。

检查生成的 `project.config.json`：正式 AppID、`urlCheck=true`、`minified=true`；检查 `app.json`：`lazyCodeLoading="requiredComponents"`。微信开发者工具和真机回归通过后上传 `1.2.1`，再在公众平台提交审核并发布。不要上传旧的 `miniprogram/` 目录。
