-- Hand-written (expand step): updated_at trigger and backfill for story_dor_items.
-- Safe to re-run: the trigger is dropped and recreated, and both inserts skip any story that already has a
-- story_dor_items row, so no story is backfilled twice and later edits are never overwritten.
-- 1) Stories in projects with active ready templates get one row per template, ticked where a checklist_checks
--    row exists (existing progress such as 3/5 is preserved).
-- 2) Stories still without rows (projects with no ready templates) get the five default criteria, unticked.
-- checklist_templates / checklist_checks are left in place (deprecated for stories); drop in a later contract migration.
-- Rollback: DROP TABLE "story_dor_items"; (legacy templates and checks are untouched, so no data is lost).
DROP TRIGGER IF EXISTS "story_dor_items_set_updated_at" ON "story_dor_items";
--> statement-breakpoint
CREATE TRIGGER "story_dor_items_set_updated_at" BEFORE UPDATE ON "story_dor_items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
INSERT INTO "story_dor_items" ("story_id", "label", "is_completed", "sort_order")
SELECT s."id", t."label", (c."id" IS NOT NULL),
       (row_number() OVER (PARTITION BY s."id" ORDER BY t."position", t."id") - 1)::integer
FROM "user_stories" s
JOIN "checklist_templates" t
  ON t."project_id" = s."project_id" AND t."kind" = 'ready' AND t."is_active"
LEFT JOIN "checklist_checks" c ON c."template_id" = t."id" AND c."story_id" = s."id"
WHERE NOT EXISTS (SELECT 1 FROM "story_dor_items" d WHERE d."story_id" = s."id");
--> statement-breakpoint
INSERT INTO "story_dor_items" ("story_id", "label", "is_completed", "sort_order")
SELECT s."id", d."label", false, d."ord"
FROM "user_stories" s
CROSS JOIN (VALUES
  ('Persona and value stated', 0),
  ('Acceptance criteria in Given/When/Then', 1),
  ('Wireframes attached', 2),
  ('Dependencies resolved', 3),
  ('Right-sized for one sprint', 4)
) AS d("label", "ord")
WHERE NOT EXISTS (SELECT 1 FROM "story_dor_items" e WHERE e."story_id" = s."id");
