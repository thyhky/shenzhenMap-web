import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWrangler } from './run-wrangler.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const viteBin = resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const tscBin = resolve(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')
const vueTscBin = resolve(projectRoot, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')
const uniRoot = resolve(projectRoot, 'uniapp')
const uniBin = resolve(uniRoot, 'node_modules', '@dcloudio', 'vite-plugin-uni', 'bin', 'uni.js')
const uniVueTscBin = resolve(uniRoot, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')
const defaultUrl = 'https://map.okzer.xyz'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => {
  const entry = args.find((argument) => argument.startsWith(name + '='))
  return entry ? entry.slice(name.length + 1) : undefined
}
const uniClient = flag('--uni-client')
const legacyClient = flag('--legacy-client')
if (uniClient && legacyClient) throw new Error('Choose only one client deployment flag')
const deployClient = uniClient ? 'uni' : legacyClient ? 'legacy' : null

if (flag('--help') || flag('-h')) {
  console.log(`Usage: node scripts/pipeline.mjs [options]

One-shot pipeline: sync data -> generate SQL parts -> migrate remote D1
-> apply parts -> optionally build/deploy a selected client -> verify.

  --sync-from=DIR   source webmap dir for sync-data (default: C:\\code\\Codex\\fetch_house_prices\\webmap)
  --skip-sync       use the existing ./data snapshot without re-syncing
  --start=N         resume applying update parts from part N (reuses the
                    existing generated parts, so the import timestamp stays
                    consistent; parts are NOT regenerated)
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
const unknown = args.filter((argument) => {
  const name = argument.includes('=') ? argument.slice(0, argument.indexOf('=')) : argument
  return !knownFlags.has(name) && name !== '--sync-from' && name !== '--start' && name !== '--url'
})
if (unknown.length) {
  throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
}

const start = valueOf('--start')
if (start !== undefined && !(/^[1-9]\d*$/.test(start))) {
  throw new Error(`Invalid --start value: ${start}`)
}
const verifyUrl = valueOf('--url') ?? defaultUrl

const steps = []
if (!flag('--skip-sync')) {
  steps.push({
    desc: 'Sync GeoJSON snapshot from data workshop',
    cmd: process.execPath,
    args: [
      resolve(projectRoot, 'scripts', 'sync-data.mjs'),
      ...(valueOf('--sync-from') !== undefined ? [`--from=${valueOf('--sync-from')}`] : []),
    ],
    cwd: projectRoot,
  })
}
if (start === undefined) {
  steps.push({
    desc: 'Generate SQL update parts from data snapshot',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'generate-update.mjs')],
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
    args: ['d1', 'migrations', 'apply', 'DB', '--remote'],
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
steps.push({
  desc: 'Prune price history to 90 days',
  cmd: process.execPath,
  args: [resolve(projectRoot, 'scripts', 'prune-price-history.mjs')],
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
    desc: 'Typecheck (worker tsc)',
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
  steps.push({
    desc: 'Deploy worker',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'deploy-client.mjs'), deployClient === 'uni' ? 'production' : 'legacy'],
    cwd: projectRoot,
  })
}
if (!flag('--skip-verify')) {
  steps.push({
    desc: 'Verify production deployment',
    cmd: process.execPath,
    args: [resolve(projectRoot, 'scripts', 'verify-deployment.mjs'), verifyUrl],
    cwd: projectRoot,
  })
}

const startedAt = Date.now()
for (const [index, step] of steps.entries()) {
  const label = `[${index + 1}/${steps.length}] ${step.desc}`
  console.log(`\n===== ${label} =====`)
  try {
    if (step.donePatterns) {
      await runWrangler(step.cmd, step.args, { cwd: step.cwd, donePatterns: step.donePatterns })
    } else {
      execFileSync(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit' })
    }
  } catch (error) {
    console.error(`\n[FAIL] ${label} exited with ${error.status ?? error.code}`)
    process.exit(1)
  }
}
console.log(`\nPipeline finished: ${steps.length} steps in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
