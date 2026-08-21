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
  console.log(`Usage: npm run update:weekly -- --yes [options]

One-click production data update: collect estates -> rebuild the merged estate/school snapshots
-> validate -> back up and update production D1. It does not deploy any client.

  --yes                           confirm the production D1 update
  --dry-run                       check paths and print the plan without running commands
  --full                          run the full estate list audit instead of routine map refresh
  --with-rent                     refresh rent samples before rebuilding snapshots
  --allow-school-id-replacements  allow reviewed school ID replacement during validation
  --allow-school-content-changes  allow reviewed school changes with the same publication date
  --allow-school-geometry-warnings allow reviewed new or changed geometry warnings
  --workshop=DIR                  data workshop root (default: sibling fetch_house_prices)
  --python=CMD                    Python command (default: PYTHON or python3)
  --help                          show this help`)
  process.exit(0)
}

const knownFlags = new Set([
  '--yes', '--dry-run', '--full', '--with-rent', '--allow-school-id-replacements', '--allow-school-content-changes', '--allow-school-geometry-warnings', '--help', '-h',
])
const unknown = args.filter((argument) => (
  !knownFlags.has(argument)
  && !argument.startsWith('--workshop=')
  && !argument.startsWith('--python=')
))
if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
if (!flag('--yes') && !flag('--dry-run')) {
  console.error('Production update not confirmed. Re-run with --yes after reviewing the source snapshots.')
  process.exit(1)
}
const workshopRoot = resolve(valueOf('--workshop') ?? process.env.DATA_WORKSHOP_ROOT ?? resolve(projectRoot, '..', 'fetch_house_prices'))
const webmapRoot = resolve(workshopRoot, 'webmap')
const python = valueOf('--python') ?? process.env.PYTHON ?? 'python3'
const logRoot = resolve(projectRoot, 'logs')
const estatePricesOnly = resolve(process.argv[1]) === resolve(projectRoot, 'scripts', 'update-estate-prices-production.mjs')
const logPath = resolve(logRoot, estatePricesOnly ? 'estate-price-update.log' : 'weekly-data-update.log')
const pipeline = resolve(projectRoot, 'scripts', 'pipeline.mjs')

const required = [
  resolve(workshopRoot, 'build_web_map_data.py'),
  resolve(workshopRoot, 'update_xq_index_leyoujia.py'),
  resolve(workshopRoot, 'fix_xq_spatial.py'),
  resolve(workshopRoot, 'match_official_reference_prices.py'),
  pipeline,
]
if (flag('--with-rent')) required.push(resolve(workshopRoot, 'fetch_rent_leyoujia.py'))
await Promise.all(required.map((path) => access(path)))
await mkdir(logRoot, { recursive: true })

if (flag('--dry-run')) {
  console.log(JSON.stringify({
    mode: flag('--full') ? 'full' : 'routine',
    profile: estatePricesOnly ? 'estate-prices' : 'all',
    workshopRoot,
    webmapRoot,
    python,
    refreshRent: flag('--with-rent'),
    allowSchoolIdReplacements: flag('--allow-school-id-replacements'),
    allowSchoolContentChanges: flag('--allow-school-content-changes'),
    allowSchoolGeometryWarnings: flag('--allow-school-geometry-warnings'),
    productionPipeline: pipeline,
    deploysClient: false,
  }, null, 2))
  process.exit(0)
}

let updateLock
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

try {
  updateLock = await acquireProductionUpdateLock(projectRoot, 'weekly data update')

  const startedAt = Date.now()
  await log('===== weekly production data update begin =====')
  await run(
    'production migration preflight',
    process.execPath,
    [resolve(projectRoot, 'scripts', 'check-production-migrations.mjs')],
    projectRoot,
  )
  await run(
    flag('--full') ? 'full estate collection' : 'routine estate collection',
    python,
    flag('--full') ? ['update_xq_index_leyoujia.py'] : ['update_xq_index_leyoujia.py', '--daily'],
    workshopRoot,
  )
  await run('spatial assignment', python, ['fix_xq_spatial.py'], workshopRoot)
  await run('official reference price matching', python, ['match_official_reference_prices.py'], workshopRoot)
  if (flag('--with-rent')) await run('rent sample collection', python, ['fetch_rent_leyoujia.py'], workshopRoot)

  await run('merged estate and school snapshot build', python, ['build_web_map_data.py'], workshopRoot)
  const pipelineEnv = {
    ...process.env,
    PRODUCTION_UPDATE_LOCK_TOKEN: updateLock.token,
    ALLOW_SCHOOL_ID_REPLACEMENTS: flag('--allow-school-id-replacements') ? '1' : '0',
    ALLOW_SCHOOL_CONTENT_CHANGES: flag('--allow-school-content-changes') ? '1' : '0',
    ALLOW_SCHOOL_GEOMETRY_WARNINGS: flag('--allow-school-geometry-warnings') ? '1' : '0',
  }
  await run(
    'protected production D1 pipeline',
    process.execPath,
    [pipeline, ...(estatePricesOnly ? ['--profile=estate-prices'] : []), `--sync-from=${webmapRoot}`, '--skip-migrate', '--skip-deploy'],
    projectRoot,
    pipelineEnv,
    0,
  )
  await log(`===== weekly production data update done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s =====`)
} catch (error) {
  await log(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await releaseProductionUpdateLock(updateLock)
}
