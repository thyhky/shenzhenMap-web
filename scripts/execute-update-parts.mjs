import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const partsRoot = resolve(projectRoot, 'seed', 'update-parts')
const manifest = JSON.parse(await readFile(resolve(partsRoot, 'manifest.json'), 'utf8'))
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

for (const [index, name] of manifest.parts.entries()) {
  if (index + 1 < start) continue
  console.log(`Applying update part ${index + 1}/${manifest.parts.length}: ${name}`)
  execFileSync(process.execPath, [
    wrangler, 'd1', 'execute', 'DB', '--remote', '--file', resolve(partsRoot, name),
  ], { cwd: projectRoot, stdio: 'inherit' })
}
