-- Hand-edited generated migration (contract step): raid_items loses subproject_id.
-- RAID items already belong to a project through project_id (NOT NULL FK to projects), which the Project
-- dropdown now binds to, so no column is added. Every statement is guarded, so it is safe to re-run.
-- Rollback: restore from a backup taken before applying; the dropped values cannot be re-derived. To reshape
-- only, re-add the nullable column (subproject_id uuid), the raid_items_subproject_idx index and the
-- raid_items_project_subproject_fk composite FK from 0006.
ALTER TABLE IF EXISTS "raid_items" DROP CONSTRAINT IF EXISTS "raid_items_project_subproject_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "raid_items_subproject_idx";--> statement-breakpoint
ALTER TABLE IF EXISTS "raid_items" DROP COLUMN IF EXISTS "subproject_id";
