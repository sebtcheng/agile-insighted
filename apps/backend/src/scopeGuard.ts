import { eq } from "drizzle-orm";
import type { PgTable, AnyPgColumn } from "drizzle-orm/pg-core";
import type { RequestHandler } from "express";
import { z } from "zod";
import { db } from "./db/client";
import {
  activities,
  checklistTemplates,
  journeySteps,
  kanoRequests,
  ostOpportunities,
  ostOutcomes,
  ostSolutions,
  personas,
  raidItems,
  releases,
  sprints,
  subprojects,
  userStories,
  usmPersonas,
  usmStepFeatures,
  usmSteps,
} from "./db/schema";
import { notFound } from "./errors";
import { actorOf } from "./middleware";
import { getVisibleProjectIds } from "./services/visibilityService";

const isUuid = (v: unknown): v is string => z.string().uuid().safeParse(v).success;

/** Resolves the project that owns a record, or null when it does not exist (the route then answers 404 itself). */
type Resolver = (id: string) => Promise<string | null>;

function owning(table: PgTable, idCol: AnyPgColumn, projectCol: AnyPgColumn): Resolver {
  return async (id) => {
    const [row] = await db
      .select({ projectId: projectCol })
      .from(table)
      .where(eq(idCol, id))
      .limit(1);
    return (row?.projectId as string | undefined) ?? null;
  };
}

const viaOutcome: Resolver = async (id) => {
  const [row] = await db
    .select({ p: ostOutcomes.projectId })
    .from(ostOutcomes)
    .where(eq(ostOutcomes.id, id))
    .limit(1);
  return row?.p ?? null;
};

const viaOpportunity: Resolver = async (id) => {
  const [row] = await db
    .select({ outcomeId: ostOpportunities.outcomeId })
    .from(ostOpportunities)
    .where(eq(ostOpportunities.id, id))
    .limit(1);
  return row ? viaOutcome(row.outcomeId) : null;
};

const viaSolution: Resolver = async (id) => {
  const [row] = await db
    .select({ opportunityId: ostSolutions.opportunityId })
    .from(ostSolutions)
    .where(eq(ostSolutions.id, id))
    .limit(1);
  return row ? viaOpportunity(row.opportunityId) : null;
};

const bySubproject = owning(subprojects, subprojects.id, subprojects.projectId);
const bySprint = owning(sprints, sprints.id, sprints.projectId);

/** First path segment -> how to find the owning project from the id in the second segment. */
const BY_PREFIX: Record<string, Resolver> = {
  projects: (id) => Promise.resolve(id),
  subprojects: bySubproject,
  sprints: bySprint,
  activities: owning(activities, activities.id, activities.projectId),
  releases: owning(releases, releases.id, releases.projectId),
  "checklist-templates": owning(
    checklistTemplates,
    checklistTemplates.id,
    checklistTemplates.projectId,
  ),
  raid: owning(raidItems, raidItems.id, raidItems.projectId),
  kano: owning(kanoRequests, kanoRequests.id, kanoRequests.projectId),
  stories: owning(userStories, userStories.id, userStories.projectId),
  personas: owning(personas, personas.id, personas.projectId),
  "journey-steps": owning(journeySteps, journeySteps.id, journeySteps.projectId),
};

/** /ost/<kind>/:id/... */
const BY_OST_KIND: Record<string, Resolver> = {
  outcomes: viaOutcome,
  opportunities: viaOpportunity,
  solutions: viaSolution,
};

/** /story-map/<kind>/:id (User Story Mapping v2). */
const BY_USM_KIND: Record<string, Resolver> = {
  personas: owning(usmPersonas, usmPersonas.id, usmPersonas.projectId),
  steps: owning(usmSteps, usmSteps.id, usmSteps.projectId),
  features: owning(usmStepFeatures, usmStepFeatures.id, usmStepFeatures.projectId),
};

/** Query-string filters that name a record whose project must be visible. */
const BY_QUERY: Record<string, Resolver> = {
  projectId: (id) => Promise.resolve(id),
  subprojectId: bySubproject,
  sprintId: bySprint,
};

/**
 * Server-side project scoping for every single-record route. PMs pass untouched; a team member whose
 * request names a project, or a record in one, they are not assigned to gets the standard 404.
 * List and aggregate endpoints are also scoped inside their services; this guard covers the rest.
 */
export const scopeGuard: RequestHandler = (req, res, next) => {
  const run = async () => {
    const actor = actorOf(res);
    if (actor.role === "pm") return;
    const [seg1, seg2, seg3] = req.path.split("/").filter(Boolean);
    // seg3 is the record id for /ost/<kind>/:id; for everything else the id is seg2.
    const checks: Array<Promise<string | null>> = [];
    if (seg1 === "story-map") {
      // /story-map/<personas|steps|features>/:id
      const resolver = seg2 ? BY_USM_KIND[seg2] : undefined;
      if (resolver && isUuid(seg3)) checks.push(resolver(seg3));
    } else if (seg1 === "ost") {
      const resolver = seg2 ? BY_OST_KIND[seg2] : undefined;
      if (resolver && isUuid(seg3)) checks.push(resolver(seg3));
    } else {
      const resolver = seg1 ? BY_PREFIX[seg1] : undefined;
      if (resolver && isUuid(seg2)) checks.push(resolver(seg2));
    }
    // A project named in the request body (create routes) must be visible as well.
    const bodyProject: unknown = (req.body as { projectId?: unknown } | undefined)?.projectId;
    if (isUuid(bodyProject)) checks.push(Promise.resolve(bodyProject));
    for (const [key, resolver] of Object.entries(BY_QUERY)) {
      const v: unknown = req.query[key];
      if (isUuid(v)) checks.push(resolver(v));
    }
    if (checks.length === 0) return;
    const [scope, projectIds] = await Promise.all([
      getVisibleProjectIds(actor),
      Promise.all(checks),
    ]);
    if (scope === null) return;
    for (const pid of projectIds) {
      if (pid !== null && !scope.includes(pid)) throw notFound();
    }
  };
  run().then(
    () => next(),
    (err: unknown) => next(err),
  );
};
