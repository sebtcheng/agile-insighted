-- Hand-edited generated migration: guarded so it is safe to re-run, plus a backfill.
-- responsible_id stays nullable (matches raid_items.owner_id, ON DELETE SET NULL). Existing actions are
-- backfilled from their RAID item's owner; actions on unowned items stay NULL until someone assigns them.
-- Rollback: DROP INDEX IF EXISTS "raid_mitigating_actions_responsible_idx"; ALTER TABLE "raid_mitigating_actions" DROP COLUMN IF EXISTS "responsible_id";
ALTER TABLE "raid_mitigating_actions" ADD COLUMN IF NOT EXISTS "responsible_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "raid_mitigating_actions" ADD CONSTRAINT "raid_mitigating_actions_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raid_mitigating_actions_responsible_idx" ON "raid_mitigating_actions" USING btree ("responsible_id");--> statement-breakpoint
UPDATE "raid_mitigating_actions" a SET "responsible_id" = i."owner_id" FROM "raid_items" i WHERE a."raid_item_id" = i."id" AND a."responsible_id" IS NULL AND i."owner_id" IS NOT NULL;
