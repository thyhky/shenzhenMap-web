// backup-d1.mjs — Export the remote D1 database to backups/ with rotation
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWrangler } from './run-wrangler.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const backupDir = resolve(projectRoot, 'backups')
const productionConfig = 'wrangler.uni-production.jsonc'
const keep = 14

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/backup-d1.mjs [--keep=N]
Export the remote D1 database as SQL to backups/, keeping the newest N files.

  --keep=N   number of backups to keep (default: ${keep})`)
  process.exit(0)
}
const keepArg = args.find((argument) => argument.startsWith('--keep='))
const unknown = args.filter((argument) => !argument.startsWith('--keep='))
if (unknown.length) {
  throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
}
if (keepArg && !/^[1-9]\d*$/.test(keepArg.slice('--keep='.length))) {
  throw new Error(`Invalid --keep value: ${keepArg}`)
}
const keepCount = keepArg ? Number(keepArg.slice('--keep='.length)) : keep

mkdirSync(backupDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const output = resolve(backupDir, `d1-${stamp}.sql`)

// wrangler on Windows keeps the process alive after finishing, so run-wrangler
// treats the final "Downloaded ... successfully" line as completion and kills
// the zombie process tree.
await runWrangler(wrangler, ['d1', 'export', 'DB', '--remote', '--output', output, '--config', productionConfig], {
  cwd: projectRoot,
  donePatterns: [/Downloaded .* successfully/i],
  failPatterns: [/^X /, /fetch failed/i, /ERROR/i],
})

const files = readdirSync(backupDir)
  .filter((name) => /^d1-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/.test(name))
  .sort()
  .reverse()
for (const stale of files.slice(keepCount)) rmSync(resolve(backupDir, stale))
console.log(`\nBackup written: ${output} (kept ${Math.min(files.length, keepCount)}/${files.length})`)
