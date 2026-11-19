-- Hand-edited generated migration (contract step): User Story Mapping moves from subproject to project scope,
-- like raid_items (0016) and kano_requests (0017). personas, journey_steps and user_stories already belong to a
-- project through project_id (NOT NULL FK to projects), so no column is added; every row is kept.
-- Backbone names were unique per subproject and are now unique per project, so any backbone name that would
-- collide once subprojects merge is suffixed with its subproject code first, e.g. "Onboarding (SUB-02)".
-- Every statement is guarded, so it is safe to re-run.
-- Rollback: restore from a backup taken before applying; which subproject a row belonged to cannot be re-derived.
-- To reshape only, re-add the nullable subproject_id columns, their indexes and the *_project_subproject_fk
-- composite FKs from 0006, and recreate journey_steps_scope_name_uq on (subproject_id, parent_step_id, name).
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'journey_steps' AND column_name = 'subproject_id'
	) THEN
		UPDATE "journey_steps" j
		SET "name" = j."name" || ' (' || coalesce(s."code", left(j."subproject_id"::text, 8)) || ')'
		FROM (
			SELECT "id", row_number() OVER (
				PARTITION BY "project_id", "parent_step_id", "name" ORDER BY "created_at", "id"
			) AS rn
			FROM "journey_steps"
		) d
		LEFT JOIN "journey_steps" js ON js."id" = d."id"
		LEFT JOIN "subprojects" s ON s."id" = js."subproject_id"
		WHERE d."id" = j."id" AND d.rn > 1;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "journey_steps" DROP CONSTRAINT IF EXISTS "journey_steps_scope_name_uq";--> statement-breakpoint
ALTER TABLE "journey_steps" DROP CONSTRAINT IF EXISTS "journey_steps_project_subproject_fk";--> statement-breakpoint
ALTER TABLE "personas" DROP CONSTRAINT IF EXISTS "personas_project_subproject_fk";--> statement-breakpoint
ALTER TABLE "user_stories" DROP CONSTRAINT IF EXISTS "user_stories_project_subproject_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "journey_steps_project_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "journey_steps_subproject_position_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "personas_subproject_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_stories_project_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_stories_subproject_status_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journey_steps_project_position_idx" ON "journey_steps" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_stories_project_status_idx" ON "user_stories" USING btree ("project_id","status");--> statement-breakpoint
ALTER TABLE "journey_steps" DROP COLUMN IF EXISTS "subproject_id";--> statement-breakpoint
ALTER TABLE "personas" DROP COLUMN IF EXISTS "subproject_id";--> statement-breakpoint
ALTER TABLE "user_stories" DROP COLUMN IF EXISTS "subproject_id";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_scope_name_uq" UNIQUE NULLS NOT DISTINCT("project_id","parent_step_id","name");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
