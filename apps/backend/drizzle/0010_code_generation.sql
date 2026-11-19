CREATE SEQUENCE "public"."project_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "code_counters" DROP CONSTRAINT "code_counters_scope";--> statement-breakpoint
ALTER TABLE "code_counters" ADD CONSTRAINT "code_counters_scope" CHECK ("code_counters"."scope" IN ('ost', 'usm', 'req', 'raid', 'sub'));