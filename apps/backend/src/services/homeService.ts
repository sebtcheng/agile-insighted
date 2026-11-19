import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  count,
} from "drizzle-orm";
import type { HomeResponse, HomeRow } from "@myapp/shared";
import { db } from "../db/client";
import { activities, projects, releases, sprints, subprojects, users } from "../db/schema";
import { waitingOnDependency } from "./governanceService";
import { scopeCondition, type ProjectScope } from "./visibilityService";
import { env } from "../env";
import { loadWorkItems } from "./workItemService";
import { summarize } from "./workItemRollups";
import type { Actor } from "../permissions";
import { rowToDto } from "./activityService";
import { addDays, bucketFor, diffDays, homeRanges, localDate } from "./dateBuckets";

export type HomeQuery = {
  assigneeId?: string;
  subprojectId?: string;
  now?: Date;
  timeZone?: string;
};

/** Home never returns more than this many candidate rows; `truncated` tells the client when the cap was hit. */
export const HOME_ROW_LIMIT = 1000;

/** Open work overdue by more than this many days before the week start drops off Home (Portfolio still counts it). */
export const OVERDUE_LOOKBACK_DAYS = 60;

/**
 * The one candidate query behind Home, returned unexecuted so EXPLAIN tooling can run exactly what the app runs.
 * Open items due up to the horizon (with a bounded overdue lookback) plus items completed around this week.
 */
export function homeCandidatesQuery(
  actor: Pick<Actor, "id" | "role">,
  query: Pick<HomeQuery, "assigneeId" | "subprojectId">,
  r: ReturnType<typeof homeRanges>,
  scope: ProjectScope = null,
) {
  // Done items count only if completed this week. Convert the local week to a generous UTC window, then bucket exactly.
  const windowStart = new Date(`${addDays(r.weekStart, -1)}T00:00:00Z`);
  const windowEnd = new Date(`${addDays(r.weekEnd, 2)}T00:00:00Z`);

  const filters: SQL[] = [isNull(projects.archivedAt), isNotNull(activities.dueDate)];
  const inScope = scopeCondition(activities.projectId, scope);
  if (inScope) filters.push(inScope);
  if (actor.role === "team_member") filters.push(eq(activities.assigneeId, actor.id));
  else {
    if (query.assigneeId) filters.push(eq(activities.assigneeId, query.assigneeId));
    if (query.subprojectId) filters.push(eq(activities.subprojectId, query.subprojectId));
  }
  const horizon = r.nextWeekEnd > r.monthEnd ? r.nextWeekEnd : r.monthEnd;
  const candidate = or(
    and(
      ne(activities.status, "done"),
      gte(activities.dueDate, addDays(r.weekStart, -OVERDUE_LOOKBACK_DAYS)),
      lte(activities.dueDate, horizon),
    ),
    and(
      eq(activities.status, "done"),
      gte(activities.completedAt, windowStart),
      lte(activities.completedAt, windowEnd),
    ),
  );
  if (candidate) filters.push(candidate);

  return db
    .select({
      a: activities,
      subCode: subprojects.code,
      subName: subprojects.name,
      assigneeName: users.fullName,
    })
    .from(activities)
    .innerJoin(projects, eq(projects.id, activities.projectId))
    .leftJoin(subprojects, eq(subprojects.id, activities.subprojectId))
    .leftJoin(users, eq(users.id, activities.assigneeId))
    .where(and(...filters))
    .orderBy(asc(activities.dueDate), asc(activities.id))
    .limit(HOME_ROW_LIMIT);
}

/**
 * Home read model for the signed-in user. Team members see their own activities; a PM sees all,
 * optionally filtered by assignee or subproject. One candidate query, bucketed in memory.
 */
export async function getHome(
  actor: Actor,
  query: HomeQuery = {},
  scope: ProjectScope = null,
): Promise<HomeResponse> {
  const timeZone = query.timeZone ?? env.APP_TIMEZONE;
  const now = query.now ?? new Date();
  const today = localDate(now, timeZone);
  const r = homeRanges(today);

  const rows = await homeCandidatesQuery(actor, query, r, scope);

  const result: HomeResponse = {
    timezone: timeZone,
    activeSprint: null,
    wip: { inProgress: 0, limit: 0 },
    thisWeek: [],
    nextWeek: [],
    thisMonth: [],
    upcomingReleases: [],
    moduleItems: { thisWeek: [], nextWeek: [], thisMonth: [] },
    summary: summarize([]),
    truncated: rows.length >= HOME_ROW_LIMIT,
  };

  const waiting = await waitingOnDependency(
    db,
    rows.map((row) => row.a.id),
  );
  for (const row of rows) {
    const completedDate = row.a.completedAt ? localDate(row.a.completedAt, timeZone) : null;
    const bucket = bucketFor({ dueDate: row.a.dueDate, status: row.a.status, completedDate }, r);
    if (!bucket) continue;
    const dto = rowToDto(row.a, row.subCode, row.subName, row.assigneeName, waiting.has(row.a.id));
    const open = row.a.status !== "done";
    const item: HomeRow = {
      ...dto,
      isOverdue: open && row.a.dueDate !== null && row.a.dueDate < today,
      // Next Week proactively surfaces work that is blocked or waiting on another activity.
      atRisk: open && (row.a.isBlocked || dto.waitingOnDependency),
    };
    result[bucket].push(item);
  }

  // Unified work: summary counts over all five modules, plus the non-project items bucketed by due date.
  const loaded = await loadWorkItems(
    {
      assigneeId: actor.role === "team_member" ? actor.id : query.assigneeId,
      subprojectId: query.subprojectId,
    },
    scope,
    now,
  );
  result.summary = summarize(loaded.items);
  for (const item of loaded.items) {
    if (item.sourceModule === "project") continue;
    const bucket = bucketFor(
      {
        dueDate: item.dueDate,
        status: item.isCompleted ? "done" : "open",
        completedDate: item.completedAt ? localDate(new Date(item.completedAt), timeZone) : null,
      },
      r,
    );
    if (bucket) result.moduleItems[bucket].push(item);
  }

  // This Month also lists releases still planned with a target date from today to month end.
  result.upcomingReleases = await db
    .select({ id: releases.id, name: releases.name, targetDate: releases.targetDate })
    .from(releases)
    .innerJoin(projects, eq(projects.id, releases.projectId))
    .where(
      and(
        isNull(projects.archivedAt),
        scopeCondition(releases.projectId, scope),
        eq(releases.status, "planned"),
        gte(releases.targetDate, today),
        lte(releases.targetDate, r.monthEnd),
      ),
    )
    .orderBy(asc(releases.targetDate), asc(releases.name))
    .then((list) =>
      list.flatMap((x) => (x.targetDate ? [{ ...x, targetDate: x.targetDate }] : [])),
    );

  // Header: active project-wide sprint of any open project, and the user's WIP vs limit.
  const [sprint] = await db
    .select({ id: sprints.id, name: sprints.name, goal: sprints.goal, endDate: sprints.endDate })
    .from(sprints)
    .innerJoin(projects, eq(projects.id, sprints.projectId))
    .where(
      and(
        eq(sprints.status, "active"),
        isNull(sprints.subprojectId),
        isNull(projects.archivedAt),
        scopeCondition(sprints.projectId, scope),
      ),
    )
    .orderBy(asc(sprints.endDate))
    .limit(1);
  if (sprint)
    result.activeSprint = { ...sprint, daysLeft: Math.max(0, diffDays(sprint.endDate, today)) };

  const [limitRow] = await db
    .select({ limit: projects.wipLimitPerPerson })
    .from(projects)
    .where(and(isNull(projects.archivedAt), scopeCondition(projects.id, scope)))
    .orderBy(asc(projects.createdAt))
    .limit(1);
  const [wipRow] = await db
    .select({ n: count() })
    .from(activities)
    .where(and(eq(activities.assigneeId, actor.id), inArray(activities.status, ["in_progress"])));
  result.wip = { inProgress: wipRow?.n ?? 0, limit: limitRow?.limit ?? 0 };
  return result;
}
