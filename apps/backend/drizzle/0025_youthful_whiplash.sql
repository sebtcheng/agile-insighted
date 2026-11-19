-- Hand-edited generated migration: guarded so it is safe to re-run. Existing Kano requests are untouched
-- (responsible_id is nullable, like raid_items.owner_id). Rollback: DROP INDEX IF EXISTS "kano_requests_responsible_idx"; ALTER TABLE "kano_requests" DROP COLUMN IF EXISTS "responsible_id";
ALTER TABLE "kano_requests" ADD COLUMN IF NOT EXISTS "responsible_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kano_requests" ADD CONSTRAINT "kano_requests_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kano_requests_responsible_idx" ON "kano_requests" USING btree ("responsible_id");
