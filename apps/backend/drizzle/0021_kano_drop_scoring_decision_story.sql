-- Hand-edited generated migration (contract step): kano_requests loses WSJF, RICE, Decision and Story.
-- Dropped: decision, promoted_story_id (+ FK to user_stories and its index), wsjf_* inputs and wsjf_score,
-- rice_* inputs and rice_score, the wsjf/rice check constraints and indexes, and the kano_decision enum.
-- The generated scores (wsjf_score, rice_score) go first because they depend on the input columns.
-- Every statement is guarded, so it is safe to re-run. Dropping a column also drops its constraints and indexes.
-- DESTRUCTIVE: the dropped values (scores, decisions, promoted-story links) cannot be re-derived.
-- User stories already created by promotion are untouched; only the request-to-story link is lost.
-- Rollback: restore from a backup taken before applying. To reshape only, re-add the columns from migrations
-- 0005/0007 (nullable) and re-create the kano_decision enum; values stay empty.
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "wsjf_score";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "rice_score";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "wsjf_business_value";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "wsjf_time_criticality";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "wsjf_risk_reduction";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "wsjf_job_size";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "rice_reach";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "rice_impact";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "rice_confidence";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "rice_effort";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "promoted_story_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "kano_requests" DROP COLUMN IF EXISTS "decision";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."kano_decision";
