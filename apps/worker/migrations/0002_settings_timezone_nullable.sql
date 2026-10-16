-- Make settings.timezone nullable: null means "use the viewer's device time zone".
-- Hand-edited from drizzle-kit output: no PRAGMA foreign_keys (D1 disallows it, and no table
-- references settings), an unqualified CHECK, and the old implicit 'UTC' default becomes null.
CREATE TABLE `__new_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ghost_threshold_days` integer DEFAULT 21 NOT NULL,
	`timezone` text,
	`raw_retention_days` integer DEFAULT 30 NOT NULL,
	`auto_apply` integer DEFAULT true NOT NULL,
	`digest` text DEFAULT 'off' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "settings_ghost_threshold_positive" CHECK("ghost_threshold_days" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "ghost_threshold_days", "timezone", "raw_retention_days", "auto_apply", "digest") SELECT "user_id", "ghost_threshold_days", CASE WHEN "timezone" = 'UTC' THEN NULL ELSE "timezone" END, "raw_retention_days", "auto_apply", "digest" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;
