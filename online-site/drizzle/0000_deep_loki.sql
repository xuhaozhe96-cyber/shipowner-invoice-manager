CREATE TABLE `container_free_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vessel_name` text NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`container_no` text NOT NULL,
	`last_free_day` text DEFAULT '' NOT NULL,
	`pickup_date` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_container_free_day_unique` ON `container_free_days` (`vessel_name`,`owner_name`,`container_no`);--> statement-breakpoint
CREATE TABLE `container_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vessel_name` text NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`container_no` text NOT NULL,
	`released` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_container_release_unique` ON `container_releases` (`vessel_name`,`owner_name`,`container_no`);--> statement-breakpoint
CREATE TABLE `email_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_type` text NOT NULL,
	`vessel_name` text NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`owner_email` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_draft_unique` ON `email_drafts` (`draft_type`,`vessel_name`,`owner_name`,`owner_email`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_filename` text NOT NULL,
	`file_key` text DEFAULT '' NOT NULL,
	`raw_text` text DEFAULT '' NOT NULL,
	`extraction_warning` text DEFAULT '' NOT NULL,
	`learning_note` text DEFAULT '' NOT NULL,
	`invoice_category` text DEFAULT 'freight' NOT NULL,
	`vessel_name` text DEFAULT '' NOT NULL,
	`voyage_no` text DEFAULT '' NOT NULL,
	`eta` text DEFAULT '' NOT NULL,
	`invoice_no` text DEFAULT '' NOT NULL,
	`invoice_no_key` text DEFAULT '' NOT NULL,
	`invoice_date` text DEFAULT '' NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`owner_email` text DEFAULT '' NOT NULL,
	`port_of_discharge` text DEFAULT '' NOT NULL,
	`container_no` text DEFAULT '' NOT NULL,
	`container_size` text DEFAULT '' NOT NULL,
	`bl_no` text DEFAULT '' NOT NULL,
	`charge_details` text DEFAULT '' NOT NULL,
	`amount` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '待校正' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_invoices_vessel_owner` ON `invoices` (`vessel_name`,`owner_name`);--> statement-breakpoint
CREATE INDEX `idx_invoices_eta_vessel` ON `invoices` (`eta`,`vessel_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoices_invoice_no_key` ON `invoices` (`invoice_no_key`) WHERE "invoices"."invoice_no_key" <> '';--> statement-breakpoint
CREATE TABLE `learning_examples` (
	`invoice_id` integer PRIMARY KEY NOT NULL,
	`source_filename` text DEFAULT '' NOT NULL,
	`template_signature` text DEFAULT '' NOT NULL,
	`fields_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_proofs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vessel_name` text NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`payment_date` text DEFAULT '' NOT NULL,
	`source_filename` text NOT NULL,
	`file_key` text NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payment_proofs_vessel_owner` ON `payment_proofs` (`vessel_name`,`owner_name`);--> statement-breakpoint
CREATE TABLE `vessel_archives` (
	`vessel_name` text PRIMARY KEY NOT NULL,
	`archived_at` text NOT NULL
);
