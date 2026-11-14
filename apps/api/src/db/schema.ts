import { sql } from 'drizzle-orm'
import { check, customType, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Drizzle schema for app.db, the SQLite file the API and the store's Better Auth
// share. Migrations are generated into ./drizzle (`pnpm db:generate`) and applied
// by `bun src/migrate.ts`.

// Dates are stored as ISO 8601 text, the format Better Auth's Kysely adapter
// writes on SQLite, so both writers produce values that sort and compare alike.
const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

function isoDate(sqlType: 'text' | 'date') {
  return customType<{ data: Date; driverData: string }>({
    dataType: () => sqlType,
    toDriver: (value) => value.toISOString(),
    fromDriver: (value) => new Date(value),
  })
}
const timestamp = isoDate('text')

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  waffoOrderId: text('waffo_order_id').notNull().unique(),
  buyerEmail: text('buyer_email').notNull(),
  buyerIdentity: text('buyer_identity'),
  plan: text('plan').notNull().default('pro'),
  status: text('status').notNull(),
  productName: text('product_name'),
  waffoStoreId: text('waffo_store_id').notNull(),
  mode: text('mode').notNull().default('prod'),
  eventTimestamp: timestamp('event_timestamp'),
  // As Waffo sends them: 'monthly' / 'yearly', or 'lifetime' for the one-time order.
  billingPeriod: text('billing_period'),
  currentPeriodEnd: text('current_period_end'),
  createdAt: timestamp('created_at').notNull().default(isoNow),
  updatedAt: timestamp('updated_at').notNull().default(isoNow),
}, (t) => [
  check('subscriptions_plan_check', sql`${t.plan} IN ('pro', 'team')`),
  check(
    'subscriptions_status_check',
    sql`${t.status} IN ('active', 'canceling', 'canceled', 'past_due', 'trialing')`,
  ),
  check('subscriptions_mode_check', sql`${t.mode} IN ('test', 'prod')`),
  index('subscriptions_buyer_email_idx').on(sql`lower(${t.buyerEmail})`),
])

export const processedWebhooks = sqliteTable('processed_webhooks', {
  deliveryId: text('delivery_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at').notNull().default(isoNow),
})

// ── Search supplement ────────────────────────────────────────────────────────
// What a search lookup on other skill directories found (src/catalog/found-store.ts).
// These live here and not in catalog.db because the API's catalog.db is a download
// that the next published build replaces. Times are ISO 8601 text.

/** One listing on one directory; the catalog sync reads these through GET /api/discovery/export. */
export const foundListings = sqliteTable('found_listings', {
  source: text('source').notNull(),
  listingId: text('listing_id').notNull(),
  skillKey: text('skill_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  author: text('author'),
  url: text('url').notNull(),
  githubRepo: text('github_repo'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.source, t.listingId] }),
  index('found_listings_skill_key_idx').on(t.skillKey),
])

/** GitHub repos named by a find: scanned by the API once, then by the catalog sync. */
export const foundRepos = sqliteTable('found_repos', {
  fullName: text('full_name').primaryKey(),
  source: text('source').notNull(),
  firstSeenAt: text('first_seen_at').notNull(),
  lastAttemptAt: text('last_attempt_at'),
  lastStatus: text('last_status'),
})

/** Skills read from a found repo, served until the published catalog holds the same id. */
export const foundResources = sqliteTable('found_resources', {
  id: text('id').primaryKey(),
  skillKey: text('skill_key').notNull(),
  githubRepo: text('github_repo').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  summary: text('summary').notNull(),
  detail: text('detail').notNull(),
  validatedAt: text('validated_at').notNull(),
}, (t) => [
  index('found_resources_skill_key_idx').on(t.skillKey),
  index('found_resources_github_repo_idx').on(t.githubRepo),
])

/** Finished lookups, so a repeated query is answered without asking the sites again. */
export const searchLookups = sqliteTable('search_lookups', {
  // SHA-256 of the normalized query. The query text is not stored.
  key: text('key').primaryKey(),
  status: text('status').notNull(),
  partial: integer('partial', { mode: 'boolean' }).notNull(),
  skillKeys: text('skill_keys').notNull(),
  checkedAt: text('checked_at').notNull(),
  expiresAt: text('expires_at').notNull(),
}, (t) => [
  check('search_lookups_status_check', sql`${t.status} IN ('found', 'none')`),
  index('search_lookups_expires_at_idx').on(t.expiresAt),
])

// ── Better Auth ──────────────────────────────────────────────────────────────
// Tables owned by the store's self-hosted Better Auth (apps/store/lib/auth/server.ts).
// Columns keep Better Auth's camelCase names and the SQLite types its `getMigrations`
// emits (text, integer for booleans, date): its Kysely adapter queries them verbatim.
// When the auth config changes (new plugin or user field), regenerate and compare.

const authDate = isoDate('date')

export const authUser = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: authDate('createdAt').notNull().default(isoNow),
  updatedAt: authDate('updatedAt').notNull().default(isoNow),
  username: text('username'),
})

export const authSession = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: authDate('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: authDate('createdAt').notNull().default(isoNow),
  updatedAt: authDate('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
}, (t) => [index('session_userId_idx').on(t.userId)])

export const authAccount = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: authDate('accessTokenExpiresAt'),
  refreshTokenExpiresAt: authDate('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: authDate('createdAt').notNull().default(isoNow),
  updatedAt: authDate('updatedAt').notNull(),
}, (t) => [index('account_userId_idx').on(t.userId)])

export const authVerification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: authDate('expiresAt').notNull(),
  createdAt: authDate('createdAt').notNull().default(isoNow),
  updatedAt: authDate('updatedAt').notNull().default(isoNow),
}, (t) => [index('verification_identifier_idx').on(t.identifier)])

export const authJwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: authDate('createdAt').notNull(),
  expiresAt: authDate('expiresAt'),
  alg: text('alg'),
  crv: text('crv'),
})

// The deviceAuthorization plugin's table: the desktop client's sign-in (#195).
export const authDeviceCode = sqliteTable('deviceCode', {
  id: text('id').primaryKey(),
  deviceCode: text('deviceCode').notNull().unique(),
  userCode: text('userCode').notNull().unique(),
  userId: text('userId').references(() => authUser.id, { onDelete: 'cascade' }),
  expiresAt: authDate('expiresAt').notNull(),
  status: text('status').notNull(),
  lastPolledAt: authDate('lastPolledAt'),
  pollingInterval: integer('pollingInterval'),
  clientId: text('clientId'),
  scope: text('scope'),
})

// ── Favorites ────────────────────────────────────────────────────────────────
// Catalog ids a signed-in user saved (src/favorites.ts). No foreign key to the
// catalog: catalog.db is a separate file, and a favorite outlives a resource that
// leaves the catalog.

export const favorites = sqliteTable('favorites', {
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  resourceId: text('resource_id').notNull(),
  createdAt: timestamp('created_at').notNull().default(isoNow),
}, (t) => [primaryKey({ columns: [t.userId, t.resourceId] })])
