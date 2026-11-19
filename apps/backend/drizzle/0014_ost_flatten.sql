-- Hand-edited (contract step): flatten the OST to Outcome > Opportunity > Solution.
-- Drops ost_assumptions, activities.ost_assumption_id, ost_opportunities.parent_opportunity_id and the
-- assumption_category enum. Every statement is guarded, so it is safe to re-run and safe when objects are missing.
-- Sub-opportunities (rows with a parent) are deleted first, along with their solutions (FK cascade); a story
-- already converted from such a solution is kept (its link is set to null). Top-level opportunities, outcomes
-- and their solutions are untouched.
-- Rollback: restore from a backup taken before applying; the dropped assumption and sub-opportunity data
-- cannot be re-derived from the remaining tables.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ost_opportunities' AND column_name = 'parent_opportunity_id'
  ) THEN
    DELETE FROM "ost_opportunities" WHERE "parent_opportunity_id" IS NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "activities" DROP CONSTRAINT IF EXISTS "activities_ost_assumption_id_ost_assumptions_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "ost_opportunities" DROP CONSTRAINT IF EXISTS "ost_opportunities_parent_opportunity_id_ost_opportunities_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "activities_ost_assumption_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "ost_opportunities_parent_idx";
--> statement-breakpoint
ALTER TABLE IF EXISTS "activities" DROP COLUMN IF EXISTS "ost_assumption_id";
--> statement-breakpoint
ALTER TABLE IF EXISTS "ost_opportunities" DROP COLUMN IF EXISTS "parent_opportunity_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "ost_assumptions" CASCADE;
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."assumption_category";
