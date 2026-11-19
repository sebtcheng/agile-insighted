import { and, asc, desc, eq, exists, lt, or, type SQL } from "drizzle-orm";
import type { ActivityDto, ActivityListQuery } from "@myapp/shared";
import { db } from "../db/client";
import {
  activities,
  activityComments,
  activityEvents,
  activityTags,
  subprojects,
  tags,
  users,
} from "../db/schema";
import { badRequest, notFound } from "../errors";
import { rowToDto, toDto } from "./activityService";
import { waitingOnDependency } from "./governanceService";
import { scopeCondition, type ProjectScope } from "./visibilityService";

/** Keyset cursor: newest first by (created_at, id). */
const encodeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");

function decodeCursor(cursor: string): [Date, string] {
  try {
    const [iso, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [
      string,
      string,
    ];
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()) || typeof id !== "string") throw new Error("bad cursor");
    return [date, id];
  } catch {
    throw badRequest("Invalid pagination cursor");
  }
}

export async function listActivities(
  query: ActivityListQuery,
  scope: ProjectScope = null,
): Promise<{ items: ActivityDto[]; nextCursor: string | null }> {
  const where: SQL[] = [];
  const inScope = scopeCondition(activities.projectId, scope);
  if (inScope) where.push(inScope);
  if (query.projectId) where.push(eq(activities.projectId, query.projectId));
  if (query.subprojectId) where.push(eq(activities.subprojectId, query.subprojectId));
  if (query.sprintId) where.push(eq(activities.sprintId, query.sprintId));
  if (query.assigneeId) where.push(eq(activities.assigneeId, query.assigneeId));
  if (query.status) where.push(eq(activities.status, query.status));
  if (query.workType) where.push(eq(activities.workType, query.workType));
  if (query.blocked !== undefined) where.push(eq(activities.isBlocked, query.blocked));
  if (query.tagId) {
    where.push(
      exists(
        db
          .select({ one: activityTags.tagId })
          .from(activityTags)
          .where(
            and(eq(activityTags.tagId, query.tagId), eq(activityTags.activityId, activities.id)),
          ),
      ),
    );
  }
  if (query.cursor) {
    const [createdAt, id] = decodeCursor(query.cursor);
    const keyset = or(
      lt(activities.createdAt, createdAt),
      and(eq(activities.createdAt, createdAt), lt(activities.id, id)),
    );
    if (keyset) where.push(keyset);
  }

  const rows = await db
    .select({
      a: activities,
      subCode: subprojects.code,
      subName: subprojects.name,
      assigneeName: users.fullName,
    })
    .from(activities)
    .leftJoin(subprojects, eq(subprojects.id, activities.subprojectId))
    .leftJoin(users, eq(users.id, activities.assigneeId))
    .where(and(...where))
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const waiting = await waitingOnDependency(
    db,
    page.map((r) => r.a.id),
  );
  return {
    items: page.map((r) =>
      rowToDto(r.a, r.subCode, r.subName, r.assigneeName, waiting.has(r.a.id)),
    ),
    nextCursor:
      rows.length > query.limit && last ? encodeCursor(last.a.createdAt, last.a.id) : null,
  };
}

export async function getActivity(id: string): Promise<ActivityDto> {
  return toDto(db, id);
}

async function assertExists(id: string) {
  const [row] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.id, id))
    .limit(1);
  if (!row) throw notFound("Activity");
}

export async function listEvents(activityId: string) {
  await assertExists(activityId);
  return db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      fromValue: activityEvents.fromValue,
      toValue: activityEvents.toValue,
      note: activityEvents.note,
      actorId: activityEvents.actorId,
      actorName: users.fullName,
      occurredAt: activityEvents.occurredAt,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorId))
    .where(eq(activityEvents.activityId, activityId))
    .orderBy(asc(activityEvents.occurredAt), asc(activityEvents.id));
}

export async function listComments(activityId: string) {
  await assertExists(activityId);
  return db
    .select({
      id: activityComments.id,
      body: activityComments.body,
      authorId: activityComments.authorId,
      authorName: users.fullName,
      createdAt: activityComments.createdAt,
    })
    .from(activityComments)
    .innerJoin(users, eq(users.id, activityComments.authorId))
    .where(eq(activityComments.activityId, activityId))
    .orderBy(asc(activityComments.createdAt), asc(activityComments.id));
}

export async function addComment(activityId: string, authorId: string, body: string) {
  await assertExists(activityId);
  const [row] = await db
    .insert(activityComments)
    .values({ activityId, authorId, body })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function listTags() {
  return db.select().from(tags).orderBy(asc(tags.name));
}

export async function createTag(name: string, colorCode: string) {
  const [row] = await db.insert(tags).values({ name, colorCode }).returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function tagsForActivity(activityId: string) {
  return db
    .select({ id: tags.id, name: tags.name, colorCode: tags.colorCode })
    .from(activityTags)
    .innerJoin(tags, eq(tags.id, activityTags.tagId))
    .where(eq(activityTags.activityId, activityId))
    .orderBy(asc(tags.name));
}
