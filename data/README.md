# Local Data

真实小区、价格、学校和学区快照不随公开源码仓库提交。

本地开发需要准备以下文件：

- `estates.geojson`
- `streets.geojson`
- `schools.geojson`
- `school_zones.geojson`

这些文件由私有数据车间生成，再使用以下命令同步：

```bash
npm run sync:data
npm run db:setup:local
```

请不要把真实数据、抓取结果、API 密钥或生成的 SQL 文件提交到公开仓库。
