ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_wip_limit_positive";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "wip_limit_per_person";
