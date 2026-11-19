-- Hand-edited migration (drizzle-kit needs a TTY to confirm a column rename, so it could not be generated here).
-- kano_requests.description is renamed to revision_request (data preserved, no table rewrite) and the
-- kano_request_specs checklist table is added. Every statement is guarded, so it is safe to re-run.
-- Existing requests simply start with zero specs (0%, not complete).
-- Rollback: DROP TABLE IF EXISTS "kano_request_specs"; then rename the column and its check back:
--   ALTER TABLE "kano_requests" RENAME COLUMN "revision_request" TO "description";
--   ALTER TABLE "kano_requests" RENAME CONSTRAINT "kano_requests_revision_request_not_empty" TO "kano_requests_description_not_empty";
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'kano_requests' AND column_name = 'description'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'kano_requests' AND column_name = 'revision_request'
  ) THEN
    ALTER TABLE "kano_requests" RENAME COLUMN "description" TO "revision_request";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kano_requests_description_not_empty'
      AND conrelid = to_regclass('kano_requests')
  ) THEN
    ALTER TABLE "kano_requests" RENAME CONSTRAINT "kano_requests_description_not_empty" TO "kano_requests_revision_request_not_empty";
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kano_request_specs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kano_request_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kano_request_specs_kano_request_id_kano_requests_id_fk" FOREIGN KEY ("kano_request_id") REFERENCES "kano_requests"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "kano_request_specs_label_not_empty" CHECK (char_length(btrim("kano_request_specs"."label")) > 0),
	CONSTRAINT "kano_request_specs_completed_at_matches" CHECK ("kano_request_specs"."is_completed" = ("kano_request_specs"."completed_at" IS NOT NULL))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kano_request_specs_request_idx" ON "kano_request_specs" USING btree ("kano_request_id","sort_order");
