CREATE TABLE `domain_smtp` (
	`domain_id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE cascade
);
