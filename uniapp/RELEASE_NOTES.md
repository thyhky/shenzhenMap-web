# 微信小程序 1.2.0

上传目录：`uniapp/dist/build/mp-weixin/`

审核备注（20 字以内）：

> 升级多端架构，优化地图交互

发布前从项目根目录执行：

```powershell
npm run uni:build:mp-weixin
$env:WECHAT_APP_ID = '<正式 AppID>'
npm run uni:prepare:mp-weixin
```

微信开发者工具上传后，在公众平台提交审核并发布。不要上传旧的 `miniprogram/` 目录。
