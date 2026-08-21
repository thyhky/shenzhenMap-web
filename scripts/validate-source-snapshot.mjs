import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSourceData } from './data-sql.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.argv[2] || 'https://map.okzer.xyz'

try {
  const { estates } = await loadSourceData(resolve(projectRoot, 'data'))
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
  console.log(`Source snapshot accepted: ${localCount} estates observed ${localObservedAt} (production ${remoteCount} at ${remoteObservedAt})`)
} catch (error) {
  console.error((error instanceof Error ? error : new Error(String(error))).message)
  process.exitCode = 1
}
