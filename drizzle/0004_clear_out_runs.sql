CREATE TABLE `clear_out_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`mail_account_id` text NOT NULL,
	`action` text NOT NULL,
	`label_id` text,
	`label_name` text,
	`requested` integer NOT NULL,
	`succeeded` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`mail_account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clear_out_runs_account_created_idx` ON `clear_out_runs` (`mail_account_id`,`created_at`);