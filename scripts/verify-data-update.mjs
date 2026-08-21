import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSourceData } from './data-sql.mjs'
import { validateSchoolSnapshot } from './school-data-validation.mjs'
import { requireUpdateProfile } from './update-profile.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.argv[2] || 'https://map.okzer.xyz'
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY) && !process.execArgv.includes('--use-env-proxy')) {
  execFileSync(process.execPath, ['--use-env-proxy', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  process.exit(0)
}

const manifest = JSON.parse(await readFile(resolve(projectRoot, 'seed', 'update-parts', 'manifest.json'), 'utf8'))
const profile = requireUpdateProfile(manifest.profile)
if (process.env.EXPECTED_UPDATE_RUN_ID && manifest.runId !== process.env.EXPECTED_UPDATE_RUN_ID) {
  throw new Error('Update manifest was replaced before remote verification')
}
if (process.env.EXPECTED_UPDATE_PROFILE && profile !== process.env.EXPECTED_UPDATE_PROFILE) {
  throw new Error(`Update profile changed from ${process.env.EXPECTED_UPDATE_PROFILE} to ${profile}`)
}
if (profile === 'all') throw new Error('Scoped data verifier requires schools or estate-prices profile')
const source = await loadSourceData(resolve(projectRoot, 'data'), profile)

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  return response
}

async function api(path) {
  return (await request(path)).json()
}

let metaResponse
let meta
for (let attempt = 1; attempt <= 10; attempt += 1) {
  metaResponse = await request('/api/meta')
  meta = await metaResponse.json()
  if (meta.catalog?.dataVersion === manifest.dataVersion
    && metaResponse.headers.get('X-Data-Version') === manifest.dataVersion) break
  if (attempt === 10) {
    throw new Error(`Production data version did not switch to ${manifest.dataVersion}`)
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
}

for (const [id, expected] of Object.entries(manifest.expectedScopes ?? {})) {
  const actual = meta.catalog?.scopes?.find((scope) => scope.id === id)
  if (!actual) throw new Error(`Production metadata is missing scope ${id}`)
  if (actual.contentVersion !== expected.contentVersion
    || actual.sourceObservedAt !== expected.sourceObservedAt
    || actual.importedAt !== expected.importedAt) {
    throw new Error(`Production metadata mismatch for scope ${id}`)
  }
}

const result = {
  profile,
  dataVersion: manifest.dataVersion,
  importedAt: manifest.importedAt,
}

if (profile === 'schools') {
  const [remoteSchools, remoteZones] = await Promise.all([
    api('/api/schools'),
    api('/api/layers/school-zones'),
  ])
  const localSummary = validateSchoolSnapshot(source.schools, source.schoolZones)
  const remoteSummary = validateSchoolSnapshot(remoteSchools, remoteZones, { apiShape: true })
  const sortedEntries = (map) => [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
  const recordDigests = (summary) => new Map([...summary.records].map(([id, record]) => [id, record.digest]))
  if (JSON.stringify(sortedEntries(recordDigests(localSummary))) !== JSON.stringify(sortedEntries(recordDigests(remoteSummary)))
    || JSON.stringify(sortedEntries(localSummary.geometryDigests)) !== JSON.stringify(sortedEntries(remoteSummary.geometryDigests))) {
    throw new Error('Production school or school-zone content does not match the local snapshot')
  }
  result.schools = remoteSummary.schoolCount
  result.schoolZones = remoteSummary.schoolZoneCount
} else {
  const expectedEstates = source.estates.features.length
  const expectedPriced = source.estates.features.filter((feature) => feature.properties.has_price).length
  const expectedObservedAt = source.estates.features.reduce(
    (latest, feature) => feature.properties.source_observed_at > latest
      ? feature.properties.source_observed_at
      : latest,
    '',
  )
  if (meta.totals?.estates !== expectedEstates
    || meta.totals?.priced !== expectedPriced
    || meta.sourceObservedAt !== expectedObservedAt) {
    throw new Error('Production estate totals or observation timestamp do not match the local snapshot')
  }
  const remoteStreets = await api('/api/streets')
  if (remoteStreets.features?.length !== source.streets.features.length) {
    throw new Error(`Production street count is ${remoteStreets.features?.length}, expected ${source.streets.features.length}`)
  }
  const priced = source.estates.features.filter((feature) => feature.properties.has_price)
  const sampleIndexes = new Set([0, Math.floor(priced.length / 2), priced.length - 1])
  for (const index of sampleIndexes) {
    const feature = priced[index]
    if (!feature) continue
    const detail = await api(`/api/estates/${feature.properties.id}`)
    if (detail.id !== feature.properties.id
      || detail.price !== feature.properties.price
      || detail.refPrice !== (feature.properties.ref_price ?? null)
      || detail.rentPrice !== (feature.properties.rent_price ?? null)) {
      throw new Error(`Production estate ${feature.properties.id} does not match the local snapshot`)
    }
  }
  const historySample = priced[0]
  if (historySample) {
    const history = await api(`/api/estates/${historySample.properties.id}/price-history?days=7&limit=20`)
    if (!history.history?.some((entry) => (
      entry.price === historySample.properties.price
      && entry.sourceObservedAt === historySample.properties.source_observed_at
      && entry.capturedAt?.slice(0, 10) === manifest.importedAt.slice(0, 10)
    ))) {
      throw new Error(`Production price history is missing the current snapshot for estate ${historySample.properties.id}`)
    }
  }
  result.estates = expectedEstates
  result.priced = expectedPriced
  result.streets = remoteStreets.features.length
  result.sourceObservedAt = expectedObservedAt
}

console.log(JSON.stringify(result, null, 2))
