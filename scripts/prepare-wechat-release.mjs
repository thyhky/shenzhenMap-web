import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appid = process.env.WECHAT_APP_ID?.trim()
if (!appid || !/^wx[a-f0-9]{16}$/i.test(appid)) {
  throw new Error('Set WECHAT_APP_ID to the official wx AppID before preparing a release build')
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = resolve(projectRoot, 'uniapp', 'dist', 'build', 'mp-weixin', 'project.config.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
config.appid = appid
config.setting = { ...config.setting, urlCheck: true }
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Prepared WeChat release project for ${appid}`)
