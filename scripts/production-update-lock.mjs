import { randomUUID } from 'node:crypto'
import { open, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function readLock(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw new Error(`Cannot read production update lock ${path}: ${error.message}`)
  }
}

export async function acquireProductionUpdateLock(projectRoot, label, inheritedToken = '') {
  const path = resolve(projectRoot, '.production-data-update.lock')
  if (inheritedToken) {
    const current = await readLock(path)
    if (!current || current.token !== inheritedToken || !processIsAlive(Number(current.pid))) {
      throw new Error('The inherited production update lock is missing, stale, or owned by another process')
    }
    await writeFile(path, `${JSON.stringify({
      ...current,
      pid: process.pid,
      label,
      inheritedFrom: current.pid,
      inheritedAt: new Date().toISOString(),
    }, null, 2)}\n`)
    return { path, token: inheritedToken, owned: true, label }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID()
    let handle
    try {
      handle = await open(path, 'wx')
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, token, label, createdAt: new Date().toISOString() }, null, 2)}\n`)
      await handle.close()
      return { path, token, owned: true, label }
    } catch (error) {
      await handle?.close()
      if (error?.code !== 'EEXIST') throw error
      const current = await readLock(path)
      if (!current) continue
      if (processIsAlive(Number(current.pid))) {
        throw new Error(`Production update already running (${current.label ?? 'unknown'}, pid ${current.pid})`)
      }
      await rm(path, { force: true })
    }
  }
  throw new Error(`Could not acquire production update lock: ${path}`)
}

export async function releaseProductionUpdateLock(lock) {
  if (!lock?.owned) return
  const current = await readLock(lock.path)
  if (current?.token === lock.token && Number(current.pid) === process.pid) await rm(lock.path, { force: true })
}

export async function joinProductionUpdateLock(projectRoot, label, token = '') {
  const path = resolve(projectRoot, '.production-data-update.lock')
  if (!token) return acquireProductionUpdateLock(projectRoot, label)
  const current = await readLock(path)
  if (!current || current.token !== token || !processIsAlive(Number(current.pid))) {
    throw new Error(`Production update lock is unavailable for ${label}`)
  }
  return { path, token, owned: false, label }
}
