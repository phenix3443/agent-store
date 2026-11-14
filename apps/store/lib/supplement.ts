import type { ResourceKind, ResourceSummary } from '@as/types'

/** The API's query normalization (apps/api/src/catalog/supplement.ts). */
export function normalizeQuery(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Mirrors the API's `lookupEligible` and `fallbackTrigger`, so the offer only appears
// where the API would look the query up; the API decides again on its own.
function eligible(q: string): boolean {
  const length = [...q].length
  if (length < 2 || length > 64) return false
  if (!/[\p{L}\p{N}]/u.test(q)) return false
  if (/@|:\/\//.test(q)) return false
  const terms = q.split(' ')
  return terms.length <= 6 && terms.every((t) => [...t].length <= 40)
}

const MIN_RESULTS = 3
const SAMPLE = 10

/** Whether to offer a lookup on other skill directories for this search. */
export function offerSupplement(rawQuery: string, kind: ResourceKind | null, local: Pick<ResourceSummary, 'name' | 'origin'>[]): boolean {
  if (kind && kind !== 'skill') return false
  const q = normalizeQuery(rawQuery)
  if (!eligible(q)) return false
  const sample = local.slice(0, SAMPLE)
  if (sample.length === 0) return true
  const terms = q.split(' ')
  let named = 0
  for (const r of sample) {
    const name = r.name.toLowerCase()
    const key = r.origin.upstreamId.toLowerCase()
    if (name === q || key === q || key.endsWith(`/${q}`)) return false
    if (terms.every((t) => name.includes(t) || key.includes(t))) named++
  }
  return named === 0 || sample.length < MIN_RESULTS
}

export const SITE_NAMES = { clawhub: 'ClawHub', skillhub: 'SkillHub', skillsmp: 'SkillsMP' } as const
