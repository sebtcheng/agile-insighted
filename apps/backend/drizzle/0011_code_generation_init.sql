-- Hand-written: starts the generated-code counters strictly above every existing code. Existing codes are never changed.
-- Safe to re-run: counters and the sequence only ever move up, never down.
-- Rollback: DELETE FROM code_counters WHERE scope = 'sub'; (the sequence and constraint are removed by reverting 0010).

-- Subprojects: per-project counter ('sub'), format PRJ-NN. Start past the highest existing PRJ-<number>.
INSERT INTO "code_counters" ("project_id", "scope", "last_value")
SELECT s."project_id", 'sub', max(substring(s."code" from '^PRJ-(\d+)$')::int)
FROM "subprojects" s
WHERE s."code" ~ '^PRJ-\d{1,9}$'
GROUP BY s."project_id"
ON CONFLICT ("project_id", "scope")
DO UPDATE SET "last_value" = greatest("code_counters"."last_value", excluded."last_value");
--> statement-breakpoint
-- Projects: global sequence, format PROJ-NN. Start past the highest existing PROJ-<number>.
DO $$
DECLARE
  highest integer;
  cur bigint;
  called boolean;
BEGIN
  SELECT coalesce(max(substring("code" from '^PROJ-(\d+)$')::int), 0) INTO highest
  FROM "projects" WHERE "code" ~ '^PROJ-\d{1,9}$';
  SELECT last_value, is_called INTO cur, called FROM "project_code_seq";
  IF highest > (CASE WHEN called THEN cur ELSE 0 END) THEN
    PERFORM setval('project_code_seq', highest, true);
  END IF;
END $$;
