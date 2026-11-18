CREATE TYPE "public"."activity_event_type" AS ENUM('status_changed', 'blocked', 'unblocked', 'sprint_changed', 'assigned');--> statement-breakpoint
CREATE TYPE "public"."activity_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('todo', 'in_progress', 'in_review', 'done');--> statement-breakpoint
CREATE TYPE "public"."health" AS ENUM('on_track', 'at_risk', 'off_track');--> statement-breakpoint
CREATE TYPE "public"."sprint_status" AS ENUM('planning', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."track" AS ENUM('discovery', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('pm', 'team_member');--> statement-breakpoint
CREATE TYPE "public"."work_type" AS ENUM('feature', 'defect', 'risk', 'debt', 'enabler');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"subproject_id" uuid,
	"sprint_id" uuid,
	"assignee_id" uuid,
	"created_by_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "activity_status" DEFAULT 'todo' NOT NULL,
	"priority" "activity_priority" DEFAULT 'medium' NOT NULL,
	"work_type" "work_type" DEFAULT 'feature' NOT NULL,
	"track" "track" DEFAULT 'delivery' NOT NULL,
	"percent_complete" smallint DEFAULT 0 NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"due_date" date,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_percent_range" CHECK ("activities"."percent_complete" BETWEEN 0 AND 100),
	CONSTRAINT "activities_done_is_100" CHECK ("activities"."status" <> 'done' OR "activities"."percent_complete" = 100),
	CONSTRAINT "activities_done_has_completed_at" CHECK (("activities"."status" = 'done') = ("activities"."completed_at" IS NOT NULL)),
	CONSTRAINT "activities_blocked_has_reason" CHECK (NOT "activities"."is_blocked" OR "activities"."blocked_reason" IS NOT NULL),
	CONSTRAINT "activities_started_after_todo" CHECK ("activities"."status" = 'todo' OR "activities"."started_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "activity_comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"activity_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_comments_body_not_empty" CHECK (char_length(btrim("activity_comments"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"activity_id" uuid NOT NULL,
	"event_type" "activity_event_type" NOT NULL,
	"from_value" text,
	"to_value" text,
	"note" text,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_tags" (
	"activity_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "activity_tags_activity_id_tag_id_pk" PRIMARY KEY("activity_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"wip_limit_per_person" smallint DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "projects_wip_limit_positive" CHECK ("projects"."wip_limit_per_person" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"subproject_id" uuid,
	"name" text NOT NULL,
	"goal" text,
	"capacity_items" smallint,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "sprint_status" DEFAULT 'planning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprints_project_name_uq" UNIQUE("project_id","name"),
	CONSTRAINT "sprints_project_id_id_uq" UNIQUE("project_id","id"),
	CONSTRAINT "sprints_dates_ordered" CHECK ("sprints"."end_date" >= "sprints"."start_date")
);
--> statement-breakpoint
CREATE TABLE "subprojects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lead_id" uuid,
	"health" "health" DEFAULT 'on_track' NOT NULL,
	"health_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "subprojects_project_code_uq" UNIQUE("project_id","code"),
	CONSTRAINT "subprojects_project_id_id_uq" UNIQUE("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"color_code" text DEFAULT '#64748B' NOT NULL,
	CONSTRAINT "tags_color_hex" CHECK ("tags"."color_code" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'team_member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_tags" ADD CONSTRAINT "activity_tags_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_tags" ADD CONSTRAINT "activity_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subprojects" ADD CONSTRAINT "subprojects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subprojects" ADD CONSTRAINT "subprojects_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_project_id_idx" ON "activities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "activities_subproject_id_idx" ON "activities" USING btree ("subproject_id");--> statement-breakpoint
CREATE INDEX "activities_sprint_id_idx" ON "activities" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "activities_assignee_id_idx" ON "activities" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "activities_created_by_id_idx" ON "activities" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "activities_assignee_due_open_idx" ON "activities" USING btree ("assignee_id","due_date") WHERE "activities"."status" <> 'done' AND "activities"."due_date" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_due_open_idx" ON "activities" USING btree ("due_date") WHERE "activities"."status" <> 'done' AND "activities"."due_date" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_completed_at_idx" ON "activities" USING btree ("completed_at") WHERE "activities"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_assignee_wip_idx" ON "activities" USING btree ("assignee_id") WHERE "activities"."status" IN ('in_progress','in_review');--> statement-breakpoint
CREATE INDEX "activities_subproject_blocked_idx" ON "activities" USING btree ("subproject_id") WHERE "activities"."is_blocked";--> statement-breakpoint
CREATE INDEX "activities_project_created_idx" ON "activities" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "activity_comments_activity_idx" ON "activity_comments" USING btree ("activity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_comments_author_id_idx" ON "activity_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "activity_events_activity_idx" ON "activity_events" USING btree ("activity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_type_idx" ON "activity_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_actor_id_idx" ON "activity_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "activity_tags_tag_idx" ON "activity_tags" USING btree ("tag_id","activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_lower_uq" ON "projects" USING btree (lower("code"));--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sprints_subproject_id_idx" ON "sprints" USING btree ("subproject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_one_active_per_scope" ON "sprints" USING btree ("project_id",coalesce("subproject_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "sprints"."status" = 'active';--> statement-breakpoint
CREATE INDEX "subprojects_lead_id_idx" ON "subprojects" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_uq" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));