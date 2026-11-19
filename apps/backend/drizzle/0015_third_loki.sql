-- Hand-edited generated migration (contract step): ost_outcomes loses subproject_id and the metric fields.
-- Outcomes already belong to a project through project_id (NOT NULL FK to projects, ON DELETE CASCADE), so no
-- column is added. Every statement is guarded, so it is safe to re-run and when objects are already gone.
-- Rollback: restore from a backup taken before applying; the dropped values cannot be re-derived. To reshape
-- only, re-add the nullable columns (subproject_id uuid, metric_name text, baseline_value numeric,
-- target_value numeric) and the ost_outcomes_project_subproject_fk composite FK from 0006.
ALTER TABLE IF EXISTS "ost_outcomes" DROP CONSTRAINT IF EXISTS "ost_outcomes_project_subproject_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "ost_outcomes_subproject_id_idx";--> statement-breakpoint
ALTER TABLE IF EXISTS "ost_outcomes" DROP COLUMN IF EXISTS "subproject_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "ost_outcomes" DROP COLUMN IF EXISTS "metric_name";--> statement-breakpoint
ALTER TABLE IF EXISTS "ost_outcomes" DROP COLUMN IF EXISTS "baseline_value";--> statement-breakpoint
ALTER TABLE IF EXISTS "ost_outcomes" DROP COLUMN IF EXISTS "target_value";
