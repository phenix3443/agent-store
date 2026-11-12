DROP TABLE "topics" CASCADE;
--> statement-breakpoint
-- The automated package review is dropped in #101; its verdicts lived in items.metadata.
UPDATE "items" SET "metadata" = "metadata" - 'review' WHERE "metadata" ? 'review';
