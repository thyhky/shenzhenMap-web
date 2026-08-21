import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireProductionUpdateLock, releaseProductionUpdateLock } from './production-update-lock.mjs'
import { runWrangler } from './run-wrangler.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const config = 'wrangler.uni-production.jsonc'
const mode = process.argv[2]
if (!['migrate', 'seed'].includes(mode)) throw new Error('Usage: node scripts/run-production-schema.mjs <migrate|seed>')
if (mode === 'seed' && process.env.ALLOW_REMOTE_SEED !== '1') {
  throw new Error('Remote seed requires ALLOW_REMOTE_SEED=1 and is only valid for a new empty database')
}

const updateLock = await acquireProductionUpdateLock(projectRoot, `production schema ${mode}`)
try {
  if (mode === 'migrate') {
    execFileSync(process.execPath, [resolve(projectRoot, 'scripts', 'backup-d1.mjs')], {
      cwd: projectRoot,
      stdio: 'inherit',
    })
    await runWrangler(wrangler, ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', config], {
      cwd: projectRoot,
      donePatterns: [/Successfully created \d+ migration/, /Executed \d+ commands/, /No migrations to apply!/, /already applied/],
      failPatterns: [/^X /, /fetch failed/i, /ERROR/i],
    })
  } else {
    const output = execFileSync(process.execPath, [
      wrangler,
      'd1', 'execute', 'DB', '--remote', '--config', config,
      '--command', 'SELECT COUNT(*) AS count FROM estates',
      '--json',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      timeout: 120_000,
    })
    const payload = JSON.parse(output.slice(output.indexOf('['), output.lastIndexOf(']') + 1))
    const count = Number(payload[0]?.results?.[0]?.count)
    if (!payload[0]?.success || !Number.isFinite(count)) throw new Error('Could not verify the production database is empty')
    if (count !== 0) throw new Error(`Refusing to seed a non-empty production database (${count} estates)`)
    await runWrangler(wrangler, ['d1', 'execute', 'DB', '--remote', '--file', 'seed/seed.sql', '--config', config], {
      cwd: projectRoot,
      donePatterns: [/"success": true/, /executed successfully/i],
      failPatterns: [/^X /, /"success": false/, /fetch failed/i, /ERROR/i],
    })
  }
} finally {
  await releaseProductionUpdateLock(updateLock)
}
