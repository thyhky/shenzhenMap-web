import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { acquireProductionUpdateLock, releaseProductionUpdateLock } from '../scripts/production-update-lock.mjs'

test('production update lock blocks concurrent owners and supports child reuse', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'shenzhen-map-lock-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const owner = await acquireProductionUpdateLock(root, 'test owner')
  const child = await acquireProductionUpdateLock(root, 'test child', owner.token)
  assert.equal(child.owned, true)
  await assert.rejects(acquireProductionUpdateLock(root, 'competitor'), /already running/)
  await releaseProductionUpdateLock(child)
  await assert.rejects(readFile(owner.path), /ENOENT/)
  await releaseProductionUpdateLock(owner)
})

test('production update lock replaces a dead process lock', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'shenzhen-map-stale-lock-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, '.production-data-update.lock')
  await writeFile(path, `${JSON.stringify({ pid: 2147483647, token: 'stale', label: 'stale test' })}\n`)
  const owner = await acquireProductionUpdateLock(root, 'replacement')
  assert.notEqual(owner.token, 'stale')
  await releaseProductionUpdateLock(owner)
})
