-- Hand-written: things Drizzle cannot express for the module data layer (Phase 4).
-- 1) Same-project integrity via composite foreign keys, named <table>_project_<column>_fk.
--    Optional links use column-list ON DELETE SET NULL (PG 15+). The two NOT NULL subproject links
--    (journey_steps, user_stories) use ON DELETE RESTRICT instead: subprojects are archived, not deleted,
--    and a delete must never wipe or half-null a story map.
ALTER TABLE "ost_outcomes" ADD CONSTRAINT "ost_outcomes_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id") ON DELETE SET NULL ("subproject_id");
--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id") ON DELETE SET NULL ("subproject_id");
--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_project_sprint_fk"
  FOREIGN KEY ("project_id", "sprint_id") REFERENCES "sprints" ("project_id", "id") ON DELETE SET NULL ("sprint_id");
--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_project_release_fk"
  FOREIGN KEY ("project_id", "release_id") REFERENCES "releases" ("project_id", "id") ON DELETE SET NULL ("release_id");
--> statement-breakpoint
ALTER TABLE "kano_requests" ADD CONSTRAINT "kano_requests_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id") ON DELETE SET NULL ("subproject_id");
--> statement-breakpoint
ALTER TABLE "kano_requests" ADD CONSTRAINT "kano_requests_project_target_sprint_fk"
  FOREIGN KEY ("project_id", "target_sprint_id") REFERENCES "sprints" ("project_id", "id") ON DELETE SET NULL ("target_sprint_id");
--> statement-breakpoint
ALTER TABLE "kano_requests" ADD CONSTRAINT "kano_requests_project_target_release_fk"
  FOREIGN KEY ("project_id", "target_release_id") REFERENCES "releases" ("project_id", "id") ON DELETE SET NULL ("target_release_id");
--> statement-breakpoint
ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_project_subproject_fk"
  FOREIGN KEY ("project_id", "subproject_id") REFERENCES "subprojects" ("project_id", "id") ON DELETE SET NULL ("subproject_id");
--> statement-breakpoint
-- 2) updated_at maintained by trigger.
CREATE TRIGGER "ost_outcomes_set_updated_at" BEFORE UPDATE ON "ost_outcomes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "ost_opportunities_set_updated_at" BEFORE UPDATE ON "ost_opportunities" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "ost_solutions_set_updated_at" BEFORE UPDATE ON "ost_solutions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "ost_assumptions_set_updated_at" BEFORE UPDATE ON "ost_assumptions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "personas_set_updated_at" BEFORE UPDATE ON "personas" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "journey_steps_set_updated_at" BEFORE UPDATE ON "journey_steps" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "user_stories_set_updated_at" BEFORE UPDATE ON "user_stories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "kano_requests_set_updated_at" BEFORE UPDATE ON "kano_requests" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER "raid_items_set_updated_at" BEFORE UPDATE ON "raid_items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
