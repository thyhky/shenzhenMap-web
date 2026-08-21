import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSourceData } from './data-sql.mjs'
import { requireUpdateProfile } from './update-profile.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const partsRoot = resolve(projectRoot, 'seed', 'update-parts')
const manifest = JSON.parse(await readFile(resolve(partsRoot, 'manifest.json'), 'utf8'))
if (!Array.isArray(manifest.parts) || !manifest.parts.length) throw new Error('Generated update manifest has no parts')
if (!manifest.partHashes || typeof manifest.partHashes !== 'object') throw new Error('Generated update manifest has no part hashes')
if (typeof manifest.runId !== 'string') throw new Error('Generated update manifest has no run ID')
const profile = requireUpdateProfile(manifest.profile)
if (process.env.EXPECTED_UPDATE_RUN_ID && manifest.runId !== process.env.EXPECTED_UPDATE_RUN_ID) {
  throw new Error('Generated update manifest was replaced by another run')
}
if (process.env.EXPECTED_UPDATE_PROFILE && profile !== process.env.EXPECTED_UPDATE_PROFILE) {
  throw new Error(`Generated update profile changed from ${process.env.EXPECTED_UPDATE_PROFILE} to ${profile}`)
}
if (typeof manifest.dataVersion !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.dataVersion)) {
  throw new Error('Generated update manifest has no valid data version')
}
const allowedTables = new Set(profile === 'schools'
  ? ['schools', 'school_zones', 'data_scopes', 'app_metadata']
  : profile === 'estate-prices'
    ? ['estates', 'streets', 'data_scopes', 'app_metadata']
    : ['estates', 'streets', 'schools', 'school_zones', 'data_scopes', 'app_metadata'])

const database = new DatabaseSync(':memory:')
try {
  database.exec('PRAGMA foreign_keys = ON;')
  const migrations = (await readdir(resolve(projectRoot, 'migrations')))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()
  for (const migration of migrations) {
    database.exec(await readFile(resolve(projectRoot, 'migrations', migration), 'utf8'))
  }

  for (const name of manifest.parts) {
    if (typeof name !== 'string' || dirname(resolve(partsRoot, name)) !== partsRoot) {
      throw new Error(`Invalid update part in manifest: ${name}`)
    }
    const content = await readFile(resolve(partsRoot, name))
    const expectedHash = manifest.partHashes[name]
    const actualHash = createHash('sha256').update(content).digest('hex')
    if (typeof expectedHash !== 'string' || actualHash !== expectedHash) {
      throw new Error(`Generated update part hash mismatch: ${name}`)
    }
    const sql = content.toString('utf8')
    if (/\bDELETE\s+FROM\b/i.test(sql)) throw new Error(`Destructive DELETE found in generated update part: ${name}`)
    for (const match of sql.matchAll(/(?:^|;)\s*(?:INSERT\s+INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gim)) {
      if (!allowedTables.has(match[1].toLowerCase())) {
        throw new Error(`Profile ${profile} cannot write table ${match[1]} in ${name}`)
      }
    }
    try {
      database.exec(sql)
    } catch (error) {
      throw new Error(`Local SQL preflight failed in ${name}: ${error.message}`)
    }
  }

  if (!process.argv.includes('--skip-count-check')) {
    const { estates, streets, schools, schoolZones } = await loadSourceData(resolve(projectRoot, 'data'), profile)
    const sourceCounts = {
      ...(estates ? { estates: estates.features.length, streets: streets.features.length } : {}),
      ...(schools ? { schools: schools.features.length, school_zones: schoolZones.features.length } : {}),
    }
    for (const [table, count] of Object.entries(sourceCounts)) {
      if (manifest.expectedCounts?.[table] !== count) {
        throw new Error(`Generated update manifest count mismatch for ${table}: ${manifest.expectedCounts?.[table]}, expected ${count}`)
      }
      const actual = database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${table === 'estates' ? 'is_listed' : 'is_current'} = 1`).get().count
      if (actual !== count) throw new Error(`Local SQL preflight count mismatch for ${table}: ${actual}, expected ${count}`)
    }
  }
  console.log(`Generated update SQL preflight passed: ${manifest.parts.length} parts (${profile})`)
} finally {
  database.close()
}
