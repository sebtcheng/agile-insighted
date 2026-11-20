ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "pm_approval" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "ost_solutions" ADD COLUMN IF NOT EXISTS "pm_approval" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "usm_step_features" ADD COLUMN IF NOT EXISTS "pm_approval" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "kano_request_specs" ADD COLUMN IF NOT EXISTS "pm_approval" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "raid_mitigating_actions" ADD COLUMN IF NOT EXISTS "pm_approval" text DEFAULT 'PENDING' NOT NULL;