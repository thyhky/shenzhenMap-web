import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireProductionUpdateLock, releaseProductionUpdateLock } from './production-update-lock.mjs'
import { runWrangler } from './run-wrangler.mjs'
import { requireUpdateProfile } from './update-profile.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const viteBin = resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const tscBin = resolve(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')
const vueTscBin = resolve(projectRoot, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')
const uniRoot = resolve(projectRoot, 'uniapp')
const uniBin = resolve(uniRoot, 'node_modules', '@dcloudio', 'vite-plugin-uni', 'bin', 'uni.js')
const uniVueTscBin = resolve(uniRoot, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')
const defaultUrl = 'https://map.okzer.xyz'
const productionConfig = 'wrangler.uni-production.jsonc'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => {
  const entry = args.find((argument) => argument.startsWith(name + '='))
  return entry ? entry.slice(name.length + 1) : undefined
}
const uniClient = flag('--uni-client')
const legacyClient = flag('--legacy-client')
const profileArgument = valueOf('--profile')
let profile = requireUpdateProfile(profileArgument === undefined ? 'all' : profileArgument)
if (uniClient && legacyClient) throw new Error('Choose only one client deployment flag')
const deployClient = uniClient ? 'uni' : legacyClient ? 'legacy' : null

if (flag('--help') || flag('-h')) {
  console.log(`Usage: node scripts/pipeline.mjs [options]

One-shot pipeline: sync data -> generate SQL parts -> migrate remote D1
-> apply parts -> optionally build/deploy a selected client -> verify.

  --sync-from=DIR   source webmap dir for sync-data (default: sibling fetch_house_prices/webmap)
  --profile=PROFILE update all data, schools only, or estate prices only
                    (all, schools, estate-prices; default: all)
  --skip-sync       use the existing ./data snapshot without re-syncing
  --start=N         resume applying update parts from part N (reuses the
                    existing generated parts and skips data synchronization,
                    so the import timestamp stays consistent)
  --skip-backup     do not export the remote D1 backup
  --skip-migrate    do not apply pending D1 migrations
  --skip-deploy     do not build/deploy the worker
  --skip-verify     do not run the production verification
  --uni-client      build and deploy the uni-app H5 client instead of legacy Web
  --legacy-client   build and deploy the legacy Web client
  --url=...         verification base URL (default ${defaultUrl})
  --help            show this help`)
  process.exit(0)
}

const knownFlags = new Set([
  '--help', '-h', '--skip-sync', '--skip-migrate', '--skip-deploy', '--skip-verify', '--skip-backup', '--uni-client', '--legacy-client',
])
const valueFlags = ['--sync-from', '--start', '--url', '--profile']
const unknown = args.filter((argument) => (
  !knownFlags.has(argument)
  && !valueFlags.some((name) => argument.startsWith(`${name}=`))
))
if (unknown.length) {
  throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
}

const start = valueOf('--start')
let runId = randomUUID()
if (start !== undefined && !(/^[1-9]\d*$/.test(start))) {
  throw new Error(`Invalid --start value: ${start}`)
}
if (start !== undefined && valueOf('--sync-from') !== undefined) {
  throw new Error('--start cannot be combined with --sync-from because resume must reuse the existing snapshot')
}
if (start !== undefined) {
  const partsRoot = resolve(projectRoot, 'seed', 'update-parts')
  const manifestPath = resolve(partsRoot, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const manifestProfile = requireUpdateProfile(manifest.profile)
  if (typeof manifest.runId !== 'string') throw new Error('Generated update manifest has no run ID')
  if (profileArgument && profile !== manifestProfile) {
    throw new Error(`--profile=${profile} does not match generated update profile ${manifestProfile}`)
  }
  profile = manifestProfile
  runId = manifest.runId
  if (!Array.isArray(manifest.parts) || Number(start) > manifest.parts.length) {
    throw new Error(`--start=${start} exceeds the generated update part count (${manifest.parts?.length ?? 0})`)
  }
  for (const name of manifest.parts.slice(Number(start) - 1)) {
    const partPath = typeof name === 'string' ? resolve(partsRoot, name) : ''
    if (!partPath || dirname(partPath) !== partsRoot) throw new Error(`Invalid update part in manifest: ${name}`)
    await access(partPath)
  }
}
if (profile !== 'all' && deployClient) {
  throw new Error(`Client deployment is not allowed for the ${profile} data profile`)
}
process.env.EXPECTED_UPDATE_RUN_ID = runId
process.env.EXPECTED_UPDATE_PROFILE = profile
const verifyUrl = valueOf('--url') ?? defaultUrl
let parsedVerifyUrl
try {
  parsedVerifyUrl = new URL(verifyUrl)
} catch {
  throw new Error(`Invalid --url value: ${verifyUrl}`)
}
if (!['http:', 'https:'].includes(parsedVerifyUrl.protocol)) {
  throw new Error(`Invalid --url protocol: ${parsedVerifyUrl.protocol}`)
}

const steps = []
steps.push({
  desc: 'Run data and Worker tests',
  cmd: process.execPath,
  args: [
    '--test',
    resolve(projectRoot, 'tests', 'data-import.test.mjs'),
    resolve(projectRoot, 'tests', 'worker.test.mjs'),
  ],
  cwd: projectRoot,
})
if (!flag('--skip-deploy') && deployClient) {
  steps.push({
    desc: deployClient === 'uni' ? 'Typecheck uni-app client' : 'Typecheck legacy Web client',
    cmd: process.execPath,
    args: deployClient === 'uni' ? [uniVueTscBin, '--noEmit'] : [vueTscBin, '-p', 'tsconfig.app.json', '--noEmit'],
    cwd: deployClient === 'uni' ? uniRoot : projectRoot,
  })
  steps.push({
    desc: 'Typecheck Worker',
    cmd: process.execPath,
    args: [tscBin, '-p', 'tsconfig.worker.json', '--noEmit'],
    cwd: projectRoot,
  })
  steps.push({
    desc: deployClient === 'uni' ? 'Build uni-app H5 assets' : 'Build legacy Web assets',
    cmd: process.execPath,
    args: deployClient === 'uni' ? [uniBin, 'build'] : [viteBin, 'build'],
    cwd: deployClient === 'uni' ? uniRoot : projectRoot,
  })
}
if (start === undefined && !flag('--skip-sync')) {
  steps.push({
    desc: 'Sync GeoJSON snapshot from data workshop',
    cmd: process.execPath,
    args: [
      resolve(projectRoot, 'scripts', 'sync-data.mjs'),
      ...(valueOf('--sync-from') !== undefined ? [`--from=${valueOf('--sync-from')}`] : []),
      `--profile=${profile}`,
    ],
    cwd: projectRoot,
  })
}
if (start === undefined) {
  steps.push({
    desc: 'Reject stale or truncated source snapshots',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'validate-source-snapshot.mjs'), verifyUrl, `--profile=${profile}`],
    cwd: projectRoot,
  })
  steps.push({
    desc: 'Generate SQL update parts from data snapshot',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'generate-update.mjs'), `--profile=${profile}`, `--run-id=${runId}`],
    cwd: projectRoot,
  })
}
steps.push({
  desc: 'Apply generated SQL to an isolated local database',
  cmd: process.execPath,
  args: [
    resolve(projectRoot, 'scripts', 'validate-generated-update.mjs'),
    ...(start !== undefined ? ['--skip-count-check'] : []),
  ],
  cwd: projectRoot,
})
if (flag('--skip-migrate')) {
  steps.push({
    desc: 'Confirm production has no pending migrations',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'check-production-migrations.mjs')],
    cwd: projectRoot,
  })
}
if (!flag('--skip-backup')) {
  steps.push({
    desc: 'Export remote D1 backup (keep newest 14)',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'backup-d1.mjs')],
    cwd: projectRoot,
  })
}
if (!flag('--skip-migrate')) {
  steps.push({
    desc: 'Apply pending D1 migrations (remote)',
    cmd: wrangler,
    args: ['d1', 'migrations', 'apply', 'DB', '--remote', '--config', productionConfig],
    cwd: projectRoot,
    donePatterns: [/Successfully created \d+ migration/, /Executed \d+ commands/, /No migrations to apply!/, /already applied/],
    failPatterns: [/^X /, /fetch failed/i, /ERROR/i],
  })
}
steps.push({
  desc: 'Apply update parts to remote D1',
  cmd: process.execPath,
  args: [
    resolve(projectRoot, 'scripts', 'execute-update-parts.mjs'),
    ...(start !== undefined ? [`--start=${start}`] : []),
  ],
  cwd: projectRoot,
})
if (profile !== 'schools') {
  steps.push({
    desc: 'Prune price history to 90 days',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'prune-price-history.mjs')],
    cwd: projectRoot,
  })
}
if (!flag('--skip-deploy') && deployClient) {
  steps.push({
    desc: 'Deploy worker',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'deploy-client.mjs'), deployClient === 'uni' ? 'production' : 'legacy'],
    cwd: projectRoot,
  })
}
if (!flag('--skip-verify')) {
  steps.push({
    desc: profile === 'all' ? 'Verify production deployment' : `Verify production ${profile} data`,
    cmd: process.execPath,
    args: [
      resolve(projectRoot, 'scripts', profile === 'all' ? 'verify-deployment.mjs' : 'verify-data-update.mjs'),
      verifyUrl,
    ],
    cwd: projectRoot,
  })
}

const startedAt = Date.now()
const updateLock = await acquireProductionUpdateLock(
  projectRoot,
  'pipeline',
  process.env.PRODUCTION_UPDATE_LOCK_TOKEN,
)
try {
  for (const [index, step] of steps.entries()) {
    const label = `[${index + 1}/${steps.length}] ${step.desc}`
    console.log(`\n===== ${label} =====`)
    if (step.donePatterns) {
      await runWrangler(step.cmd, step.args, {
        cwd: step.cwd,
        donePatterns: step.donePatterns,
        failPatterns: step.failPatterns,
      })
    } else {
      execFileSync(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit' })
    }
  }
  console.log(`\nPipeline finished: ${steps.length} steps in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
} catch (error) {
  console.error(`\n[FAIL] Pipeline exited with ${error.status ?? error.code ?? error.message}`)
  process.exitCode = 1
} finally {
  await releaseProductionUpdateLock(updateLock)
}
