CREATE TABLE "raid_mitigating_actions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"raid_item_id" uuid NOT NULL,
	"description" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raid_mitigating_actions_description_not_empty" CHECK (char_length(btrim("raid_mitigating_actions"."description")) > 0),
	CONSTRAINT "raid_mitigating_actions_completed_at_matches" CHECK ("raid_mitigating_actions"."is_completed" = ("raid_mitigating_actions"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "raid_mitigating_actions" ADD CONSTRAINT "raid_mitigating_actions_raid_item_id_raid_items_id_fk" FOREIGN KEY ("raid_item_id") REFERENCES "public"."raid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raid_mitigating_actions_raid_item_idx" ON "raid_mitigating_actions" USING btree ("raid_item_id","sort_order");