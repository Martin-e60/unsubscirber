CREATE TABLE `mail_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'gmail' NOT NULL,
	`email` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text,
	`expires_at` integer NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_accounts_user_provider_email` ON `mail_accounts` (`user_id`,`provider`,`email`);--> statement-breakpoint
CREATE INDEX `mail_accounts_user_idx` ON `mail_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`mail_account_id` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`lookback_days` integer DEFAULT 365 NOT NULL,
	`page_token` text,
	`processed_messages` integer DEFAULT 0 NOT NULL,
	`matched_messages` integer DEFAULT 0 NOT NULL,
	`found_senders` integer DEFAULT 0 NOT NULL,
	`total_estimate` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`mail_account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scans_account_status_idx` ON `scans` (`mail_account_id`,`status`);--> statement-breakpoint
CREATE TABLE `senders` (
	`id` text PRIMARY KEY NOT NULL,
	`mail_account_id` text NOT NULL,
	`address` text NOT NULL,
	`name` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`sample_subject` text,
	`sample_message_id` text,
	`unsubscribe_http` text,
	`unsubscribe_mailto` text,
	`one_click` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`decided_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`mail_account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `senders_account_address` ON `senders` (`mail_account_id`,`address`);--> statement-breakpoint
CREATE INDEX `senders_account_status_idx` ON `senders` (`mail_account_id`,`status`);--> statement-breakpoint
CREATE INDEX `senders_account_count_idx` ON `senders` (`mail_account_id`,`message_count`);--> statement-breakpoint
CREATE TABLE `unsubscribe_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `senders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_sender_idx` ON `unsubscribe_attempts` (`sender_id`);--> statement-breakpoint
CREATE INDEX `attempts_created_idx` ON `unsubscribe_attempts` (`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);