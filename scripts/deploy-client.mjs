import { access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWrangler } from './run-wrangler.mjs'

const mode = process.argv[2]
const configs = {
  legacy: { config: 'wrangler.jsonc', index: 'dist/index.html' },
  preview: { config: 'wrangler.uni-preview.jsonc', index: 'uniapp/dist/build/h5/index.html' },
  production: { config: 'wrangler.uni-production.jsonc', index: 'uniapp/dist/build/h5/index.html' },
}

if (mode === 'rollback') {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  await runWrangler(wrangler, [
    'rollback', '--config', 'wrangler.uni-production.jsonc', '--yes', '--message', 'Automated client rollback',
  ], {
    cwd: projectRoot,
    donePatterns: [/Successfully rolled back/, /Rollback complete/, /has been deployed to 100% of traffic/],
    failPatterns: [/ERROR/i, /Rollback failed/i],
  })
  process.exit(0)
}

if (!configs[mode]) throw new Error('Usage: node scripts/deploy-client.mjs <legacy|preview|production|rollback>')

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const target = configs[mode]
await access(resolve(projectRoot, target.index))
await runWrangler(wrangler, ['deploy', '--dry-run', '--config', target.config], {
  cwd: projectRoot,
  donePatterns: [/--dry-run: exiting now/],
  failPatterns: [/ERROR/i],
})
await runWrangler(wrangler, ['deploy', '--config', target.config], {
  cwd: projectRoot,
  donePatterns: [/Deployment complete/, /No deployable assets/, /Current Version ID:/],
  failPatterns: [/ERROR/i, /Deployment failed/i],
})

if (mode !== 'preview') {
  try {
    console.error('Syncing local data snapshot before verification...')
    execFileSync(process.execPath, [resolve(projectRoot, 'scripts', 'sync-data.mjs')], {
      cwd: projectRoot,
      stdio: 'inherit',
    })
  } catch {
    console.error('Local data sync skipped (best-effort); continuing with verification')
  }
  try {
    execFileSync(process.execPath, [resolve(projectRoot, 'scripts', 'verify-deployment.mjs')], {
      cwd: projectRoot,
      stdio: 'inherit',
    })
  } catch (error) {
    console.error('Production verification failed; rolling back the Worker deployment')
    await runWrangler(wrangler, [
      'rollback', '--config', target.config, '--yes', '--message', 'Automatic rollback after failed verification',
    ], {
      cwd: projectRoot,
      donePatterns: [/Successfully rolled back/, /Rollback complete/, /has been deployed to 100% of traffic/],
      failPatterns: [/ERROR/i, /Rollback failed/i],
    })
    throw error
  }
}
