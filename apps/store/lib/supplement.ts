import type { ExternalSite, ResourceKind, ResourceSummary, SearchSupplementResponse } from '@as/types'

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

export const SITE_NAMES: Record<ExternalSite, string> = { clawhub: 'ClawHub', skillhub: 'SkillHub', skillsmp: 'SkillsMP' }

/** Site names as one phrase: 「A、B、C」 in Chinese, "A, B and C" in English. */
export function siteList(sites: readonly string[], locale: string): string {
  const names = sites.map((s) => SITE_NAMES[s as ExternalSite] ?? s)
  if (locale.startsWith('zh')) return names.join('、')
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)
}

// What `?state=…&supplement=` draws, since the test deployment has the supplement off.
export const REVIEW_SOURCES: ExternalSite[] = ['clawhub', 'skillhub', 'skillsmp']

const REVIEW_SKILL: ResourceSummary = {
  id: 'github:example/pdf-kit/pdf-tools',
  kind: 'skill',
  name: 'pdf-tools',
  description: 'Merge, split and fill PDF files from the command line.',
  author: { name: 'example', url: null },
  version: null,
  homepageUrl: null,
  installs: null,
  stars: null,
  verified: false,
  tags: [],
  transports: [],
  origin: {
    site: 'github',
    upstreamId: 'example/pdf-kit/pdf-tools',
    url: null,
    upstreamVersion: null,
    upstreamUpdatedAt: null,
    syncedAt: '2026-11-14T00:00:00.000Z',
    unavailableAt: null,
    unavailableReason: null,
  },
}

export const REVIEW_FOUND: SearchSupplementResponse = {
  status: 'found',
  sources: REVIEW_SOURCES,
  reason: 'no_results',
  resources: [REVIEW_SKILL],
  listings: [
    { key: 'clawhub:example/pdf-forms', site: 'clawhub', name: 'pdf-forms', description: 'Fill and flatten PDF forms.', author: 'example', url: 'https://clawhub.ai/' },
    { key: 'skillhub:example/pdf-ocr', site: 'skillhub', name: 'pdf-ocr', description: null, author: 'example', url: 'https://skillhub.cn/' },
  ],
  foundOn: { [REVIEW_SKILL.id]: ['skillsmp'] },
  partial: true,
  retryAfterSeconds: null,
}
