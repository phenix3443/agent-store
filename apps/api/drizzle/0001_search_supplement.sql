CREATE TABLE `found_listings` (
	`source` text NOT NULL,
	`listing_id` text NOT NULL,
	`skill_key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`author` text,
	`url` text NOT NULL,
	`github_repo` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	PRIMARY KEY(`source`, `listing_id`)
);
--> statement-breakpoint
CREATE INDEX `found_listings_skill_key_idx` ON `found_listings` (`skill_key`);--> statement-breakpoint
CREATE TABLE `found_repos` (
	`full_name` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_attempt_at` text,
	`last_status` text
);
--> statement-breakpoint
CREATE TABLE `found_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_key` text NOT NULL,
	`github_repo` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`summary` text NOT NULL,
	`detail` text NOT NULL,
	`validated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `found_resources_skill_key_idx` ON `found_resources` (`skill_key`);--> statement-breakpoint
CREATE INDEX `found_resources_github_repo_idx` ON `found_resources` (`github_repo`);--> statement-breakpoint
CREATE TABLE `search_lookups` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`partial` integer NOT NULL,
	`skill_keys` text NOT NULL,
	`checked_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "search_lookups_status_check" CHECK("search_lookups"."status" IN ('found', 'none'))
);
--> statement-breakpoint
CREATE INDEX `search_lookups_expires_at_idx` ON `search_lookups` (`expires_at`);