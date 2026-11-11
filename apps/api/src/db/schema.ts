import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
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

export const publishers = pgTable('publishers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url').notNull(),
  tier: text('tier').notNull(),
  bio: text('bio'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('publishers_tier_check', sql`${t.tier} IN ('official', 'verified', 'community')`),
])

export const items = pgTable('items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  version: text('version').notNull(),
  publisherId: uuid('publisher_id')
    .notNull()
    .references(() => publishers.id, { onDelete: 'restrict' }),
  compatibleWith: text('compatible_with').array().notNull().default(sql`'{}'`),
  tags: text('tags').array().notNull().default(sql`'{}'`),
  downloads: integer('downloads').notNull().default(0),
  rating: numeric('rating', { precision: 3, scale: 2 }).notNull().default(sql`0`),
  reviewCount: integer('review_count').notNull().default(0),
  status: text('status').notNull().default('pending'),
  installHook: jsonb('install_hook').notNull().default(sql`'{"steps": []}'`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('items_category_check', sql`${t.category} IN ('provider', 'skill', 'mcp')`),
  check('items_status_check', sql`${t.status} IN ('published', 'pending', 'rejected')`),
  index('items_category_status_idx').on(t.category, t.status),
  index('items_publisher_idx').on(t.publisherId),
  index('items_downloads_idx').on(t.downloads.desc()).where(sql`status = 'published'`),
  index('items_created_idx').on(t.createdAt.desc()).where(sql`status = 'published'`),
])

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

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  itemSlug: text('item_slug')
    .notNull()
    .references(() => items.slug, { onDelete: 'cascade' }),
  // Better Auth user ids are random text, not UUIDs.
  userId: text('user_id').notNull(),
  authorName: text('author_name'),
  rating: integer('rating').notNull(),
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('reviews_rating_check', sql`${t.rating} BETWEEN 1 AND 5`),
  unique('reviews_item_slug_user_id_key').on(t.itemSlug, t.userId),
  index('reviews_item_slug_idx').on(t.itemSlug),
])

export const itemVersions = pgTable('item_versions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  itemSlug: text('item_slug')
    .notNull()
    .references(() => items.slug, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('item_versions_item_slug_version_key').on(t.itemSlug, t.version),
  index('item_versions_item_slug_idx').on(t.itemSlug),
])

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
