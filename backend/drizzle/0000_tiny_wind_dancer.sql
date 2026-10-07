CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`student` text NOT NULL,
	`house` text NOT NULL,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entries_created_at` ON `entries` (`created_at`);