CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `house_totals` (
	`house` text PRIMARY KEY NOT NULL,
	`points` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `entries` ADD `deleted_at` text;