import { and, eq, exists, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { projectMembers, projects } from "../db/schema";
import { notFound } from "../errors";
import type { Actor } from "../permissions";

/**
 * Project visibility, in one place.
 * Rule: a PM manages every project (they own `project.write`), so a PM is unrestricted. A team member sees
 * only projects where they are the owner or a row exists in project_members. `null` means "no restriction".
 */
export type ProjectScope = string[] | null;

export async function getVisibleProjectIds(
  actor: Pick<Actor, "id" | "role">,
): Promise<ProjectScope> {
  if (actor.role === "pm") return null;
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      or(
        eq(projects.ownerId, actor.id),
        exists(
          db
            .select({ one: projectMembers.userId })
            .from(projectMembers)
            .where(
              and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)),
            ),
        ),
      ),
    );
  return rows.map((r) => r.id);
}

/** 404 (not 403) so the response never confirms that a hidden project exists. */
export async function assertProjectVisible(
  actor: Pick<Actor, "id" | "role">,
  projectId: string,
): Promise<void> {
  const scope = await getVisibleProjectIds(actor);
  if (scope !== null && !scope.includes(projectId)) throw notFound("Project");
}

/** Drizzle condition limiting a project id column to the scope; undefined when unrestricted. */
export function scopeCondition(col: AnyColumn, scope: ProjectScope): SQL | undefined {
  if (scope === null) return undefined;
  if (scope.length === 0) return sql`false`;
  return sql`${col} in (${sql.join(
    scope.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}

/** Raw-SQL flavour for the hand-written read models: always returns a boolean expression. */
export function scopeSql(col: SQL, scope: ProjectScope): SQL {
  if (scope === null) return sql`true`;
  if (scope.length === 0) return sql`false`;
  return sql`${col} in (${sql.join(
    scope.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}
