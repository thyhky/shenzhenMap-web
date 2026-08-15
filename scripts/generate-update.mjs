import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataScopes, globalDisclaimer } from './data-catalog.mjs'
import { appMetadataUpsert, dataScopeUpsert, dataVersionUpsert, estateUpsert, loadSourceData, markEstatesUnlisted, markMissingSchools, markMissingSchoolZones, markMissingStreets, schoolUpsert, schoolZoneUpsert, scopeContentVersion, sourceDataVersion, streetUpsert, syncEstateUpdatedAt } from './data-sql.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(projectRoot, 'data')
const outputFile = resolve(projectRoot, 'seed', 'update.sql')
const partsRoot = resolve(projectRoot, 'seed', 'update-parts')
const manifestFile = resolve(partsRoot, 'manifest.json')
const { estates, streets, schools, schoolZones } = await loadSourceData(sourceRoot)
const importedAt = new Date().toISOString()
const estateStatements = []
const finalStatements = []
const sourceObservedAt = estates.features.reduce(
  (latest, feature) => feature.properties.source_observed_at > latest
    ? feature.properties.source_observed_at
    : latest,
  '',
)
const scopes = dataScopes.map((scope) => ({
  ...scope,
  contentVersion: scope.id === 'estates'
    ? scopeContentVersion(estates)
    : scope.id === 'streets' ? scopeContentVersion(streets)
      : scope.id === 'school-scopes' ? scopeContentVersion(schools) : null,
  sourceObservedAt: scope.id === 'estates' ? sourceObservedAt
    : scope.id === 'school-scopes' ? schools.features[0]?.properties.source_published ?? null : null,
  importedAt: scope.status === 'active' ? importedAt : null,
}))

for (const feature of estates.features) estateStatements.push(estateUpsert(feature, importedAt))
for (const feature of streets.features) finalStatements.push(streetUpsert(feature, importedAt))
for (const feature of schools.features) finalStatements.push(schoolUpsert(feature, importedAt))
for (const feature of (schoolZones?.features ?? [])) finalStatements.push(schoolZoneUpsert(feature, importedAt))
finalStatements.push(markMissingStreets(streets))
finalStatements.push(markMissingSchools(schools))
if (schoolZones) finalStatements.push(markMissingSchoolZones(schoolZones))
finalStatements.push(markEstatesUnlisted(importedAt))
finalStatements.push(syncEstateUpdatedAt())
for (const scope of scopes) finalStatements.push(dataScopeUpsert(scope, importedAt))
finalStatements.push(appMetadataUpsert('global_disclaimer', globalDisclaimer, importedAt))
finalStatements.push(dataVersionUpsert(
  sourceDataVersion(estates, streets, { globalDisclaimer, scopes }, schools, schoolZones),
  importedAt,
))
const statements = [...estateStatements, ...finalStatements]

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${statements.join('\n')}\n`, 'utf8')
await mkdir(partsRoot, { recursive: true })
const parts = []
for (let offset = 0; offset < estateStatements.length; offset += 500) {
  const name = `part-${String(parts.length + 1).padStart(3, '0')}.sql`
  await writeFile(resolve(partsRoot, name), `${estateStatements.slice(offset, offset + 500).join('\n')}\n`, 'utf8')
  parts.push(name)
}
const finalName = `part-${String(parts.length + 1).padStart(3, '0')}-final.sql`
await writeFile(resolve(partsRoot, finalName), `${finalStatements.join('\n')}\n`, 'utf8')
parts.push(finalName)
await writeFile(manifestFile, `${JSON.stringify({ importedAt, parts }, null, 2)}\n`, 'utf8')
console.log(`Generated ${outputFile}`)
console.log(`Estate upserts: ${estates.features.length}, street upserts: ${streets.features.length}, school upserts: ${schools.features.length}, school zone upserts: ${schoolZones?.features.length ?? 0}, remote parts: ${parts.length}`)
