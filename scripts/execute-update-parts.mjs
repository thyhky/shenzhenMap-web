import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { joinProductionUpdateLock, releaseProductionUpdateLock } from './production-update-lock.mjs'
import { runWrangler } from './run-wrangler.mjs'
import { requireUpdateProfile } from './update-profile.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const partsRoot = resolve(projectRoot, 'seed', 'update-parts')
const productionConfig = 'wrangler.uni-production.jsonc'
const manifest = JSON.parse(await readFile(resolve(partsRoot, 'manifest.json'), 'utf8'))
if (typeof manifest.runId !== 'string') throw new Error('Update manifest has no run ID')
const profile = requireUpdateProfile(manifest.profile)
if (process.env.EXPECTED_UPDATE_RUN_ID && manifest.runId !== process.env.EXPECTED_UPDATE_RUN_ID) {
  throw new Error('Update manifest was replaced by another run')
}
if (process.env.EXPECTED_UPDATE_PROFILE && profile !== process.env.EXPECTED_UPDATE_PROFILE) {
  throw new Error(`Update profile changed from ${process.env.EXPECTED_UPDATE_PROFILE} to ${profile}`)
}
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/execute-update-parts.mjs [--start=N]

Applies the generated update parts (seed/update-parts/manifest.json) to the
remote D1 database. Idempotent: safe to re-run; parts are SQL upserts.

  --start=N   resume from part N (1-based)`)
  process.exit(0)
}
const startArgument = args.find((argument) => argument.startsWith('--start='))
const unknown = args.filter((argument) => !argument.startsWith('--start='))
if (unknown.length) {
  throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
}
const start = startArgument ? Number(startArgument.split('=')[1]) : 1
if (!Number.isSafeInteger(start) || start < 1 || start > manifest.parts.length) {
  throw new Error(`Invalid --start value: ${startArgument ?? ''}`)
}
if (!manifest.partHashes || typeof manifest.partHashes !== 'object') {
  throw new Error('Update manifest has no part hashes; regenerate the update before execution')
}
async function verifyPart(name) {
  const expectedHash = manifest.partHashes[name]
  if (typeof expectedHash !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error(`Invalid update part hash in manifest: ${name}`)
  }
  const content = await readFile(resolve(partsRoot, name))
  const actualHash = createHash('sha256').update(content).digest('hex')
  if (actualHash !== expectedHash) {
    throw new Error(`Update part changed after generation: ${name}`)
  }
  return content
}
for (const name of manifest.parts.slice(start - 1)) {
  const partPath = typeof name === 'string' ? resolve(partsRoot, name) : ''
  if (!partPath || dirname(partPath) !== partsRoot) throw new Error(`Invalid update part in manifest: ${name}`)
  await access(partPath)
  await verifyPart(name)
}

const updateLock = await joinProductionUpdateLock(
  projectRoot,
  'remote update parts',
  process.env.PRODUCTION_UPDATE_LOCK_TOKEN,
)
let executionRoot
try {
  executionRoot = await mkdtemp(resolve(tmpdir(), 'shenzhen-map-d1-update-'))
  for (const [index, name] of manifest.parts.entries()) {
    if (index + 1 < start) continue
    console.log(`Applying update part ${index + 1}/${manifest.parts.length}: ${name}`)
    const executionPath = resolve(executionRoot, name)
    await writeFile(executionPath, await verifyPart(name), { flag: 'wx' })
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await runWrangler(wrangler, ['d1', 'execute', 'DB', '--remote', '--file', executionPath, '--config', productionConfig], {
          cwd: projectRoot,
          donePatterns: [/"success": true/, /executed successfully/i],
          failPatterns: [/^X /, /"success": false/, /fetch failed/i, /ERROR/i],
        })
        break
      } catch (error) {
        if (error.message?.startsWith('Update part changed after generation:')) throw error
        if (attempt === 3) {
          throw new Error(`Update stopped at part ${index + 1}; resume with npm run pipeline -- --profile=${profile} --start=${index + 1} --skip-migrate --skip-deploy: ${error.message}`)
        }
        const delay = 2000 * attempt
        console.warn(`Part ${index + 1} attempt ${attempt} failed; retrying in ${delay / 1000}s`)
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delay))
      }
    }
  }
} finally {
  if (executionRoot) await rm(executionRoot, { recursive: true, force: true })
  await releaseProductionUpdateLock(updateLock)
}
