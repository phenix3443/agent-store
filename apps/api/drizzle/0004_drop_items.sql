-- The items catalog moved to catalog.db (/api/resources). Reviews and version
-- history only existed for items and are dropped with them, not migrated.
DROP TABLE "reviews" CASCADE;--> statement-breakpoint
DROP TABLE "item_versions" CASCADE;--> statement-breakpoint
DROP TABLE "items" CASCADE;--> statement-breakpoint
DROP TABLE "publishers" CASCADE;
