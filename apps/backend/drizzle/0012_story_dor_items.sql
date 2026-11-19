CREATE TABLE "story_dor_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"story_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_dor_items_label_not_empty" CHECK (char_length(btrim("story_dor_items"."label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "story_dor_items" ADD CONSTRAINT "story_dor_items_story_id_user_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."user_stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_dor_items_story_idx" ON "story_dor_items" USING btree ("story_id","sort_order");