-- Hand-edited generated migration (contract step): kano_requests loses subproject_id.
-- Requests already belong to a project through project_id (NOT NULL FK to projects), which the Project
-- dropdown now binds to, so no column is added. Every statement is guarded, so it is safe to re-run.
-- Promotion to a story now takes the target subproject in the request body instead.
-- Rollback: restore from a backup taken before applying; the dropped values cannot be re-derived. To reshape
-- only, re-add the nullable column (subproject_id uuid), the kano_requests_subproject_idx index and the
-- kano_requests_project_subproject_fk composite FK from 0006.
ALTER TABLE IF EXISTS "kano_requests" DROP CONSTRAINT IF EXISTS "kano_requests_project_subproject_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "kano_requests_subproject_idx";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "subproject_id";
