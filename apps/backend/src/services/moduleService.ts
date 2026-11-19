import { eq } from "drizzle-orm";
import type { WorkType } from "@myapp/shared";
import { db, type Tx } from "../db/client";
import {
  journeySteps,
  kanoRequests,
  ostOpportunities,
  ostOutcomes,
  ostSolutions,
  personas,
  raidItems,
  userStories,
} from "../db/schema";
import { seedDorItems } from "./dorService";
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
    /** Custom Definition of Ready labels; omitted seeds the project defaults. */
    dorLabels?: string[];
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
    await seedDorItems(t, row.id, k.projectId, k.dorLabels);
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
