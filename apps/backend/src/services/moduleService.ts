import { asc, eq, ne, and } from "drizzle-orm";
import type { ValidationStatus, WorkType } from "@myapp/shared";
import { db, type DbOrTx, type Tx } from "../db/client";
import {
  journeySteps,
  kanoRequests,
  ostAssumptions,
  ostOpportunities,
  ostOutcomes,
  ostSolutions,
  personas,
  raidItems,
  userStories,
} from "../db/schema";
import { notFound } from "../errors";
import { nextSeq } from "./seq";

/*
 * Data-layer helpers for the four discovery modules. There are no API endpoints or UI for these yet
 * (later phases); this service is what the seed and the tests use, and what those phases build on.
 * Every coded row gets its seq from nextSeq() inside the same transaction as the insert.
 */

type Kind = { projectId: string; createdById: string };
type Run<T> = (tx: Tx) => Promise<T>;
const inTx = <T>(tx: Tx | undefined, fn: Run<T>): Promise<T> => (tx ? fn(tx) : db.transaction(fn));

// ---------------------------------------------------------------- OST
export function computeSolutionValidation(
  assumptions: Array<{ isRiskiest: boolean; validationStatus: ValidationStatus }>,
): ValidationStatus {
  // A solution is only as validated as its riskiest assumption; with none flagged it stays planned.
  const riskiest = assumptions.find((a) => a.isRiskiest);
  return riskiest ? riskiest.validationStatus : "planned";
}

/** Recomputes the denormalized solution status from its assumptions. Call in the same transaction as any assumption change. */
export async function recalcSolutionValidation(
  tx: DbOrTx,
  solutionId: string,
): Promise<ValidationStatus> {
  const rows = await tx
    .select({
      isRiskiest: ostAssumptions.isRiskiest,
      validationStatus: ostAssumptions.validationStatus,
    })
    .from(ostAssumptions)
    .where(eq(ostAssumptions.solutionId, solutionId));
  const status = computeSolutionValidation(rows);
  await tx
    .update(ostSolutions)
    .set({ validationStatus: status })
    .where(eq(ostSolutions.id, solutionId));
  return status;
}

export async function createOutcome(
  k: Kind & {
    subprojectId?: string | null;
    title: string;
    description?: string;
    metricName?: string;
    baselineValue?: string;
    targetValue?: string;
    targetDate?: string;
  },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const [row] = await t
      .insert(ostOutcomes)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        subprojectId: k.subprojectId ?? null,
        title: k.title,
        description: k.description ?? null,
        metricName: k.metricName ?? null,
        baselineValue: k.baselineValue ?? null,
        targetValue: k.targetValue ?? null,
        targetDate: k.targetDate ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function createOpportunity(
  k: Kind & {
    outcomeId: string;
    parentOpportunityId?: string | null;
    title: string;
    description?: string;
    evidence?: string;
    isTargeted?: boolean;
  },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    // Only one targeted opportunity per outcome: targeting a new one clears the previous.
    if (k.isTargeted) {
      await t
        .update(ostOpportunities)
        .set({ isTargeted: false })
        .where(eq(ostOpportunities.outcomeId, k.outcomeId));
    }
    const [row] = await t
      .insert(ostOpportunities)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        outcomeId: k.outcomeId,
        parentOpportunityId: k.parentOpportunityId ?? null,
        title: k.title,
        description: k.description ?? null,
        evidence: k.evidence ?? null,
        isTargeted: k.isTargeted ?? false,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function createSolution(
  k: Kind & { opportunityId: string; title: string; ownerId?: string | null },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const seq = await nextSeq(t, k.projectId, "ost");
    const [row] = await t
      .insert(ostSolutions)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        opportunityId: k.opportunityId,
        seq,
        title: k.title,
        ownerId: k.ownerId ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function createAssumption(
  k: Kind & {
    solutionId: string;
    statement: string;
    category: "desirability" | "viability" | "usability" | "feasibility";
    isRiskiest?: boolean;
    validationTest?: string;
    validationStatus?: ValidationStatus;
    resultNotes?: string;
    position?: number;
  },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    // At most one riskiest assumption per solution: flagging a new one moves the flag.
    if (k.isRiskiest) {
      await t
        .update(ostAssumptions)
        .set({ isRiskiest: false })
        .where(eq(ostAssumptions.solutionId, k.solutionId));
    }
    const [row] = await t
      .insert(ostAssumptions)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        solutionId: k.solutionId,
        statement: k.statement,
        category: k.category,
        isRiskiest: k.isRiskiest ?? false,
        validationTest: k.validationTest ?? null,
        validationStatus: k.validationStatus ?? "planned",
        resultNotes: k.resultNotes ?? null,
        position: k.position ?? 0,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await recalcSolutionValidation(t, k.solutionId);
    return row;
  });
}

export async function updateAssumption(
  id: string,
  patch: { validationStatus?: ValidationStatus; isRiskiest?: boolean; resultNotes?: string },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const [current] = await t
      .select()
      .from(ostAssumptions)
      .where(eq(ostAssumptions.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Assumption");
    if (patch.isRiskiest) {
      await t
        .update(ostAssumptions)
        .set({ isRiskiest: false })
        .where(and(eq(ostAssumptions.solutionId, current.solutionId), ne(ostAssumptions.id, id)));
    }
    const [row] = await t
      .update(ostAssumptions)
      .set({
        ...(patch.validationStatus === undefined
          ? {}
          : { validationStatus: patch.validationStatus }),
        ...(patch.isRiskiest === undefined ? {} : { isRiskiest: patch.isRiskiest }),
        ...(patch.resultNotes === undefined ? {} : { resultNotes: patch.resultNotes }),
      })
      .where(eq(ostAssumptions.id, id))
      .returning();
    if (!row) throw notFound("Assumption");
    await recalcSolutionValidation(t, current.solutionId);
    return row;
  });
}

export async function deleteAssumption(id: string, tx?: Tx) {
  return inTx(tx, async (t) => {
    const [row] = await t.delete(ostAssumptions).where(eq(ostAssumptions.id, id)).returning();
    if (!row) throw notFound("Assumption");
    await recalcSolutionValidation(t, row.solutionId);
  });
}

// ---------------------------------------------------------------- User Story Mapping
export async function createPersona(
  k: Kind & { subprojectId?: string | null; name: string; description?: string },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const [row] = await t
      .insert(personas)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        subprojectId: k.subprojectId ?? null,
        name: k.name,
        description: k.description ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function createJourneyStep(
  k: Kind & { subprojectId: string; parentStepId?: string | null; name: string; position?: number },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const [row] = await t
      .insert(journeySteps)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        subprojectId: k.subprojectId,
        parentStepId: k.parentStepId ?? null,
        name: k.name,
        position: k.position ?? 0,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function createStory(
  k: Kind & {
    subprojectId: string;
    personaId?: string | null;
    journeyStepId?: string | null;
    story: string;
    acceptanceCriteria?: string;
    workType?: WorkType;
    releaseId?: string | null;
    sprintId?: string | null;
    storyPoints?: number | null;
    status?: "backlog" | "planning" | "in_progress" | "completed";
    position?: number;
  },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const seq = await nextSeq(t, k.projectId, "usm");
    const [row] = await t
      .insert(userStories)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        subprojectId: k.subprojectId,
        seq,
        personaId: k.personaId ?? null,
        journeyStepId: k.journeyStepId ?? null,
        story: k.story,
        acceptanceCriteria: k.acceptanceCriteria ?? null,
        workType: k.workType ?? "feature",
        releaseId: k.releaseId ?? null,
        sprintId: k.sprintId ?? null,
        storyPoints: k.storyPoints ?? null,
        status: k.status ?? "backlog",
        position: k.position ?? 0,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

// ---------------------------------------------------------------- Kano
export type KanoInput = Kind & {
  subprojectId?: string | null;
  description: string;
  requesterName: string;
  requesterRole?: string;
  kanoCategory?: (typeof kanoRequests.$inferInsert)["kanoCategory"];
  decision?: (typeof kanoRequests.$inferInsert)["decision"];
  targetSprintId?: string | null;
  targetReleaseId?: string | null;
  wsjf?: { businessValue: number; timeCriticality: number; riskReduction: number; jobSize: number };
  rice?: { reach: number; impact: string; confidence: number; effort: string };
};

export async function createKanoRequest(k: KanoInput, tx?: Tx) {
  return inTx(tx, async (t) => {
    const seq = await nextSeq(t, k.projectId, "req");
    const [row] = await t
      .insert(kanoRequests)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        subprojectId: k.subprojectId ?? null,
        seq,
        description: k.description,
        requesterName: k.requesterName,
        requesterRole: k.requesterRole ?? null,
        kanoCategory: k.kanoCategory ?? null,
        decision: k.decision ?? null,
        targetSprintId: k.targetSprintId ?? null,
        targetReleaseId: k.targetReleaseId ?? null,
        wsjfBusinessValue: k.wsjf?.businessValue ?? null,
        wsjfTimeCriticality: k.wsjf?.timeCriticality ?? null,
        wsjfRiskReduction: k.wsjf?.riskReduction ?? null,
        wsjfJobSize: k.wsjf?.jobSize ?? null,
        riceReach: k.rice?.reach ?? null,
        riceImpact: k.rice?.impact ?? null,
        riceConfidence: k.rice?.confidence ?? null,
        riceEffort: k.rice?.effort ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

// ---------------------------------------------------------------- RAID
export async function createRaidItem(
  k: Kind & {
    subprojectId?: string | null;
    itemType: "risk" | "assumption" | "issue" | "dependency";
    description: string;
    impact: number;
    likelihood?: number | null;
    mitigatingAction?: string;
    ownerId?: string | null;
    status?: "open" | "in_progress" | "mitigated" | "closed";
    targetDate?: string | null;
  },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const seq = await nextSeq(t, k.projectId, "raid");
    const status = k.status ?? "open";
    const [row] = await t
      .insert(raidItems)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        raisedById: k.createdById,
        subprojectId: k.subprojectId ?? null,
        seq,
        itemType: k.itemType,
        description: k.description,
        impact: k.impact,
        likelihood: k.likelihood ?? null,
        mitigatingAction: k.mitigatingAction ?? null,
        ownerId: k.ownerId ?? null,
        status,
        targetDate: k.targetDate ?? null,
        closedAt: status === "closed" ? new Date() : null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function listSolutionAssumptions(solutionId: string) {
  return db
    .select()
    .from(ostAssumptions)
    .where(eq(ostAssumptions.solutionId, solutionId))
    .orderBy(asc(ostAssumptions.position), asc(ostAssumptions.id));
}
