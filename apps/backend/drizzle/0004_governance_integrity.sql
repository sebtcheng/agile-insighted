-- Hand-written: things Drizzle cannot express for Phase 2.
-- Same-project integrity for the release link (column-list ON DELETE SET NULL, PG 15+):
-- deleting a release nulls release_id on activities and leaves project_id alone.
ALTER TABLE "activities"
  ADD CONSTRAINT "activities_project_release_fk"
  FOREIGN KEY ("project_id", "release_id") REFERENCES "releases" ("project_id", "id")
  ON DELETE SET NULL ("release_id");
--> statement-breakpoint
CREATE TRIGGER "releases_set_updated_at" BEFORE UPDATE ON "releases" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
