import { and, asc, count, eq, gte, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import type {
  AgingItem,
  FlowShare,
  InsightsDto,
  InsightsQuery,
  ThroughputWeek,
} from "@myapp/shared";
import { db } from "../db/client";
import { activities, subprojects } from "../db/schema";
import { env } from "../env";
import { localDate, weekStart } from "./dateBuckets";
import { forecast, percentile } from "./forecast";

/**
 * Insights: flow metrics computed from activity history (started_at, completed_at, status). All of it
 * is team-level; nothing is grouped by person and nothing ranks anyone.
 */

const DAY_MS = 86_400_000;

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export async function getInsights(
  query: InsightsQuery,
  now: Date = new Date(),
): Promise<InsightsDto> {
  const tz = env.APP_TIMEZONE;
  const today = localDate(now, tz);
  const currentWeek = weekStart(today);
  const windowStart = addDays(currentWeek, -7 * query.weeks);
  // Local midnight of the window start, as an instant.
  const windowStartAt = sql`(${windowStart}::date)::timestamp AT TIME ZONE ${tz}`;

  const scope: SQL[] = [];
  if (query.projectId) scope.push(eq(activities.projectId, query.projectId));
  if (query.subprojectId) scope.push(eq(activities.subprojectId, query.subprojectId));

  const doneInWindow = and(
    ...scope,
    eq(activities.status, "done"),
    isNotNull(activities.completedAt),
    gte(activities.completedAt, windowStartAt as unknown as Date),
  );

  const weekBucket = sql<string>`to_char(date_trunc('week', ${activities.completedAt} AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;

  const [throughputRows, cycleRows, wipRows, agingRows, flowRows, openRows] = await Promise.all([
    // Group by ordinal: the timezone is a bind parameter, so Postgres cannot match the repeated expression.
    db
      .select({ week: weekBucket, n: count() })
      .from(activities)
      .where(doneInWindow)
      .groupBy(sql`1`),
    db
      .select({
        days: sql<number>`extract(epoch from (${activities.completedAt} - ${activities.startedAt})) / 86400.0`,
      })
      .from(activities)
      .where(and(doneInWindow, isNotNull(activities.startedAt))),
    db
      .select({ status: activities.status, blocked: activities.isBlocked, n: count() })
      .from(activities)
      .where(and(...scope, inArray(activities.status, ["in_progress", "in_review"])))
      .groupBy(activities.status, activities.isBlocked),
    db
      .select({
        id: activities.id,
        title: activities.title,
        subprojectCode: subprojects.code,
        status: activities.status,
        isBlocked: activities.isBlocked,
        startedAt: activities.startedAt,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .leftJoin(subprojects, eq(subprojects.id, activities.subprojectId))
      .where(and(...scope, inArray(activities.status, ["in_progress", "in_review"])))
      .orderBy(
        asc(sql`coalesce(${activities.startedAt}, ${activities.createdAt})`),
        asc(activities.id),
      )
      .limit(5),
    db
      .select({ workType: activities.workType, n: count() })
      .from(activities)
      .where(doneInWindow)
      .groupBy(activities.workType),
    db
      .select({ n: count() })
      .from(activities)
      .where(and(...scope, ne(activities.status, "done"))),
  ]);

  // Weekly throughput, with empty weeks as zeros, oldest first. The current week is partial.
  const byWeek = new Map(throughputRows.map((r) => [r.week, r.n]));
  const throughput: ThroughputWeek[] = [];
  for (let i = 0; i <= query.weeks; i += 1) {
    const start = addDays(windowStart, 7 * i);
    throughput.push({
      weekStart: start,
      count: byWeek.get(start) ?? 0,
      partial: start === currentWeek,
    });
  }
  const complete = throughput.filter((w) => !w.partial).map((w) => w.count);
  const throughputAverage = complete.length
    ? round1(complete.reduce((a, b) => a + b, 0) / complete.length)
    : 0;

  const days = cycleRows.map((r) => Math.max(0, Number(r.days)));
  const cycleTime = {
    sample: days.length,
    p50: pct(days, 50),
    p85: pct(days, 85),
    p95: pct(days, 95),
    average: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null,
  };

  const inProgress = sum(wipRows.filter((r) => r.status === "in_progress").map((r) => r.n));
  const inReview = sum(wipRows.filter((r) => r.status === "in_review").map((r) => r.n));
  const blocked = sum(wipRows.filter((r) => r.blocked).map((r) => r.n));

  const aging: AgingItem[] = agingRows.map((r) => ({
    id: r.id,
    title: r.title,
    subprojectCode: r.subprojectCode,
    status: r.status as "in_progress" | "in_review",
    isBlocked: r.isBlocked,
    ageDays: Math.max(
      0,
      Math.floor((now.getTime() - (r.startedAt ?? r.createdAt).getTime()) / DAY_MS),
    ),
  }));

  const flowTotal = sum(flowRows.map((r) => r.n));
  const flowDistribution: FlowShare[] = flowRows
    .map((r) => ({
      workType: r.workType,
      count: r.n,
      share: flowTotal ? Math.round((r.n / flowTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.workType.localeCompare(b.workType));

  const remaining = openRows[0]?.n ?? 0;
  const runs = 5000;
  const result = forecast(complete, remaining, { runs });

  return {
    generatedAt: now.toISOString(),
    timezone: tz,
    windowWeeks: query.weeks,
    windowStart,
    throughput,
    throughputAverage,
    cycleTime,
    wip: { current: inProgress + inReview, inProgress, inReview, blocked },
    aging,
    flowDistribution,
    forecast: { remaining, samples: complete, runs, ...result },
  };
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const pct = (xs: number[], p: number): number | null => {
  const v = percentile(xs, p);
  return v === null ? null : round1(v);
};
