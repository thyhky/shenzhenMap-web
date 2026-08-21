import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSourceData } from './data-sql.mjs'
import { validateSchoolContinuity, validateSchoolSnapshot } from './school-data-validation.mjs'
import { requireUpdateProfile } from './update-profile.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/validate-source-snapshot.mjs [URL] [--profile=PROFILE]

Validates the selected local snapshot against production.

  URL                production base URL (default: https://map.okzer.xyz)
  --profile=PROFILE  all, schools, or estate-prices (default: all)`)
  process.exit(0)
}
const profileArgument = args.find((argument) => argument.startsWith('--profile='))
const positional = args.filter((argument) => !argument.startsWith('-'))
const unknown = args.filter((argument) => argument.startsWith('-') && !argument.startsWith('--profile='))
if (unknown.length || positional.length > 1) throw new Error(`Unknown argument(s): ${[...unknown, ...positional.slice(1)].join(', ')} (see --help)`)
const profile = requireUpdateProfile(profileArgument === undefined ? 'all' : profileArgument.slice('--profile='.length))
const baseUrl = positional[0] || 'https://map.okzer.xyz'
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY) && !process.execArgv.includes('--use-env-proxy')) {
  execFileSync(process.execPath, ['--use-env-proxy', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  process.exit(0)
}

try {
  const { estates, streets, schools, schoolZones } = await loadSourceData(resolve(projectRoot, 'data'), profile)
  if (profile !== 'schools') {
    const localObservedAt = estates.features.reduce(
      (latest, feature) => feature.properties.source_observed_at > latest
        ? feature.properties.source_observed_at
        : latest,
      '',
    )
    const localObservedTime = Date.parse(localObservedAt)
    if (!Number.isFinite(localObservedTime)) {
      throw new Error('Local estate snapshot has no valid source_observed_at timestamp')
    }
    const response = await fetch(`${baseUrl}/api/meta`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) throw new Error(`Production metadata returned HTTP ${response.status}`)
    const remote = await response.json()
    const remoteObservedAt = remote.sourceObservedAt
    const remoteObservedTime = Date.parse(remoteObservedAt)
    if (!Number.isFinite(remoteObservedTime)) {
      throw new Error('Production metadata has no valid sourceObservedAt timestamp')
    }
    if (localObservedTime < remoteObservedTime) {
      throw new Error(`Refusing to deploy stale data: local ${localObservedAt} is older than production ${remoteObservedAt}`)
    }
    const localCount = estates.features.length
    const remoteCount = Number(remote.totals?.estates)
    if (Number.isFinite(remoteCount) && remoteCount > 0 && localCount < remoteCount * 0.8) {
      throw new Error(`Refusing a suspicious estate-count drop: local ${localCount}, production ${remoteCount}`)
    }
    const remoteStreetsResponse = await fetch(`${baseUrl}/api/streets`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000),
    })
    if (!remoteStreetsResponse.ok) throw new Error(`Production streets returned HTTP ${remoteStreetsResponse.status}`)
    const remoteStreets = await remoteStreetsResponse.json()
    const remoteStreetCount = Number(remoteStreets.features?.length)
    if (Number.isFinite(remoteStreetCount) && remoteStreetCount > 0 && streets.features.length < remoteStreetCount) {
      throw new Error(`Refusing a street-count drop: local ${streets.features.length}, production ${remoteStreetCount}`)
    }
    console.log(`Source snapshot accepted: ${localCount} estates observed ${localObservedAt} (production ${remoteCount} at ${remoteObservedAt})`)
  }

  if (profile !== 'estate-prices') {
    const localSchools = validateSchoolSnapshot(schools, schoolZones)
    const [remoteSchoolsResponse, remoteSchoolZonesResponse] = await Promise.all([
      fetch(`${baseUrl}/api/schools`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(90_000) }),
      fetch(`${baseUrl}/api/layers/school-zones`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(90_000) }),
    ])
    if (!remoteSchoolsResponse.ok) throw new Error(`Production schools returned HTTP ${remoteSchoolsResponse.status}`)
    if (!remoteSchoolZonesResponse.ok) throw new Error(`Production school zones returned HTTP ${remoteSchoolZonesResponse.status}`)
    const remoteSchools = validateSchoolSnapshot(
      await remoteSchoolsResponse.json(),
      await remoteSchoolZonesResponse.json(),
      { apiShape: true },
    )
    validateSchoolContinuity(localSchools, remoteSchools, {
      allowIdReplacements: process.env.ALLOW_SCHOOL_ID_REPLACEMENTS === '1',
      allowContentChanges: process.env.ALLOW_SCHOOL_CONTENT_CHANGES === '1',
      allowGeometryWarnings: process.env.ALLOW_SCHOOL_GEOMETRY_WARNINGS === '1',
    })
    console.log(`School snapshot accepted: ${localSchools.schoolCount} schools/zones, ${localSchools.approximateZones} explicitly approximate zones, ${localSchools.invalidTopologyIds.size} known topology warnings, ${localSchools.schoolOutsideZoneIds.size} known point/zone warnings`)
  }
} catch (error) {
  console.error((error instanceof Error ? error : new Error(String(error))).message)
  process.exitCode = 1
}
