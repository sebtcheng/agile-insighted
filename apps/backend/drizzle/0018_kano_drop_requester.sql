-- Hand-edited generated migration (contract step): kano_requests loses requester_name and requester_role.
-- No column is added: description already exists (text NOT NULL) and is the request's Description field.
-- Every statement is guarded, so it is safe to re-run.
-- Rollback: restore from a backup taken before applying; the dropped values cannot be re-derived. To reshape
-- only, re-add requester_name text (backfill, then SET NOT NULL) and requester_role text from 0005.
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "requester_name";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "requester_role";
