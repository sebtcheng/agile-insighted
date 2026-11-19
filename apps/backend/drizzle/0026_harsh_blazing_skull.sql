-- Hand-edited generated migration, guarded so it is safe to re-run.
-- Adds ost_solutions.target_date (nullable) and drops ost_opportunities.description ("Notes") and .evidence.
-- DESTRUCTIVE: the dropped text cannot be re-derived. Rollback: restore from backup, or re-add both columns as
-- nullable text (values stay empty) and drop target_date.
ALTER TABLE "ost_solutions" ADD COLUMN IF NOT EXISTS "target_date" date;--> statement-breakpoint
ALTER TABLE "ost_opportunities" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "ost_opportunities" DROP COLUMN IF EXISTS "evidence";
