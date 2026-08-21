import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataScopes, globalDisclaimer } from './data-catalog.mjs'
import { appMetadataUpsert, dataScopeUpsert, dataVersionUpsert, estateUpsert, loadSourceData, markEstatesUnlisted, markMissingSchools, markMissingSchoolZones, markMissingStreets, schoolUpsert, schoolZoneUpsert, scopeContentVersion, sourceDataVersion, streetUpsert, syncEstateUpdatedAt } from './data-sql.mjs'
import { requireUpdateProfile } from './update-profile.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/generate-update.mjs [--profile=PROFILE] [--run-id=UUID]

Generates hashed SQL parts for all data, schools only, or estate prices only.

  --profile=PROFILE  all, schools, or estate-prices (default: all)
  --run-id=UUID      pipeline execution ID (generated when omitted)`)
  process.exit(0)
}
const profileArgument = args.find((argument) => argument.startsWith('--profile='))
const runIdArgument = args.find((argument) => argument.startsWith('--run-id='))
const unknown = args.filter((argument) => !argument.startsWith('--profile=') && !argument.startsWith('--run-id='))
if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(', ')} (see --help)`)
const profile = requireUpdateProfile(profileArgument === undefined ? 'all' : profileArgument.slice('--profile='.length))
const runId = runIdArgument?.slice('--run-id='.length) || randomUUID()
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
  throw new Error(`Invalid --run-id value: ${runId}`)
}
const sourceRoot = resolve(projectRoot, 'data')
const outputFile = resolve(projectRoot, 'seed', 'update.sql')
const partsRoot = resolve(projectRoot, 'seed', 'update-parts')
const manifestFile = resolve(partsRoot, 'manifest.json')
const { estates, streets, schools, schoolZones } = await loadSourceData(sourceRoot, profile)
const importedAt = new Date().toISOString()
const estateStatements = []
const finalStatements = []
const sourceObservedAt = estates?.features.reduce(
  (latest, feature) => feature.properties.source_observed_at > latest
    ? feature.properties.source_observed_at
    : latest,
  '',
) ?? null
const schoolSourceObservedAt = schools?.features.reduce(
  (latest, feature) => feature.properties.source_published > latest
    ? feature.properties.source_published
    : latest,
  '',
) ?? null
const referencePriceVersion = estates ? scopeContentVersion(estates.features
  .map((feature) => ({ id: feature.properties.id, refPrice: feature.properties.ref_price ?? null }))
  .sort((a, b) => a.id - b.id)) : null
const targetScopeIds = new Set(profile === 'schools'
  ? ['school-scopes']
  : profile === 'estate-prices' ? ['estates', 'streets', 'official-reference-price'] : dataScopes.map((scope) => scope.id))
const allScopes = dataScopes.map((scope) => ({
  ...scope,
  contentVersion: scope.id === 'estates'
    ? (estates ? scopeContentVersion(estates) : null)
    : scope.id === 'streets' ? (streets ? scopeContentVersion(streets) : null)
      : scope.id === 'school-scopes' ? (schools ? scopeContentVersion({ schools, schoolZones }) : null) : null,
  ...(scope.id === 'official-reference-price' ? { contentVersion: referencePriceVersion } : {}),
  sourceObservedAt: scope.id === 'estates' ? sourceObservedAt
    : scope.id === 'school-scopes' ? schoolSourceObservedAt || null : null,
  importedAt: scope.status === 'active' && targetScopeIds.has(scope.id) ? importedAt : null,
}))
const scopes = allScopes.filter((scope) => targetScopeIds.has(scope.id))

if (profile !== 'schools') {
  for (const feature of estates.features) estateStatements.push(estateUpsert(feature, importedAt))
  for (const feature of streets.features) finalStatements.push(streetUpsert(feature, importedAt))
  finalStatements.push(markMissingStreets(streets))
  finalStatements.push(markEstatesUnlisted(importedAt))
  finalStatements.push(syncEstateUpdatedAt())
}
if (profile !== 'estate-prices') {
  for (const feature of schools.features) finalStatements.push(schoolUpsert(feature, importedAt))
  for (const feature of schoolZones.features) finalStatements.push(schoolZoneUpsert(feature, importedAt))
  finalStatements.push(markMissingSchools(schools))
  finalStatements.push(markMissingSchoolZones(schoolZones))
}
for (const scope of scopes) finalStatements.push(dataScopeUpsert(scope, importedAt))
if (profile === 'all') finalStatements.push(appMetadataUpsert('global_disclaimer', globalDisclaimer, importedAt))
const dataVersion = profile === 'all'
  ? sourceDataVersion(estates, streets, { globalDisclaimer, scopes }, schools, schoolZones)
  : scopeContentVersion({ profile, importedAt, scopes })
finalStatements.push(dataVersionUpsert(dataVersion, importedAt))
const statements = [...estateStatements, ...finalStatements]

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${statements.join('\n')}\n`, 'utf8')
await rm(partsRoot, { recursive: true, force: true })
await mkdir(partsRoot, { recursive: true })
const parts = []
const partHashes = {}
async function writePart(name, content) {
  await writeFile(resolve(partsRoot, name), content, 'utf8')
  partHashes[name] = createHash('sha256').update(content).digest('hex')
  parts.push(name)
}
for (let offset = 0; offset < estateStatements.length; offset += 500) {
  const name = `part-${String(parts.length + 1).padStart(3, '0')}.sql`
  await writePart(name, `${estateStatements.slice(offset, offset + 500).join('\n')}\n`)
}
const finalName = `part-${String(parts.length + 1).padStart(3, '0')}-final.sql`
await writePart(finalName, `${finalStatements.join('\n')}\n`)
const expectedCounts = Object.fromEntries(Object.entries({
  ...(estates ? { estates: estates.features.length, streets: streets.features.length } : {}),
  ...(schools ? { schools: schools.features.length, school_zones: schoolZones.features.length } : {}),
}))
const expectedScopes = Object.fromEntries(scopes.map((scope) => [scope.id, {
  contentVersion: scope.contentVersion,
  sourceObservedAt: scope.sourceObservedAt,
  importedAt: scope.importedAt,
}]))
await writeFile(manifestFile, `${JSON.stringify({
  runId,
  profile,
  importedAt,
  dataVersion,
  expectedCounts,
  expectedScopes,
  parts,
  partHashes,
}, null, 2)}\n`, 'utf8')
console.log(`Generated ${outputFile}`)
console.log(`Profile: ${profile}, estate upserts: ${profile === 'schools' ? 0 : estates.features.length}, street upserts: ${profile === 'schools' ? 0 : streets.features.length}, school upserts: ${profile === 'estate-prices' ? 0 : schools.features.length}, school zone upserts: ${profile === 'estate-prices' ? 0 : schoolZones.features.length}, remote parts: ${parts.length}`)
