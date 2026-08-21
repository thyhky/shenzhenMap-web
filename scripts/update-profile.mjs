export const updateProfiles = ['all', 'schools', 'estate-prices']

export function requireUpdateProfile(value = 'all') {
  if (!updateProfiles.includes(value)) {
    throw new Error(`Invalid update profile: ${value} (expected ${updateProfiles.join(', ')})`)
  }
  return value
}

export function profileFiles(profile) {
  requireUpdateProfile(profile)
  if (profile === 'schools') return ['schools.geojson', 'school_zones.geojson']
  if (profile === 'estate-prices') return ['estates.geojson', 'streets.geojson']
  return ['estates.geojson', 'streets.geojson', 'schools.geojson', 'school_zones.geojson']
}
