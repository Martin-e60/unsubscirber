CREATE TABLE `scanned_messages` (
	`mail_account_id` text NOT NULL,
	`message_id` text NOT NULL,
	`sender_id` text NOT NULL,
	PRIMARY KEY(`mail_account_id`, `message_id`),
	FOREIGN KEY (`mail_account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `senders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scanned_messages_sender_idx` ON `scanned_messages` (`sender_id`);