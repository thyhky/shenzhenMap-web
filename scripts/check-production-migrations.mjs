import { execFileSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const local = (await readdir(resolve(projectRoot, 'migrations')))
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort()

const output = execFileSync(process.execPath, [
  wrangler,
  'd1', 'execute', 'DB', '--remote',
  '--config', 'wrangler.uni-production.jsonc',
  '--command', 'SELECT name FROM d1_migrations ORDER BY id',
  '--json',
], {
  cwd: projectRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  timeout: 120_000,
})
const firstBracket = output.indexOf('[')
const lastBracket = output.lastIndexOf(']')
if (firstBracket < 0 || lastBracket < firstBracket) throw new Error('Wrangler returned no migration JSON')
const payload = JSON.parse(output.slice(firstBracket, lastBracket + 1))
if (!payload[0]?.success || !Array.isArray(payload[0].results)) throw new Error('Could not read production migration state')
const applied = new Set(payload[0].results.map((row) => row.name))
const pending = local.filter((name) => !applied.has(name))
const unknown = [...applied].filter((name) => !local.includes(name))
if (unknown.length) throw new Error(`Production has migrations missing from this checkout: ${unknown.join(', ')}`)
if (pending.length) throw new Error(`Weekly data update refuses pending migrations: ${pending.join(', ')}`)
console.log(`Production migration preflight passed: ${applied.size} applied, none pending`)
