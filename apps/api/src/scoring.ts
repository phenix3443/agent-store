import { sql, type SQL } from 'drizzle-orm'
import { items, publishers } from './db/schema'

// Recommendation scoring — how the catalog is ranked for the default
// "recommended" sort (CLI + web). We move off raw-downloads ordering, which
// buries good-but-new items and lets a single ancient megahit dominate forever.
//
// Four normalized factors (each 0–1), weighted and summed. Inspired by:
//   • VS Code Marketplace — log-compress downloads so 1M vs 10M doesn't swamp
//     everything, and Bayesian-weight ratings so a lone "5.0 (1 review)" can't
//     outrank a solid "4.6 (500 reviews)".
//   • Raycast Store — recency/"frecency": a time-decay bonus keeps fresh, active
//     items visible instead of letting the leaderboard ossify.
//
// Constants live here (not inlined in SQL strings) so weights/priors/half-life
// are tunable in one place. The SQL builder (recommendedScoreSql) and the pure
// TS mirror (computeRecommendedScore) MUST stay in sync — both read the same
// constants below, and the TS mirror is what the unit tests assert against
// (the SQL runs in Postgres, which the mocked-query test harness can't exercise).

// Weights sum to 1.0.
export const WEIGHT_POPULARITY = 0.45
export const WEIGHT_RATING_BAYES = 0.3
export const WEIGHT_FRESHNESS = 0.15
export const WEIGHT_TIER = 0.1

// popularity = ln(downloads + 1) / ln(DMAX + 1). Fixed reference ceiling (not a
// window-function max) so the score is stable and cheap to compute per row.
export const DOWNLOADS_MAX = 1_000_000

// rating_bayes = (n*rating + m*C) / (n + m) / 5. Bayesian prior of m pseudo-votes
// at the global mean C — pulls low-count ratings toward the average.
export const RATING_PRIOR_COUNT = 20 // m
export const RATING_PRIOR_MEAN = 4.2 // C (global average rating, 0–5)
export const RATING_MAX = 5

// freshness = 0.5 ^ (age / half-life). Halves every 60 days since last update.
export const FRESHNESS_HALF_LIFE_DAYS = 60
const FRESHNESS_HALF_LIFE_SECONDS = FRESHNESS_HALF_LIFE_DAYS * 86_400

// tier bonus by publisher trust level.
export const TIER_WEIGHTS: Record<string, number> = {
  official: 1.0,
  verified: 0.6,
  community: 0.3,
}
const TIER_DEFAULT = 0.3

// Drizzle SQL expression for the recommendation score, used in ORDER BY so the
// top-N is picked in the database (getItems LIMITs, so ranking must be in SQL).
// rating is numeric and review_count is int — Postgres handles the arithmetic.
//
// Every constant is cast `::numeric`: interpolated values are sent as bound
// parameters, which Postgres can type as `unknown`.
// Multiplying two of them (`RATING_PRIOR_COUNT * RATING_PRIOR_MEAN`, or
// `WEIGHT_TIER * CASE(...)` whose all-param branches also type as unknown) then
// fails to plan ("operator is not unique: unknown * unknown"). The casts pin the
// type so the whole ORDER BY resolves.
export function recommendedScoreSql(): SQL<number> {
  return sql<number>`(
    ${WEIGHT_POPULARITY}::numeric * (ln(${items.downloads} + 1) / ln(${DOWNLOADS_MAX}::numeric + 1))
    + ${WEIGHT_RATING_BAYES}::numeric * ((${items.reviewCount} * ${items.rating} + ${RATING_PRIOR_COUNT}::numeric * ${RATING_PRIOR_MEAN}::numeric) / (${items.reviewCount} + ${RATING_PRIOR_COUNT}::numeric) / ${RATING_MAX}::numeric)
    + ${WEIGHT_FRESHNESS}::numeric * power(0.5, extract(epoch from (now() - ${items.updatedAt})) / ${FRESHNESS_HALF_LIFE_SECONDS}::numeric)
    + ${WEIGHT_TIER}::numeric * (CASE ${publishers.tier} WHEN 'official' THEN ${TIER_WEIGHTS.official}::numeric WHEN 'verified' THEN ${TIER_WEIGHTS.verified}::numeric ELSE ${TIER_DEFAULT}::numeric END)
  )`
}

export interface ScoreInput {
  downloads: number
  rating: number
  reviewCount: number
  updatedAt: Date | string
  tier: string
}

// Pure TS mirror of recommendedScoreSql — same formula, same constants. Kept for
// unit tests (relative ordering assertions) since the SQL only runs in Postgres.
export function computeRecommendedScore(input: ScoreInput, now: Date = new Date()): number {
  const popularity = Math.log(input.downloads + 1) / Math.log(DOWNLOADS_MAX + 1)
  const ratingBayes =
    (input.reviewCount * input.rating + RATING_PRIOR_COUNT * RATING_PRIOR_MEAN) /
    (input.reviewCount + RATING_PRIOR_COUNT) /
    RATING_MAX
  const ageSeconds = (now.getTime() - new Date(input.updatedAt).getTime()) / 1000
  const freshness = Math.pow(0.5, ageSeconds / FRESHNESS_HALF_LIFE_SECONDS)
  const tier = TIER_WEIGHTS[input.tier] ?? TIER_DEFAULT
  return (
    WEIGHT_POPULARITY * popularity +
    WEIGHT_RATING_BAYES * ratingBayes +
    WEIGHT_FRESHNESS * freshness +
    WEIGHT_TIER * tier
  )
}
