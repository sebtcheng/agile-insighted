-- Hand-written: things Drizzle cannot express.
-- 1) Same-project integrity via composite foreign keys with column-list ON DELETE SET NULL (PG 15+).
--    MATCH SIMPLE means a NULL subproject_id / sprint_id skips the check, so the optional link stays optional.
ALTER TABLE "sprints"
  ADD CONSTRAINT "sprints_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id")
  ON DELETE SET NULL ("subproject_id");
--> statement-breakpoint
ALTER TABLE "activities"
  ADD CONSTRAINT "activities_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id")
  ON DELETE SET NULL ("subproject_id");
--> statement-breakpoint
ALTER TABLE "activities"
  ADD CONSTRAINT "activities_project_sprint_fk"
  FOREIGN KEY ("project_id", "sprint_id") REFERENCES "sprints" ("project_id", "id")
  ON DELETE SET NULL ("sprint_id");
--> statement-breakpoint
-- 2) updated_at maintained by trigger.
CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "projects_set_updated_at" BEFORE UPDATE ON "projects" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "subprojects_set_updated_at" BEFORE UPDATE ON "subprojects" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "sprints_set_updated_at" BEFORE UPDATE ON "sprints" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "activities_set_updated_at" BEFORE UPDATE ON "activities" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
