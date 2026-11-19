-- Hand-edited generated migration (contract step): kano_requests loses target_sprint_id and target_release_id.
-- Guarded so it is safe to re-run. Dropping the columns also drops their composite FKs to sprints/releases.
-- DESTRUCTIVE: existing sprint/release plans on Kano requests are lost. Rollback: restore from backup, or re-add the
-- nullable uuid columns from migrations 0005/0006 (values stay empty).
DROP INDEX IF EXISTS "kano_requests_target_sprint_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "kano_requests_target_release_idx";--> statement-breakpoint
ALTER TABLE "kano_requests" DROP COLUMN IF EXISTS "target_sprint_id";--> statement-breakpoint
ALTER TABLE "kano_requests" DROP COLUMN IF EXISTS "target_release_id";
