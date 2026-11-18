CREATE TYPE "public"."checklist_kind" AS ENUM('ready', 'done');--> statement-breakpoint
CREATE TYPE "public"."gate" AS ENUM('dor', 'dod', 'validation', 'scope_change');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('planned', 'released');--> statement-breakpoint
CREATE TABLE "activity_dependencies" (
	"blocked_activity_id" uuid NOT NULL,
	"blocking_activity_id" uuid NOT NULL,
	CONSTRAINT "activity_dependencies_blocked_activity_id_blocking_activity_id_pk" PRIMARY KEY("blocked_activity_id","blocking_activity_id"),
	CONSTRAINT "activity_dependencies_distinct" CHECK ("activity_dependencies"."blocked_activity_id" <> "activity_dependencies"."blocking_activity_id")
);
--> statement-breakpoint
CREATE TABLE "checklist_checks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"template_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"checked_by_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_checks_activity_template_uq" UNIQUE("activity_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "checklist_kind" NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "checklist_templates_label_not_empty" CHECK (char_length(btrim("checklist_templates"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "gate_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"gate" "gate" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gate_overrides_reason_not_empty" CHECK (char_length(btrim("gate_overrides"."reason")) > 0),
	CONSTRAINT "gate_overrides_entity_type" CHECK ("gate_overrides"."entity_type" IN ('story', 'activity', 'solution'))
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "release_status" DEFAULT 'planned' NOT NULL,
	"is_mvp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_project_name_uq" UNIQUE("project_id","name"),
	CONSTRAINT "releases_project_id_id_uq" UNIQUE("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "sprint_member_capacity" (
	"sprint_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"capacity_items" smallint NOT NULL,
	CONSTRAINT "sprint_member_capacity_sprint_id_user_id_pk" PRIMARY KEY("sprint_id","user_id"),
	CONSTRAINT "sprint_member_capacity_nonneg" CHECK ("sprint_member_capacity"."capacity_items" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sprint_scope_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"sprint_id" uuid NOT NULL,
	"added_activity_id" uuid NOT NULL,
	"removed_activity_id" uuid,
	"reason" text NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"approved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprint_scope_changes_reason_not_empty" CHECK (char_length(btrim("sprint_scope_changes"."reason")) > 0),
	CONSTRAINT "sprint_scope_changes_distinct" CHECK ("sprint_scope_changes"."removed_activity_id" IS NULL OR "sprint_scope_changes"."added_activity_id" <> "sprint_scope_changes"."removed_activity_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "release_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_dependencies" ADD CONSTRAINT "activity_dependencies_blocked_activity_id_activities_id_fk" FOREIGN KEY ("blocked_activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_dependencies" ADD CONSTRAINT "activity_dependencies_blocking_activity_id_activities_id_fk" FOREIGN KEY ("blocking_activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_checks" ADD CONSTRAINT "checklist_checks_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_checks" ADD CONSTRAINT "checklist_checks_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_checks" ADD CONSTRAINT "checklist_checks_checked_by_id_users_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_overrides" ADD CONSTRAINT "gate_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_member_capacity" ADD CONSTRAINT "sprint_member_capacity_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_member_capacity" ADD CONSTRAINT "sprint_member_capacity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_changes" ADD CONSTRAINT "sprint_scope_changes_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_changes" ADD CONSTRAINT "sprint_scope_changes_added_activity_id_activities_id_fk" FOREIGN KEY ("added_activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_changes" ADD CONSTRAINT "sprint_scope_changes_removed_activity_id_activities_id_fk" FOREIGN KEY ("removed_activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_changes" ADD CONSTRAINT "sprint_scope_changes_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_scope_changes" ADD CONSTRAINT "sprint_scope_changes_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_dependencies_blocking_idx" ON "activity_dependencies" USING btree ("blocking_activity_id");--> statement-breakpoint
CREATE INDEX "checklist_checks_template_idx" ON "checklist_checks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "checklist_checks_checked_by_idx" ON "checklist_checks" USING btree ("checked_by_id");--> statement-breakpoint
CREATE INDEX "checklist_templates_project_kind_pos_idx" ON "checklist_templates" USING btree ("project_id","kind","position");--> statement-breakpoint
CREATE INDEX "gate_overrides_entity_idx" ON "gate_overrides" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "gate_overrides_user_idx" ON "gate_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_one_mvp_per_project" ON "releases" USING btree ("project_id") WHERE "releases"."is_mvp";--> statement-breakpoint
CREATE INDEX "releases_project_position_idx" ON "releases" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "sprint_member_capacity_user_idx" ON "sprint_member_capacity" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sprint_scope_changes_sprint_idx" ON "sprint_scope_changes" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "sprint_scope_changes_added_idx" ON "sprint_scope_changes" USING btree ("added_activity_id");--> statement-breakpoint
CREATE INDEX "sprint_scope_changes_removed_idx" ON "sprint_scope_changes" USING btree ("removed_activity_id");--> statement-breakpoint
CREATE INDEX "sprint_scope_changes_requested_by_idx" ON "sprint_scope_changes" USING btree ("requested_by_id");--> statement-breakpoint
CREATE INDEX "sprint_scope_changes_approved_by_idx" ON "sprint_scope_changes" USING btree ("approved_by_id");--> statement-breakpoint
CREATE INDEX "activities_release_id_idx" ON "activities" USING btree ("release_id");