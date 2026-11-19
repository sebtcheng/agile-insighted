import { sql, type SQL } from "drizzle-orm";
import type { PortfolioQuery, PortfolioResponse, PortfolioRow } from "@myapp/shared";
import { db } from "../db/client";
import { env } from "../env";
import type { Actor } from "../permissions";
import { localDate } from "./dateBuckets";
import { scopeSql, type ProjectScope } from "./visibilityService";

type Row = {
  id: string;
  code: string;
  name: string;
  lead_id: string | null;
  lead_name: string | null;
  health: PortfolioRow["health"];
  health_note: string | null;
  sprint_id: string | null;
  sprint_name: string | null;
  open: number;
  blocked: number;
  waiting: number;
  overdue: number;
  total: number;
  done: number;
  release_id: string | null;
  release_name: string | null;
  release_date: string | null;
  raid_high: number;
  mine: boolean;
};

/**
 * Activities that wait on an unfinished blocker. It starts from the (small) dependencies table and probes
 * activities by primary key, instead of letting the planner hash every open activity. Shared with Workload.
 */
export const WAITING_CTE_BODY = sql`waiting AS MATERIALIZED (
    SELECT d.blocked_activity_id
    FROM activity_dependencies d
    CROSS JOIN LATERAL (
      -- LIMIT 1 keeps the planner from flattening this into a hash join over every open activity.
      SELECT 1 FROM activities b WHERE b.id = d.blocking_activity_id AND b.status <> 'done' LIMIT 1
    ) unfinished
    GROUP BY d.blocked_activity_id
  )`;

/**
 * Open high-severity RAID items per project: risks, assumptions, issues or dependencies that are
 * still open or in progress and have High (3) impact. RAID items no longer belong to a subproject,
 * so every subproject row shows its project's count.
 */
export function openHighRaidSql(): SQL {
  return sql`SELECT ri.project_id, count(*)::int AS n
    FROM raid_items ri
    WHERE ri.status IN ('open', 'in_progress') AND ri.impact = 3
    GROUP BY ri.project_id`;
}

export async function countOpenHighRaidByProject(): Promise<Map<string, number>> {
  const res = await db.execute<{ project_id: string; n: number }>(openHighRaidSql());
  return new Map(res.rows.map((r) => [r.project_id, r.n]));
}

/**
 * One query, no N+1: one row per open subproject with every count computed in lateral aggregates.
 * "Waiting on dependency" is derived from unfinished blocking activities, never stored.
 */
export function portfolioSql(today: string, actorId: string, scope: ProjectScope = null): SQL {
  return sql`
    WITH ${WAITING_CTE_BODY}
    SELECT s.id, s.code, s.name, s.lead_id, u.full_name AS lead_name, s.health, s.health_note,
           sp.id AS sprint_id, sp.name AS sprint_name,
           a.open, a.blocked, a.waiting, a.overdue, a.total, a.done,
           rel.id AS release_id, rel.name AS release_name, rel.target_date::text AS release_date,
           COALESCE(raid.n, 0)::int AS raid_high,
           (s.lead_id = ${actorId} OR a.mine > 0) AS mine
    FROM subprojects s
    JOIN projects p ON p.id = s.project_id AND p.archived_at IS NULL
    LEFT JOIN users u ON u.id = s.lead_id
    LEFT JOIN LATERAL (
      SELECT sx.id, sx.name FROM sprints sx
      WHERE sx.project_id = s.project_id AND sx.status = 'active'
        AND (sx.subproject_id = s.id OR sx.subproject_id IS NULL)
      ORDER BY (sx.subproject_id IS NULL), sx.end_date
      LIMIT 1
    ) sp ON true
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE x.status <> 'done')::int AS open,
             count(*) FILTER (WHERE x.status <> 'done' AND x.is_blocked)::int AS blocked,
             count(*) FILTER (WHERE x.status <> 'done' AND w.blocked_activity_id IS NOT NULL)::int AS waiting,
             count(*) FILTER (WHERE x.status <> 'done' AND x.due_date < ${today}::date)::int AS overdue,
             count(*)::int AS total,
             count(*) FILTER (WHERE x.status = 'done')::int AS done,
             count(*) FILTER (WHERE x.assignee_id = ${actorId} AND x.status <> 'done')::int AS mine
      FROM activities x
      LEFT JOIN waiting w ON w.blocked_activity_id = x.id
      WHERE x.subproject_id = s.id
    ) a
    LEFT JOIN LATERAL (
      SELECT r.id, r.name, r.target_date FROM releases r
      WHERE r.project_id = s.project_id AND r.status = 'planned' AND r.target_date >= ${today}::date
        AND EXISTS (SELECT 1 FROM activities y WHERE y.release_id = r.id AND y.subproject_id = s.id)
      ORDER BY r.target_date
      LIMIT 1
    ) rel ON true
    LEFT JOIN (${openHighRaidSql()}) raid ON raid.project_id = s.project_id
    WHERE s.archived_at IS NULL AND ${scopeSql(sql`s.project_id`, scope)}
    ORDER BY s.code`;
}

const HEALTH_ORDER = { off_track: 0, at_risk: 1, on_track: 2 } as const;

export async function getPortfolio(
  actor: Pick<Actor, "id">,
  query: PortfolioQuery,
  now: Date = new Date(),
  scope: ProjectScope = null,
): Promise<PortfolioResponse> {
  const today = localDate(now, env.APP_TIMEZONE);
  const res = await db.execute<Row>(portfolioSql(today, actor.id, scope));

  let items: PortfolioRow[] = res.rows
    .filter((r) => (query.health ? r.health === query.health : true))
    .filter((r) => (query.leadId ? r.lead_id === query.leadId : true))
    .filter((r) => (query.mine ? r.mine : true))
    .filter((r) => (query.hasBlockers ? r.blocked > 0 || r.waiting > 0 : true))
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      leadId: r.lead_id,
      leadName: r.lead_name,
      health: r.health,
      healthNote: r.health_note,
      activeSprint: r.sprint_id && r.sprint_name ? { id: r.sprint_id, name: r.sprint_name } : null,
      open: r.open,
      blocked: r.blocked,
      waitingOnDependency: r.waiting,
      overdue: r.overdue,
      total: r.total,
      percentDone: r.total === 0 ? 0 : Math.round((r.done / r.total) * 100),
      nextRelease:
        r.release_id && r.release_name && r.release_date
          ? { id: r.release_id, name: r.release_name, targetDate: r.release_date }
          : null,
      openHighRaid: r.raid_high,
    }));

  const dir = query.dir === "desc" ? -1 : 1;
  const key = {
    code: (r: PortfolioRow) => r.code,
    name: (r: PortfolioRow) => r.name.toLowerCase(),
    health: (r: PortfolioRow) => HEALTH_ORDER[r.health],
    open: (r: PortfolioRow) => r.open,
    blocked: (r: PortfolioRow) => r.blocked,
    waiting: (r: PortfolioRow) => r.waitingOnDependency,
    overdue: (r: PortfolioRow) => r.overdue,
    percentDone: (r: PortfolioRow) => r.percentDone,
  }[query.sort];
  items = [...items].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return (x < y ? -1 : x > y ? 1 : a.code.localeCompare(b.code)) * dir;
  });
  return { items };
}
