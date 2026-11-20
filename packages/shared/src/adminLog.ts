import { z } from "zod";
import { pmApprovalSchema } from "./enums";
import { sprintKeySchema } from "./sprint";
import { workSourceModuleSchema, type WorkItem } from "./workItems";

const id = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * Admin Log: every task/action across all projects, grouped by project, for the Project Manager.
 * Only items that have a PM approval state appear (project activities, OST solutions, USM features,
 * Kano revision specs and RAID mitigating actions), never a Kano request or RAID item that has no steps.
 */
export type AdminLogProjectGroup = {
  projectId: string;
  projectName: string;
  projectCode: string | null;
  total: number;
  approved: number;
  pending: number;
  items: WorkItem[];
};
export type AdminLogResponse = { projects: AdminLogProjectGroup[]; today: string };

/** Full-detail edit of any task. `isCompleted: true` is only accepted once the item is (or becomes) APPROVED. */
export const adminLogItemPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    assigneeId: id.nullable(),
    sprintKey: sprintKeySchema.nullable(),
    targetDate: isoDate.nullable(),
    pmApproval: pmApprovalSchema,
    isCompleted: z.boolean(),
  })
  .partial();
export type AdminLogItemPatch = z.infer<typeof adminLogItemPatchSchema>;

export const adminLogApprovalSchema = z.object({ pmApproval: pmApprovalSchema });
export type AdminLogApprovalInput = z.infer<typeof adminLogApprovalSchema>;

export const adminLogItemParamsSchema = z.object({
  sourceModule: workSourceModuleSchema,
  itemId: id,
});
