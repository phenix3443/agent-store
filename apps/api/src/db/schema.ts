import { sql } from 'drizzle-orm'
import { check, customType, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
