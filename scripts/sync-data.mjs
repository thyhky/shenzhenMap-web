import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireFeatureCollection } from './data-sql.mjs'
import { profileFiles, requireUpdateProfile } from './update-profile.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = resolve(projectRoot, 'data')
const defaultSource = process.env.DATA_WORKSHOP_PATH || resolve(projectRoot, '..', 'fetch_house_prices', 'webmap')

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/sync-data.mjs [--from=<webmap dir>] [--profile=PROFILE]

Copies the selected GeoJSON snapshots from the data workshop's webmap directory into ./data.

  --from=DIR   source webmap directory
               (default: DATA_WORKSHOP_PATH or ${defaultSource})
  --profile=PROFILE  all, schools, or estate-prices (default: all)`)
  process.exit(0)
}
const fromArgument = args.find((argument) => argument.startsWith('--from='))
const profileArgument = args.find((argument) => argument.startsWith('--profile='))
const unknown = args.filter((argument) => !argument.startsWith('--from=') && !argument.startsWith('--profile='))
if (unknown.length) {
  throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
}
if (fromArgument !== undefined && fromArgument.slice('--from='.length).trim() === '') {
  throw new Error('--from requires a directory path')
}
const sourceRoot = fromArgument ? fromArgument.slice('--from='.length) : defaultSource
const profile = requireUpdateProfile(profileArgument === undefined ? 'all' : profileArgument.slice('--profile='.length))

const files = profileFiles(profile)
const snapshots = await Promise.all(files.map(async (name) => {
  const content = await readFile(resolve(sourceRoot, name))
  requireFeatureCollection(name, JSON.parse(content.toString('utf8')))
  return content
}))
await mkdir(dataRoot, { recursive: true })
const staged = files.map((name) => resolve(dataRoot, `.${name}.${process.pid}.tmp`))
try {
  await Promise.all(staged.map((target, index) => writeFile(target, snapshots[index])))
  for (const [index, name] of files.entries()) {
    const target = resolve(dataRoot, name)
    await rename(staged[index], target)
    console.log(`Synced ${target}`)
  }
} finally {
  await Promise.all(staged.map((target) => rm(target, { force: true })))
}
console.log(`Data snapshot up to date (${profile})`)
