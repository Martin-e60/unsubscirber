ALTER TABLE `scanned_messages` ADD `received_at` integer;--> statement-breakpoint
ALTER TABLE `scanned_messages` ADD `list_id` text;--> statement-breakpoint
ALTER TABLE `scanned_messages` ADD `subject` text;--> statement-breakpoint
CREATE INDEX `scanned_messages_sender_received_idx` ON `scanned_messages` (`sender_id`,`received_at`);