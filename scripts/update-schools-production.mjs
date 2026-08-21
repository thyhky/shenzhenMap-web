import { execFileSync } from 'node:child_process'
import { access, appendFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireProductionUpdateLock, releaseProductionUpdateLock } from './production-update-lock.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => {
  const entry = args.find((argument) => argument.startsWith(`${name}=`))
  return entry ? entry.slice(name.length + 1) : undefined
}

if (flag('--help') || flag('-h')) {
  console.log(`Usage: npm run update:schools -- --yes [options]

One-time production school update: rebuild prepared school snapshots -> validate
-> back up and update production D1. It does not collect official source data or deploy clients.

  --yes                           confirm the production D1 update
  --dry-run                       check paths and print the plan without running commands
  --allow-school-id-replacements  allow reviewed school ID replacement
  --allow-school-content-changes  allow reviewed same-date school content changes
  --allow-school-geometry-warnings allow reviewed new or changed geometry warnings
  --workshop=DIR                  data workshop root (default: sibling fetch_house_prices)
  --python=CMD                    Python command (default: PYTHON or python3)`)
  process.exit(0)
}

const knownFlags = new Set([
  '--yes', '--dry-run', '--allow-school-id-replacements', '--allow-school-content-changes', '--allow-school-geometry-warnings', '--help', '-h',
])
const unknown = args.filter((argument) => (
  !knownFlags.has(argument)
  && !argument.startsWith('--workshop=')
  && !argument.startsWith('--python=')
))
if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
if (!flag('--yes') && !flag('--dry-run')) {
  throw new Error('Production update not confirmed. Re-run with --yes after reviewing the school sources.')
}

const workshopRoot = resolve(valueOf('--workshop') ?? process.env.DATA_WORKSHOP_ROOT ?? resolve(projectRoot, '..', 'fetch_house_prices'))
const webmapRoot = resolve(workshopRoot, 'webmap')
const python = valueOf('--python') ?? process.env.PYTHON ?? 'python3'
const pipeline = resolve(projectRoot, 'scripts', 'pipeline.mjs')
const logRoot = resolve(projectRoot, 'logs')
const logPath = resolve(logRoot, 'school-data-update.log')
await Promise.all([
  access(resolve(workshopRoot, 'build_web_map_data.py')),
  access(pipeline),
])
await mkdir(logRoot, { recursive: true })

if (flag('--dry-run')) {
  console.log(JSON.stringify({
    profile: 'schools',
    workshopRoot,
    webmapRoot,
    python,
    rebuildsPreparedSnapshots: true,
    collectsOfficialSources: false,
    uploadsToCloudflareD1: true,
    deploysClient: false,
  }, null, 2))
  process.exit(0)
}

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  await appendFile(logPath, `${line}\n`, 'utf8')
}

function run(name, command, commandArgs, cwd, env = process.env, timeoutMs = 10_800_000) {
  return log(`START ${name}: ${command} ${commandArgs.join(' ')}`).then(() => {
    execFileSync(command, commandArgs, {
      cwd,
      env,
      stdio: 'inherit',
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
    })
    return log(`OK ${name}`)
  })
}

let updateLock
try {
  updateLock = await acquireProductionUpdateLock(projectRoot, 'one-time school data update')
  const startedAt = Date.now()
  await log('===== one-time production school data update begin =====')
  await run('production migration preflight', process.execPath, [
    resolve(projectRoot, 'scripts', 'check-production-migrations.mjs'),
  ], projectRoot)
  await run('rebuild prepared school snapshots', python, ['build_web_map_data.py'], workshopRoot)
  await run('protected school D1 pipeline', process.execPath, [
    pipeline,
    '--profile=schools',
    `--sync-from=${webmapRoot}`,
    '--skip-migrate',
    '--skip-deploy',
  ], projectRoot, {
    ...process.env,
    PRODUCTION_UPDATE_LOCK_TOKEN: updateLock.token,
    ALLOW_SCHOOL_ID_REPLACEMENTS: flag('--allow-school-id-replacements') ? '1' : '0',
    ALLOW_SCHOOL_CONTENT_CHANGES: flag('--allow-school-content-changes') ? '1' : '0',
    ALLOW_SCHOOL_GEOMETRY_WARNINGS: flag('--allow-school-geometry-warnings') ? '1' : '0',
  }, 0)
  await log(`===== one-time production school data update done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s =====`)
} catch (error) {
  await log(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await releaseProductionUpdateLock(updateLock)
}
