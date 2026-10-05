-- Several Gmail mailboxes per Tidely user. Additive only: every existing row
-- keeps its data, old code ignores the new columns, and nothing is backfilled.
-- A mailbox's provider_account_id is recorded on its next sign-in or reconnect;
-- users.active_mail_account_id stays empty until someone picks a mailbox.
ALTER TABLE `mail_accounts` ADD `provider_account_id` text;--> statement-breakpoint
ALTER TABLE `mail_accounts` ADD `label` text;--> statement-breakpoint
ALTER TABLE `mail_accounts` ADD `needs_reconnect` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `active_mail_account_id` text;