DROP INDEX IF EXISTS "raid_items_open_target_idx";--> statement-breakpoint
ALTER TABLE "raid_items" DROP COLUMN IF EXISTS "target_date";
