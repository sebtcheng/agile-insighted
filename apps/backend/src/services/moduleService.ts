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
    title: string;
    description?: string;
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
        title: k.title,
        description: k.description ?? null,
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
        isTargeted: k.isTargeted ?? false,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function createSolution(
  k: Kind & {
    opportunityId: string;
    title: string;
    ownerId?: string | null;
    targetDate?: string | null;
    validationStatus?: (typeof ostSolutions.$inferInsert)["validationStatus"];
  },
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
        targetDate: k.targetDate ?? null,
        ...(k.validationStatus ? { validationStatus: k.validationStatus } : {}),
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

// ---------------------------------------------------------------- User Story Mapping
export async function createPersona(k: Kind & { name: string; description?: string }, tx?: Tx) {
  return inTx(tx, async (t) => {
    const [row] = await t
      .insert(personas)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        name: k.name,
        description: k.description ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function createJourneyStep(
  k: Kind & { parentStepId?: string | null; name: string; position?: number },
  tx?: Tx,
) {
  return inTx(tx, async (t) => {
    const [row] = await t
      .insert(journeySteps)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
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
    responsibleId?: string | null;
    targetDate?: string | null;
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
        responsibleId: k.responsibleId ?? null,
        targetDate: k.targetDate ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

// ---------------------------------------------------------------- Kano
export type KanoInput = Kind & {
  revisionRequest: string;
  kanoCategory?: (typeof kanoRequests.$inferInsert)["kanoCategory"];
  targetDate?: string | null;
  responsibleId?: string | null;
};

export async function createKanoRequest(k: KanoInput, tx?: Tx) {
  return inTx(tx, async (t) => {
    const seq = await nextSeq(t, k.projectId, "req");
    const [row] = await t
      .insert(kanoRequests)
      .values({
        projectId: k.projectId,
        createdById: k.createdById,
        seq,
        revisionRequest: k.revisionRequest,
        kanoCategory: k.kanoCategory ?? null,
        targetDate: k.targetDate ?? null,
        responsibleId: k.responsibleId ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

// ---------------------------------------------------------------- RAID
export async function createRaidItem(
  k: Kind & {
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
