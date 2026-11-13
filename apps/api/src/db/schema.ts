import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// Drizzle schema — the source of truth for the Postgres database.
// Migrations are generated into ./drizzle and applied with `drizzle-kit migrate`.
//
// Scope: tables, columns, types, defaults, checks, foreign keys, unique
// constraints, and indexes — the structural schema. Deliberately NOT reproduced
// here:
//   • RLS policies + anon/authenticated GRANTs — Supabase/PostgREST specific;
//     authorization moves to the API layer (the API is the only catalog client).
//   • The updated_at trigger + update_updated_at() function — kept for DB-level
//     parity but expressed in raw SQL, appended to the generated migration
//     (drizzle-kit does not model triggers). See drizzle/*_*.sql.

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  waffoOrderId: text('waffo_order_id').notNull().unique(),
  buyerEmail: text('buyer_email').notNull(),
  buyerIdentity: text('buyer_identity'),
  plan: text('plan').notNull().default('pro'),
  status: text('status').notNull(),
  productName: text('product_name'),
  waffoStoreId: text('waffo_store_id').notNull(),
  mode: text('mode').notNull().default('prod'),
  eventTimestamp: timestamp('event_timestamp', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('subscriptions_plan_check', sql`${t.plan} IN ('pro', 'team')`),
  check(
    'subscriptions_status_check',
    sql`${t.status} IN ('active', 'canceling', 'canceled', 'past_due', 'trialing')`,
  ),
  check('subscriptions_mode_check', sql`${t.mode} IN ('test', 'prod')`),
  index('subscriptions_buyer_email_idx').on(sql`lower(${t.buyerEmail})`),
])

export const processedWebhooks = pgTable('processed_webhooks', {
  deliveryId: text('delivery_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Better Auth ──────────────────────────────────────────────────────────────
// Tables owned by the store's self-hosted Better Auth (apps/store/lib/auth/server.ts).
// Columns keep Better Auth's camelCase names: its Kysely adapter queries them
// verbatim, so these must match what `getMigrations` emits for that config. When
// the auth config changes (new plugin or user field), regenerate and compare.

const tz = { withTimezone: true } as const

export const authUser = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', tz).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', tz).notNull().defaultNow(),
  username: text('username'),
})

export const authSession = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', tz).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', tz).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', tz).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
}, (t) => [index('session_userId_idx').on(t.userId)])

export const authAccount = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', tz),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', tz),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', tz).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', tz).notNull(),
}, (t) => [index('account_userId_idx').on(t.userId)])

export const authVerification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', tz).notNull(),
  createdAt: timestamp('createdAt', tz).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', tz).notNull().defaultNow(),
}, (t) => [index('verification_identifier_idx').on(t.identifier)])

export const authJwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: timestamp('createdAt', tz).notNull(),
  expiresAt: timestamp('expiresAt', tz),
  alg: text('alg'),
  crv: text('crv'),
})
