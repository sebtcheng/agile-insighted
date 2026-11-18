import { sql } from "drizzle-orm";
import type { CodeScope } from "@myapp/shared";
import type { DbOrTx } from "../db/client";
import { codeCounters } from "../db/schema";

/**
 * Next per-project sequence number for a module (ost, usm, req, raid), used for the human-readable codes.
 * Must run inside the same transaction that inserts the coded row: the upsert row-locks the counter, so
 * parallel writers queue up instead of colliding. A rolled-back transaction leaves a gap, which is fine;
 * codes are never reused or edited.
 */
export async function nextSeq(tx: DbOrTx, projectId: string, scope: CodeScope): Promise<number> {
  const [row] = await tx
    .insert(codeCounters)
    .values({ projectId, scope, lastValue: 1 })
    .onConflictDoUpdate({
      target: [codeCounters.projectId, codeCounters.scope],
      set: { lastValue: sql`${codeCounters.lastValue} + 1` },
    })
    .returning({ value: codeCounters.lastValue });
  if (!row) throw new Error("code counter returned no row");
  return row.value;
}
