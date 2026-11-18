import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { env } from "../env";
import { logger } from "../logger";
import { db, pool } from "./client";

/**
 * Performance seed: about 50,000 activities (default) across the existing users and subprojects, with matching
 * events and a few hundred dependencies. Local development only. Rows are tagged by a "PERF " title prefix so
 * PERF_RESET=1 can remove exactly them. Needs the normal seed (`npm run db:seed`) to have run first.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertLocalDatabase(): void {
  if (env.NODE_ENV === "production") throw new Error("Refusing to run the perf seed in production");
  const host = new URL(env.DATABASE_URL).hostname;
  if (!LOCAL_HOSTS.has(host))
    throw new Error("Refusing to run the perf seed against a non-local database");
}

export async function seedPerf(count: number): Promise<void> {
  assertLocalDatabase();
  const n = Math.max(1, Math.floor(count));

  const [base] = (
    await db.execute<{ project_id: string; pm_id: string }>(sql`
      SELECT p.id AS project_id, p.owner_id AS pm_id FROM projects p WHERE p.archived_at IS NULL ORDER BY p.created_at LIMIT 1`)
  ).rows;
  if (!base) throw new Error("Run `npm run db:seed` first: no project found");

  // Activities. Every distribution is derived from hashtext(g), so reruns look the same and every CHECK holds:
  // done rows have percent 100, started_at and completed_at; todo rows have neither; blocked rows have a reason.
  await db.execute(sql`
    WITH ctx AS (
      SELECT ${base.project_id}::uuid AS project_id, ${base.pm_id}::uuid AS pm_id,
             (SELECT array_agg(id ORDER BY code) FROM subprojects WHERE project_id = ${base.project_id}::uuid AND archived_at IS NULL) AS subs,
             (SELECT array_agg(id ORDER BY full_name) FROM users WHERE is_active AND role = 'team_member') AS people,
             (SELECT id FROM sprints WHERE project_id = ${base.project_id}::uuid AND status = 'active' AND subproject_id IS NULL LIMIT 1) AS active_sprint,
             (SELECT id FROM sprints WHERE project_id = ${base.project_id}::uuid AND status = 'completed' AND subproject_id IS NULL ORDER BY end_date LIMIT 1) AS old_sprint
    ), gen AS (
      SELECT g,
             abs(hashtext(g::text || 's')) % 100 AS roll_status,
             abs(hashtext(g::text || 'p')) % 4 AS roll_priority,
             abs(hashtext(g::text || 'w')) % 5 AS roll_type,
             abs(hashtext(g::text || 'd')) % 100 AS roll_due,
             abs(hashtext(g::text || 'c')) % 400 AS age_days,
             abs(hashtext(g::text || 'l')) % 20 AS cycle_days,
             abs(hashtext(g::text || 'b')) % 100 AS roll_block,
             abs(hashtext(g::text || 'x')) % 100 AS roll_sprint
      FROM generate_series(1, ${n}) AS g
    ), shaped AS (
      SELECT gen.*, ctx.*,
             CASE WHEN roll_status < 70 THEN 'done' WHEN roll_status < 78 THEN 'todo'
                  WHEN roll_status < 90 THEN 'in_progress' ELSE 'in_review' END AS status,
             now() - make_interval(days => age_days) AS created
      FROM gen CROSS JOIN ctx
    )
    INSERT INTO activities (project_id, subproject_id, sprint_id, assignee_id, created_by_id, title, description,
      status, priority, work_type, track, percent_complete, is_blocked, blocked_reason, due_date,
      started_at, completed_at, created_at, updated_at)
    SELECT project_id,
           subs[1 + abs(hashtext(g::text || 'u')) % array_length(subs, 1)],
           CASE WHEN roll_sprint < 5 THEN active_sprint WHEN roll_sprint < 15 THEN old_sprint ELSE NULL END,
           CASE WHEN roll_status % 13 = 0 THEN NULL ELSE people[1 + abs(hashtext(g::text || 'a')) % array_length(people, 1)] END,
           pm_id,
           'PERF ' || g || ' ' || (ARRAY['Improve','Build','Fix','Review','Document','Refactor','Validate','Prototype'])[1 + roll_priority + roll_type] || ' '
             || (ARRAY['engagement dashboard','roster import','feedback template','risk indicator','notification digest','lesson editor','data export','single sign-on'])[1 + abs(hashtext(g::text || 't')) % 8],
           NULL,
           status::activity_status,
           (ARRAY['low','medium','high','urgent'])[1 + roll_priority]::activity_priority,
           (ARRAY['feature','defect','risk','debt','enabler'])[1 + roll_type]::work_type,
           CASE WHEN g % 4 = 1 THEN 'discovery' ELSE 'delivery' END::track,
           CASE status WHEN 'done' THEN 100 WHEN 'todo' THEN 0 ELSE 20 + roll_due % 60 END,
           (status IN ('in_progress', 'in_review') AND roll_block < 3),
           CASE WHEN status IN ('in_progress', 'in_review') AND roll_block < 3 THEN 'Waiting on another team' END,
           CASE WHEN roll_due < 55 THEN (current_date - 120 + (abs(hashtext(g::text || 'e')) % 190))::date END,
           CASE WHEN status = 'todo' THEN NULL ELSE created + interval '1 day' END,
           CASE WHEN status = 'done' THEN LEAST(created + make_interval(days => 1 + cycle_days), now()) END,
           created,
           created
    FROM shaped`);

  // Events that match the activities' state: leaving todo, finishing, and blocking.
  await db.execute(sql`
    INSERT INTO activity_events (activity_id, event_type, from_value, to_value, note, actor_id, occurred_at)
    SELECT a.id, 'status_changed', 'todo', 'in_progress', NULL, a.created_by_id, a.started_at
    FROM activities a WHERE a.title LIKE 'PERF %' AND a.started_at IS NOT NULL`);
  await db.execute(sql`
    INSERT INTO activity_events (activity_id, event_type, from_value, to_value, note, actor_id, occurred_at)
    SELECT a.id, 'status_changed', 'in_progress', 'done', NULL, a.created_by_id, a.completed_at
    FROM activities a WHERE a.title LIKE 'PERF %' AND a.completed_at IS NOT NULL`);
  await db.execute(sql`
    INSERT INTO activity_events (activity_id, event_type, from_value, to_value, note, actor_id, occurred_at)
    SELECT a.id, 'blocked', NULL, NULL, a.blocked_reason, a.created_by_id, a.started_at + interval '1 day'
    FROM activities a WHERE a.title LIKE 'PERF %' AND a.is_blocked`);

  // A few hundred dependencies, always from one activity to the next in title order, so they can never form a cycle.
  await db.execute(sql`
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY title, id) AS rn FROM activities WHERE title LIKE 'PERF %'
    )
    INSERT INTO activity_dependencies (blocked_activity_id, blocking_activity_id)
    SELECT a.id, b.id FROM ordered a JOIN ordered b ON b.rn = a.rn + 1
    WHERE a.rn % 150 = 0 ON CONFLICT DO NOTHING`);

  // Fresh statistics and a populated visibility map, so plans reflect a settled database.
  await db.execute(sql`VACUUM (ANALYZE) activities`);
  await db.execute(sql`VACUUM (ANALYZE) activity_events`);
  await db.execute(sql`VACUUM (ANALYZE) activity_dependencies`);
  logger.info({ activities: n }, "perf seed complete");
}

export async function resetPerf(): Promise<number> {
  assertLocalDatabase();
  const res = await db.execute(sql`DELETE FROM activities WHERE title LIKE 'PERF %'`);
  return res.rowCount ?? 0;
}

async function main(): Promise<void> {
  assertLocalDatabase();
  if (process.env.PERF_RESET === "1") {
    logger.warn({ removed: await resetPerf() }, "removed previous perf rows (PERF_RESET=1)");
  }
  const count = process.env.PERF_COUNT ? Number(process.env.PERF_COUNT) : 50_000;
  // PERF_COUNT=0 with PERF_RESET=1 only removes the perf rows.
  if (count > 0) await seedPerf(count);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, "perf seed failed");
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
