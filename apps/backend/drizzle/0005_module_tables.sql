CREATE TYPE "public"."assumption_category" AS ENUM('desirability', 'viability', 'usability', 'feasibility');--> statement-breakpoint
CREATE TYPE "public"."kano_category" AS ENUM('must_be', 'performance', 'attractive', 'indifferent', 'reverse');--> statement-breakpoint
CREATE TYPE "public"."kano_decision" AS ENUM('approve_mvp', 'prioritize_sprint', 'schedule_release', 'research_spike', 'deprioritize');--> statement-breakpoint
CREATE TYPE "public"."raid_status" AS ENUM('open', 'in_progress', 'mitigated', 'closed');--> statement-breakpoint
CREATE TYPE "public"."raid_type" AS ENUM('risk', 'assumption', 'issue', 'dependency');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('backlog', 'planning', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('planned', 'in_progress', 'validated', 'invalidated');--> statement-breakpoint
CREATE TABLE "code_counters" (
	"project_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "code_counters_project_id_scope_pk" PRIMARY KEY("project_id","scope"),
	CONSTRAINT "code_counters_scope" CHECK ("code_counters"."scope" IN ('ost', 'usm', 'req', 'raid')),
	CONSTRAINT "code_counters_last_value_nonneg" CHECK ("code_counters"."last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journey_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subproject_id" uuid NOT NULL,
	"parent_step_id" uuid,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "journey_steps_scope_name_uq" UNIQUE NULLS NOT DISTINCT("subproject_id","parent_step_id","name"),
	CONSTRAINT "journey_steps_name_not_empty" CHECK (char_length(btrim("journey_steps"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "kano_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subproject_id" uuid,
	"seq" integer NOT NULL,
	"code" text GENERATED ALWAYS AS ('REQ-' || repeat('0', greatest(3 - length(seq::text), 0)) || seq::text) STORED NOT NULL,
	"description" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_role" text,
	"kano_category" "kano_category",
	"decision" "kano_decision",
	"target_sprint_id" uuid,
	"target_release_id" uuid,
	"promoted_story_id" uuid,
	"wsjf_business_value" smallint,
	"wsjf_time_criticality" smallint,
	"wsjf_risk_reduction" smallint,
	"wsjf_job_size" smallint,
	"wsjf_score" numeric(6, 2) GENERATED ALWAYS AS (round((wsjf_business_value + wsjf_time_criticality + wsjf_risk_reduction)::numeric / wsjf_job_size, 2)) STORED,
	"rice_reach" integer,
	"rice_impact" numeric(4, 2),
	"rice_confidence" smallint,
	"rice_effort" numeric(8, 2),
	"rice_score" numeric(14, 2) GENERATED ALWAYS AS (round(rice_reach * rice_impact * (rice_confidence / 100.0) / rice_effort, 2)) STORED,
	CONSTRAINT "kano_requests_project_seq_uq" UNIQUE("project_id","seq"),
	CONSTRAINT "kano_requests_seq_positive" CHECK ("kano_requests"."seq" > 0),
	CONSTRAINT "kano_requests_description_not_empty" CHECK (char_length(btrim("kano_requests"."description")) > 0),
	CONSTRAINT "kano_requests_wsjf_inputs" CHECK (("kano_requests"."wsjf_business_value" IS NULL OR "kano_requests"."wsjf_business_value" IN (1, 2, 3, 5, 8, 13, 20))
        AND ("kano_requests"."wsjf_time_criticality" IS NULL OR "kano_requests"."wsjf_time_criticality" IN (1, 2, 3, 5, 8, 13, 20))
        AND ("kano_requests"."wsjf_risk_reduction" IS NULL OR "kano_requests"."wsjf_risk_reduction" IN (1, 2, 3, 5, 8, 13, 20))
        AND ("kano_requests"."wsjf_job_size" IS NULL OR "kano_requests"."wsjf_job_size" IN (1, 2, 3, 5, 8, 13, 20))),
	CONSTRAINT "kano_requests_rice_reach" CHECK ("kano_requests"."rice_reach" IS NULL OR "kano_requests"."rice_reach" >= 0),
	CONSTRAINT "kano_requests_rice_impact" CHECK ("kano_requests"."rice_impact" IS NULL OR "kano_requests"."rice_impact" IN (0.25, 0.5, 1, 2, 3)),
	CONSTRAINT "kano_requests_rice_confidence" CHECK ("kano_requests"."rice_confidence" IS NULL OR "kano_requests"."rice_confidence" BETWEEN 0 AND 100),
	CONSTRAINT "kano_requests_rice_effort" CHECK ("kano_requests"."rice_effort" IS NULL OR "kano_requests"."rice_effort" > 0)
);
--> statement-breakpoint
CREATE TABLE "ost_assumptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"solution_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"category" "assumption_category" NOT NULL,
	"is_riskiest" boolean DEFAULT false NOT NULL,
	"validation_test" text,
	"validation_status" "validation_status" DEFAULT 'planned' NOT NULL,
	"result_notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ost_assumptions_statement_not_empty" CHECK (char_length(btrim("ost_assumptions"."statement")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ost_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome_id" uuid NOT NULL,
	"parent_opportunity_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"evidence" text,
	"is_targeted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ost_opportunities_title_not_empty" CHECK (char_length(btrim("ost_opportunities"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ost_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subproject_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"metric_name" text,
	"baseline_value" numeric,
	"target_value" numeric,
	"target_date" date,
	CONSTRAINT "ost_outcomes_title_not_empty" CHECK (char_length(btrim("ost_outcomes"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ost_solutions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"code" text GENERATED ALWAYS AS ('OST-' || repeat('0', greatest(2 - length(seq::text), 0)) || seq::text) STORED NOT NULL,
	"title" text NOT NULL,
	"validation_status" "validation_status" DEFAULT 'planned' NOT NULL,
	"owner_id" uuid,
	"converted_story_id" uuid,
	CONSTRAINT "ost_solutions_project_seq_uq" UNIQUE("project_id","seq"),
	CONSTRAINT "ost_solutions_seq_positive" CHECK ("ost_solutions"."seq" > 0),
	CONSTRAINT "ost_solutions_title_not_empty" CHECK (char_length(btrim("ost_solutions"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subproject_id" uuid,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "personas_name_not_empty" CHECK (char_length(btrim("personas"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "raid_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subproject_id" uuid,
	"seq" integer NOT NULL,
	"code" text GENERATED ALWAYS AS ('RAID-' || repeat('0', greatest(2 - length(seq::text), 0)) || seq::text) STORED NOT NULL,
	"item_type" "raid_type" NOT NULL,
	"description" text NOT NULL,
	"impact" smallint NOT NULL,
	"likelihood" smallint,
	"severity_score" smallint GENERATED ALWAYS AS (impact * likelihood) STORED,
	"mitigating_action" text,
	"owner_id" uuid,
	"raised_by_id" uuid NOT NULL,
	"status" "raid_status" DEFAULT 'open' NOT NULL,
	"target_date" date,
	"closed_at" timestamp with time zone,
	CONSTRAINT "raid_items_project_seq_uq" UNIQUE("project_id","seq"),
	CONSTRAINT "raid_items_seq_positive" CHECK ("raid_items"."seq" > 0),
	CONSTRAINT "raid_items_description_not_empty" CHECK (char_length(btrim("raid_items"."description")) > 0),
	CONSTRAINT "raid_items_impact_range" CHECK ("raid_items"."impact" BETWEEN 1 AND 3),
	CONSTRAINT "raid_items_likelihood_range" CHECK ("raid_items"."likelihood" IS NULL OR "raid_items"."likelihood" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "user_stories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subproject_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"code" text GENERATED ALWAYS AS ('USM-' || repeat('0', greatest(2 - length(seq::text), 0)) || seq::text) STORED NOT NULL,
	"persona_id" uuid,
	"journey_step_id" uuid,
	"story" text NOT NULL,
	"acceptance_criteria" text,
	"work_type" "work_type" DEFAULT 'feature' NOT NULL,
	"release_id" uuid,
	"sprint_id" uuid,
	"story_points" smallint,
	"status" "story_status" DEFAULT 'backlog' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_stories_project_seq_uq" UNIQUE("project_id","seq"),
	CONSTRAINT "user_stories_seq_positive" CHECK ("user_stories"."seq" > 0),
	CONSTRAINT "user_stories_story_not_empty" CHECK (char_length(btrim("user_stories"."story")) > 0),
	CONSTRAINT "user_stories_points_allowed" CHECK ("user_stories"."story_points" IS NULL OR "user_stories"."story_points" IN (1, 2, 3, 5, 8, 13, 21))
);
--> statement-breakpoint
ALTER TABLE "checklist_checks" DROP CONSTRAINT "checklist_checks_activity_template_uq";--> statement-breakpoint
ALTER TABLE "checklist_checks" ALTER COLUMN "activity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "user_story_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "ost_assumption_id" uuid;--> statement-breakpoint
ALTER TABLE "checklist_checks" ADD COLUMN "story_id" uuid;--> statement-breakpoint
ALTER TABLE "code_counters" ADD CONSTRAINT "code_counters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_parent_step_id_journey_steps_id_fk" FOREIGN KEY ("parent_step_id") REFERENCES "public"."journey_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kano_requests" ADD CONSTRAINT "kano_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kano_requests" ADD CONSTRAINT "kano_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kano_requests" ADD CONSTRAINT "kano_requests_promoted_story_id_user_stories_id_fk" FOREIGN KEY ("promoted_story_id") REFERENCES "public"."user_stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_assumptions" ADD CONSTRAINT "ost_assumptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_assumptions" ADD CONSTRAINT "ost_assumptions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_assumptions" ADD CONSTRAINT "ost_assumptions_solution_id_ost_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."ost_solutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_opportunities" ADD CONSTRAINT "ost_opportunities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_opportunities" ADD CONSTRAINT "ost_opportunities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_opportunities" ADD CONSTRAINT "ost_opportunities_outcome_id_ost_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."ost_outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_opportunities" ADD CONSTRAINT "ost_opportunities_parent_opportunity_id_ost_opportunities_id_fk" FOREIGN KEY ("parent_opportunity_id") REFERENCES "public"."ost_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_outcomes" ADD CONSTRAINT "ost_outcomes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_outcomes" ADD CONSTRAINT "ost_outcomes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_solutions" ADD CONSTRAINT "ost_solutions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_solutions" ADD CONSTRAINT "ost_solutions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_solutions" ADD CONSTRAINT "ost_solutions_opportunity_id_ost_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ost_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_solutions" ADD CONSTRAINT "ost_solutions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ost_solutions" ADD CONSTRAINT "ost_solutions_converted_story_id_user_stories_id_fk" FOREIGN KEY ("converted_story_id") REFERENCES "public"."user_stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_items" ADD CONSTRAINT "raid_items_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_journey_step_id_journey_steps_id_fk" FOREIGN KEY ("journey_step_id") REFERENCES "public"."journey_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_steps_project_id_idx" ON "journey_steps" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "journey_steps_subproject_position_idx" ON "journey_steps" USING btree ("subproject_id","position");--> statement-breakpoint
CREATE INDEX "journey_steps_parent_idx" ON "journey_steps" USING btree ("parent_step_id");--> statement-breakpoint
CREATE INDEX "journey_steps_created_by_idx" ON "journey_steps" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "kano_requests_project_id_idx" ON "kano_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "kano_requests_subproject_idx" ON "kano_requests" USING btree ("subproject_id");--> statement-breakpoint
CREATE INDEX "kano_requests_category_idx" ON "kano_requests" USING btree ("kano_category");--> statement-breakpoint
CREATE INDEX "kano_requests_decision_idx" ON "kano_requests" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "kano_requests_wsjf_idx" ON "kano_requests" USING btree ("project_id","wsjf_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "kano_requests_target_sprint_idx" ON "kano_requests" USING btree ("target_sprint_id");--> statement-breakpoint
CREATE INDEX "kano_requests_target_release_idx" ON "kano_requests" USING btree ("target_release_id");--> statement-breakpoint
CREATE INDEX "kano_requests_promoted_story_idx" ON "kano_requests" USING btree ("promoted_story_id");--> statement-breakpoint
CREATE INDEX "kano_requests_created_by_idx" ON "kano_requests" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "ost_assumptions_project_id_idx" ON "ost_assumptions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ost_assumptions_solution_idx" ON "ost_assumptions" USING btree ("solution_id","position");--> statement-breakpoint
CREATE INDEX "ost_assumptions_created_by_idx" ON "ost_assumptions" USING btree ("created_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ost_assumptions_one_riskiest_per_solution" ON "ost_assumptions" USING btree ("solution_id") WHERE "ost_assumptions"."is_riskiest";--> statement-breakpoint
CREATE INDEX "ost_opportunities_project_id_idx" ON "ost_opportunities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ost_opportunities_outcome_id_idx" ON "ost_opportunities" USING btree ("outcome_id");--> statement-breakpoint
CREATE INDEX "ost_opportunities_parent_idx" ON "ost_opportunities" USING btree ("parent_opportunity_id");--> statement-breakpoint
CREATE INDEX "ost_opportunities_created_by_idx" ON "ost_opportunities" USING btree ("created_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ost_opportunities_one_targeted_per_outcome" ON "ost_opportunities" USING btree ("outcome_id") WHERE "ost_opportunities"."is_targeted";--> statement-breakpoint
CREATE INDEX "ost_outcomes_project_id_idx" ON "ost_outcomes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ost_outcomes_subproject_id_idx" ON "ost_outcomes" USING btree ("subproject_id");--> statement-breakpoint
CREATE INDEX "ost_outcomes_created_by_idx" ON "ost_outcomes" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "ost_solutions_project_id_idx" ON "ost_solutions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ost_solutions_opportunity_idx" ON "ost_solutions" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "ost_solutions_owner_idx" ON "ost_solutions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ost_solutions_converted_story_idx" ON "ost_solutions" USING btree ("converted_story_id");--> statement-breakpoint
CREATE INDEX "ost_solutions_created_by_idx" ON "ost_solutions" USING btree ("created_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personas_project_name_lower_uq" ON "personas" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE INDEX "personas_subproject_id_idx" ON "personas" USING btree ("subproject_id");--> statement-breakpoint
CREATE INDEX "personas_created_by_idx" ON "personas" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "raid_items_project_id_idx" ON "raid_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "raid_items_subproject_idx" ON "raid_items" USING btree ("subproject_id");--> statement-breakpoint
CREATE INDEX "raid_items_owner_idx" ON "raid_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "raid_items_raised_by_idx" ON "raid_items" USING btree ("raised_by_id");--> statement-breakpoint
CREATE INDEX "raid_items_created_by_idx" ON "raid_items" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "raid_items_open_target_idx" ON "raid_items" USING btree ("target_date") WHERE "raid_items"."status" <> 'closed';--> statement-breakpoint
CREATE INDEX "raid_items_type_status_idx" ON "raid_items" USING btree ("item_type","status");--> statement-breakpoint
CREATE INDEX "user_stories_project_id_idx" ON "user_stories" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "user_stories_subproject_status_idx" ON "user_stories" USING btree ("subproject_id","status");--> statement-breakpoint
CREATE INDEX "user_stories_persona_idx" ON "user_stories" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "user_stories_journey_step_idx" ON "user_stories" USING btree ("journey_step_id");--> statement-breakpoint
CREATE INDEX "user_stories_sprint_idx" ON "user_stories" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "user_stories_release_idx" ON "user_stories" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "user_stories_created_by_idx" ON "user_stories" USING btree ("created_by_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_story_id_user_stories_id_fk" FOREIGN KEY ("user_story_id") REFERENCES "public"."user_stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_ost_assumption_id_ost_assumptions_id_fk" FOREIGN KEY ("ost_assumption_id") REFERENCES "public"."ost_assumptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_checks" ADD CONSTRAINT "checklist_checks_story_id_user_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."user_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_story_id_idx" ON "activities" USING btree ("user_story_id");--> statement-breakpoint
CREATE INDEX "activities_ost_assumption_id_idx" ON "activities" USING btree ("ost_assumption_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_checks_activity_template_uq" ON "checklist_checks" USING btree ("activity_id","template_id") WHERE "checklist_checks"."activity_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_checks_story_template_uq" ON "checklist_checks" USING btree ("story_id","template_id") WHERE "checklist_checks"."story_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "checklist_checks_activity_idx" ON "checklist_checks" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "checklist_checks_story_idx" ON "checklist_checks" USING btree ("story_id");--> statement-breakpoint
ALTER TABLE "checklist_checks" ADD CONSTRAINT "checklist_checks_one_target" CHECK (num_nonnulls("checklist_checks"."story_id", "checklist_checks"."activity_id") = 1);