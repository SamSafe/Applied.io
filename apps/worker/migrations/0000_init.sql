CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `application` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company` text NOT NULL,
	`company_key` text NOT NULL,
	`company_domain` text,
	`position` text NOT NULL,
	`position_key` text NOT NULL,
	`req_number` text,
	`ats` text,
	`ats_job_ref` text,
	`location` text,
	`url` text,
	`source` text,
	`notes` text,
	`created_via` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `application_user_idx` ON `application` (`user_id`);--> statement-breakpoint
CREATE INDEX `application_user_company_idx` ON `application` (`user_id`,`company_key`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`stage` text,
	`outcome` text,
	`voids_event_id` text,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`origin` text NOT NULL,
	`message_id` text,
	`certainty` text,
	`note` text,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "event_shape" CHECK(("event"."type" = 'advanced') = ("event"."stage" IS NOT NULL)
        AND ("event"."type" = 'closed') = ("event"."outcome" IS NOT NULL)
        AND ("event"."type" = 'voided') = ("event"."voids_event_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `event_application_idx` ON `event` (`application_id`);--> statement-breakpoint
CREATE INDEX `event_user_idx` ON `event` (`user_id`);--> statement-breakpoint
CREATE TABLE `mail_source` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`address_token` text,
	`status` text NOT NULL,
	`provider_hint` text,
	`verified_mailbox` text,
	`credentials` text,
	`last_message_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_source_address_token_unique` ON `mail_source` (`address_token`);--> statement-breakpoint
CREATE INDEX `mail_source_user_idx` ON `mail_source` (`user_id`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`received_at` text NOT NULL,
	`raw_key` text,
	`header_message_id` text,
	`from_address` text,
	`from_domain` text,
	`subject` text,
	`sent_at` text,
	`sender_verified` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`classification` text,
	`classifier_version` text,
	`model` text,
	`evidence` text,
	`application_id` text,
	`event_id` text,
	`review` text,
	`failure` text,
	`purge_after` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `mail_source`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `message_user_status_idx` ON `message` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `message_purge_idx` ON `message` (`purge_after`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_user_header_id_uq` ON `message` (`user_id`,`header_message_id`) WHERE "message"."header_message_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`ghost_threshold_days` integer DEFAULT 21 NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`raw_retention_days` integer DEFAULT 30 NOT NULL,
	`auto_apply` integer DEFAULT true NOT NULL,
	`digest` text DEFAULT 'off' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "settings_ghost_threshold_positive" CHECK("settings"."ghost_threshold_days" > 0)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);