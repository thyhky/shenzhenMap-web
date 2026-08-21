import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataScopes, globalDisclaimer } from './data-catalog.mjs'
import { appMetadataUpsert, dataScopeUpsert, dataVersionUpsert, estateInsert, loadSourceData, schoolInsert, schoolZoneInsert, scopeContentVersion, sourceDataVersion, streetInsert } from './data-sql.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(projectRoot, 'data')
const outputFile = resolve(projectRoot, 'seed', 'seed.sql')

const { estates, streets, schools, schoolZones } = await loadSourceData(sourceRoot)
const now = new Date().toISOString()
const statements = []
const sourceObservedAt = estates.features.reduce(
  (latest, feature) => feature.properties.source_observed_at > latest
    ? feature.properties.source_observed_at
    : latest,
  '',
)
const schoolSourceObservedAt = schools.features.reduce(
  (latest, feature) => feature.properties.source_published > latest
    ? feature.properties.source_published
    : latest,
  '',
)
const scopes = dataScopes.map((scope) => ({
  ...scope,
  contentVersion: scope.id === 'estates'
    ? scopeContentVersion(estates)
    : scope.id === 'streets' ? scopeContentVersion(streets)
      : scope.id === 'school-scopes' ? scopeContentVersion({ schools, schoolZones }) : null,
  sourceObservedAt: scope.id === 'estates' ? sourceObservedAt
    : scope.id === 'school-scopes' ? schoolSourceObservedAt || null : null,
  importedAt: scope.status === 'active' ? now : null,
}))

for (const feature of estates.features) {
  statements.push(estateInsert(feature, now))
}

for (const feature of streets.features) {
  statements.push(streetInsert(feature, now))
}
for (const feature of schools.features) {
  statements.push(schoolInsert(feature, now))
}
for (const feature of (schoolZones?.features ?? [])) {
  statements.push(schoolZoneInsert(feature, now))
}
for (const scope of scopes) statements.push(dataScopeUpsert(scope, now))
statements.push(appMetadataUpsert('global_disclaimer', globalDisclaimer, now))
statements.push(dataVersionUpsert(sourceDataVersion(estates, streets, { globalDisclaimer, scopes }, schools, schoolZones), now))

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${statements.join('\n')}\n`, 'utf8')
console.log(`Generated ${outputFile}`)
console.log(`Estates: ${estates.features.length}, streets: ${streets.features.length}, schools: ${schools.features.length}, school zones: ${schoolZones?.features.length ?? 0}`)
