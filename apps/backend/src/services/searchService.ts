import { sql, type SQL } from "drizzle-orm";
import type { ActivityStatus, SearchResponse } from "@myapp/shared";
import { db } from "../db/client";

/** Escape LIKE wildcards so user input is matched literally. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Trigram indexes need three characters; shorter queries only look at subproject codes and people prefixes. */
export const MIN_ACTIVITY_QUERY = 3;

export function activitySearchSql(q: string, limit: number): SQL {
  const contains = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  // ILIKE and the % similarity operator both use the GIN trigram index; ordering is prefix, then contains, then similarity.
  return sql`
    SELECT a.id, a.title, a.status, s.code AS subproject_code
    FROM activities a
    JOIN projects p ON p.id = a.project_id AND p.archived_at IS NULL
    LEFT JOIN subprojects s ON s.id = a.subproject_id
    WHERE a.title ILIKE ${contains} OR a.title % ${q}
    ORDER BY (a.title ILIKE ${prefix}) DESC, (a.title ILIKE ${contains}) DESC, similarity(a.title, ${q}) DESC, a.title, a.id
    LIMIT ${limit}`;
}

export function subprojectSearchSql(q: string, limit: number): SQL {
  const contains = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  return sql`
    SELECT s.id, s.code, s.name
    FROM subprojects s
    JOIN projects p ON p.id = s.project_id AND p.archived_at IS NULL
    WHERE s.archived_at IS NULL AND (s.code ILIKE ${prefix} OR s.name ILIKE ${contains} OR s.name % ${q})
    ORDER BY (s.code ILIKE ${prefix}) DESC, (s.name ILIKE ${prefix}) DESC, similarity(s.name, ${q}) DESC, s.code
    LIMIT ${limit}`;
}

export function peopleSearchSql(q: string, limit: number): SQL {
  const contains = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  return sql`
    SELECT u.id, u.full_name
    FROM users u
    WHERE u.is_active AND (u.full_name ILIKE ${contains} OR u.full_name % ${q})
    ORDER BY (u.full_name ILIKE ${prefix}) DESC, similarity(u.full_name, ${q}) DESC, u.full_name
    LIMIT ${limit}`;
}

/**
 * Typeahead across activity titles, subproject codes and names, and people. Every signed-in user can see all
 * of these, so permission filtering means hiding archived projects and subprojects and inactive people.
 */
export async function search(rawQuery: string, limit = 8): Promise<SearchResponse> {
  const q = rawQuery.trim();
  const empty: SearchResponse = { query: q, activities: [], subprojects: [], people: [] };
  if (q.length === 0) return empty;

  const [activityRows, subprojectRows, peopleRows] = await Promise.all([
    q.length >= MIN_ACTIVITY_QUERY
      ? db.execute<{
          id: string;
          title: string;
          status: ActivityStatus;
          subproject_code: string | null;
        }>(activitySearchSql(q, limit))
      : null,
    db.execute<{ id: string; code: string; name: string }>(subprojectSearchSql(q, limit)),
    q.length >= 2 ? db.execute<{ id: string; full_name: string }>(peopleSearchSql(q, limit)) : null,
  ]);

  return {
    query: q,
    activities: (activityRows?.rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      subprojectCode: r.subproject_code,
    })),
    subprojects: subprojectRows.rows,
    people: (peopleRows?.rows ?? []).map((r) => ({ id: r.id, fullName: r.full_name })),
  };
}
