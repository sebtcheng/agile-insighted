-- Hand-written (Phase 3): trigram search. pg_trgm is a "trusted" extension, so the database owner can install it.
-- GIN trigram indexes serve ILIKE '%term%' and the similarity operator (%) on these columns.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "activities_title_trgm_idx" ON "activities" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "subprojects_name_trgm_idx" ON "subprojects" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "subprojects_code_trgm_idx" ON "subprojects" USING gin ("code" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "users_full_name_trgm_idx" ON "users" USING gin ("full_name" gin_trgm_ops);
