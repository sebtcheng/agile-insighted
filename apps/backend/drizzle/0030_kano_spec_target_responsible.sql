ALTER TABLE "kano_request_specs" ADD COLUMN IF NOT EXISTS "target_date" date;--> statement-breakpoint
ALTER TABLE "kano_request_specs" ADD COLUMN IF NOT EXISTS "responsible_id" uuid;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "kano_request_specs" ADD CONSTRAINT "kano_request_specs_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kano_request_specs_responsible_idx" ON "kano_request_specs" USING btree ("responsible_id");--> statement-breakpoint
-- Backfill: the old request-level date moves onto specs that have none. Never overwrites a spec date. kano_requests.target_date stays (deprecated, not dropped).
UPDATE "kano_request_specs" s SET "target_date" = r."target_date"
FROM "kano_requests" r
WHERE s."kano_request_id" = r."id" AND s."target_date" IS NULL AND r."target_date" IS NOT NULL;
