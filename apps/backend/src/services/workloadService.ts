import { and, asc, eq, ne } from "drizzle-orm";
import { sql, type SQL } from "drizzle-orm";
import type { WorkloadResponse, WorkloadRow } from "@myapp/shared";
import { db } from "../db/client";
import { activities, subprojects } from "../db/schema";
import { env } from "../env";
import { homeRanges, localDate } from "./dateBuckets";
import { WAITING_CTE_BODY } from "./portfolioService";

type Row = {
  user_id: string;
  full_name: string;
  in_progress: number;
  due_week: number;
  blocked: number;
  waiting: number;
  sprint_id: string | null;
  sprint_name: string | null;
  sprint_assigned: number;
  sprint_capacity: number | null;
  wip_limit: number;
};

/**
 * Load and capacity per active person across all subprojects. It shows counts against limits only:
 * it never ranks people or computes an output score, and rows are ordered alphabetically.
 */
export function workloadSql(
  weekStart: string,
  weekEnd: string,
  projectId: string | null = null,
): SQL {
  // projectId scopes the WIP limit and active sprint to one project; null means the oldest open project.
  return sql`
    WITH ${WAITING_CTE_BODY},
    cfg AS (
      SELECT (SELECT wip_limit_per_person FROM projects
              WHERE archived_at IS NULL AND (${projectId}::uuid IS NULL OR id = ${projectId}::uuid)
              ORDER BY created_at LIMIT 1) AS wip_limit,
             sp.id AS sprint_id, sp.name AS sprint_name
      FROM (SELECT 1) one
      LEFT JOIN LATERAL (
        SELECT s.id, s.name FROM sprints s JOIN projects p ON p.id = s.project_id AND p.archived_at IS NULL
        WHERE s.status = 'active' AND s.subproject_id IS NULL
          AND (${projectId}::uuid IS NULL OR p.id = ${projectId}::uuid)
        ORDER BY s.end_date LIMIT 1
      ) sp ON true
    )
    SELECT u.id AS user_id, u.full_name,
           a.in_progress, a.due_week, a.blocked, a.waiting, a.sprint_assigned,
           cfg.sprint_id, cfg.sprint_name, cap.capacity_items AS sprint_capacity,
           COALESCE(cfg.wip_limit, 0)::int AS wip_limit
    FROM users u
    CROSS JOIN cfg
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE x.status = 'in_progress')::int AS in_progress,
             count(*) FILTER (WHERE x.due_date BETWEEN ${weekStart}::date AND ${weekEnd}::date)::int AS due_week,
             count(*) FILTER (WHERE x.is_blocked)::int AS blocked,
             count(*) FILTER (WHERE w.blocked_activity_id IS NOT NULL)::int AS waiting,
             count(*) FILTER (WHERE cfg.sprint_id IS NOT NULL AND x.sprint_id = cfg.sprint_id)::int AS sprint_assigned
      FROM activities x
      LEFT JOIN waiting w ON w.blocked_activity_id = x.id
      WHERE x.assignee_id = u.id AND x.status <> 'done'
    ) a
    LEFT JOIN sprint_member_capacity cap ON cap.sprint_id = cfg.sprint_id AND cap.user_id = u.id
    WHERE u.is_active
    ORDER BY u.full_name, u.id`;
}

export async function getWorkload(
  opts: { now?: Date; projectId?: string } = {},
): Promise<WorkloadResponse> {
  const r = homeRanges(localDate(opts.now ?? new Date(), env.APP_TIMEZONE));
  const res = await db.execute<Row>(workloadSql(r.weekStart, r.weekEnd, opts.projectId ?? null));
  const items: WorkloadRow[] = res.rows.map((x) => ({
    userId: x.user_id,
    fullName: x.full_name,
    inProgress: x.in_progress,
    wipLimit: x.wip_limit,
    overWipLimit: x.wip_limit > 0 && x.in_progress > x.wip_limit,
    dueThisWeek: x.due_week,
    blocked: x.blocked,
    waitingOnDependency: x.waiting,
    sprint: x.sprint_id && x.sprint_name ? { id: x.sprint_id, name: x.sprint_name } : null,
    sprintAssigned: x.sprint_assigned,
    sprintCapacity: x.sprint_capacity,
    overCapacity: x.sprint_capacity !== null && x.sprint_assigned > x.sprint_capacity,
  }));
  return { items };
}

/** A person's open items grouped by subproject, for the expandable row. Nothing here scores output. */
export async function getPersonItems(userId: string) {
  const rows = await db
    .select({
      id: activities.id,
      title: activities.title,
      status: activities.status,
      priority: activities.priority,
      dueDate: activities.dueDate,
      isBlocked: activities.isBlocked,
      subprojectId: activities.subprojectId,
      subprojectCode: subprojects.code,
      subprojectName: subprojects.name,
    })
    .from(activities)
    .leftJoin(subprojects, eq(subprojects.id, activities.subprojectId))
    .where(and(eq(activities.assigneeId, userId), ne(activities.status, "done")))
    .orderBy(asc(subprojects.code), asc(activities.dueDate), asc(activities.id))
    .limit(500);
  const groups = new Map<
    string,
    { subprojectId: string | null; code: string | null; name: string | null; items: typeof rows }
  >();
  for (const row of rows) {
    const key = row.subprojectId ?? "none";
    const group = groups.get(key) ?? {
      subprojectId: row.subprojectId,
      code: row.subprojectCode,
      name: row.subprojectName,
      items: [],
    };
    group.items.push(row);
    groups.set(key, group);
  }
  return { groups: [...groups.values()] };
}
