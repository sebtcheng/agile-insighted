-- Hand-written (expand step): updated_at trigger and backfill for raid_mitigating_actions.
-- Safe to re-run: the trigger is dropped and recreated, and the backfill skips any RAID item that already has
-- a mitigating action row. raid_items.mitigating_action is left in place (deprecated); drop it in a later
-- contract migration once nothing reads it.
-- Rollback: DROP TABLE "raid_mitigating_actions"; (legacy text is untouched, so no data is lost).
DROP TRIGGER IF EXISTS "raid_mitigating_actions_set_updated_at" ON "raid_mitigating_actions";
--> statement-breakpoint
CREATE TRIGGER "raid_mitigating_actions_set_updated_at" BEFORE UPDATE ON "raid_mitigating_actions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
INSERT INTO "raid_mitigating_actions" ("raid_item_id", "description", "sort_order")
SELECT r."id", btrim(r."mitigating_action"), 0
FROM "raid_items" r
WHERE r."mitigating_action" IS NOT NULL
  AND char_length(btrim(r."mitigating_action")) > 0
  AND NOT EXISTS (SELECT 1 FROM "raid_mitigating_actions" m WHERE m."raid_item_id" = r."id");
