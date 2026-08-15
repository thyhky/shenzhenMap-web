import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = resolve(projectRoot, 'data')
const defaultSource = 'C:\\code\\Codex\\fetch_house_prices\\webmap'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/sync-data.mjs [--from=<webmap dir>]

Copies estates.geojson, streets.geojson, schools.geojson and school_zones.geojson from the data
workshop's webmap directory into ./data.

  --from=DIR   source webmap directory
               (default: ${defaultSource})`)
  process.exit(0)
}
const fromArgument = args.find((argument) => argument.startsWith('--from='))
const unknown = args.filter((argument) => !argument.startsWith('--from='))
if (unknown.length) {
  throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
}
const sourceRoot = fromArgument ? fromArgument.slice('--from='.length) : defaultSource

const files = ['estates.geojson', 'streets.geojson', 'schools.geojson', 'school_zones.geojson']
await mkdir(dataRoot, { recursive: true })
for (const name of files) {
  const source = resolve(sourceRoot, name)
  const target = resolve(dataRoot, name)
  await copyFile(source, target)
  console.log(`Synced ${target}`)
}
console.log('Data snapshot up to date')
