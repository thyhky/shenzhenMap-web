// prune-price-history.mjs — Keep at most HISTORY_DAYS of price history on the
// remote D1 database (circular overwrite). Run after update parts are applied.
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWrangler } from './run-wrangler.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/prune-price-history.mjs [--local] [--days=90]
Delete price history older than --days (default 90) to keep storage bounded.`)
  process.exit(0)
}
const daysArg = args.find((argument) => argument.startsWith('--days='))
const days = daysArg ? Number(daysArg.slice('--days='.length)) : 90
if (!Number.isInteger(days) || days < 1 || days > 3650) {
  throw new Error(`Invalid --days value: ${daysArg}`)
}
const target = args.includes('--local') ? '--local' : '--remote'

await runWrangler(
  wrangler,
  ['d1', 'execute', 'DB', target, '--command', `DELETE FROM price_history WHERE date(captured_at) < date('now', '-${days} days')`],
  {
    cwd: projectRoot,
    donePatterns: [/"success": true/, /executed successfully/i],
    failPatterns: [/^X /, /fetch failed/i, /ERROR/i],
  },
)
console.log(`[prune] price history pruned to the last ${days} days (${target})`)
