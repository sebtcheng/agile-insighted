-- Hand-edited generated migration (expand step), guarded so it is safe to re-run. Additive only: no data is lost.
-- user_stories gains a person responsible and a target date; story_dor_items (the per-story checklist) becomes
-- action steps with completed_at, target_date and a staff member responsible, like raid_mitigating_actions.
-- completed_at is backfilled from updated_at for rows already ticked, so the new check holds for existing data.
-- Rollback: drop the five added columns (their FKs, indexes and the check go with them); no existing value changes.
ALTER TABLE "story_dor_items" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "story_dor_items" ADD COLUMN IF NOT EXISTS "target_date" date;--> statement-breakpoint
ALTER TABLE "story_dor_items" ADD COLUMN IF NOT EXISTS "responsible_id" uuid;--> statement-breakpoint
ALTER TABLE "user_stories" ADD COLUMN IF NOT EXISTS "responsible_id" uuid;--> statement-breakpoint
ALTER TABLE "user_stories" ADD COLUMN IF NOT EXISTS "target_date" date;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "story_dor_items" ADD CONSTRAINT "story_dor_items_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_dor_items_responsible_idx" ON "story_dor_items" USING btree ("responsible_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_stories_responsible_idx" ON "user_stories" USING btree ("responsible_id");--> statement-breakpoint
UPDATE "story_dor_items" SET "completed_at" = "updated_at" WHERE "is_completed" AND "completed_at" IS NULL;--> statement-breakpoint
UPDATE "story_dor_items" SET "completed_at" = NULL WHERE NOT "is_completed" AND "completed_at" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "story_dor_items" ADD CONSTRAINT "story_dor_items_completed_at_matches" CHECK ("story_dor_items"."is_completed" = ("story_dor_items"."completed_at" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
