import { z } from "zod";
import { KANO_CATEGORIES } from "./enums";

const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// ---- Kano Request Tracker (Phase 7)
export const kanoCategorySchema = z.enum(KANO_CATEGORIES);
export type KanoCategory = z.infer<typeof kanoCategorySchema>;

export const MAX_KANO_SPECS = 20;
/** One revision spec. `id` present = existing row to update; absent = new row. Array order is the display order. */
export const kanoSpecInputSchema = z.object({
  id: id.optional(),
  label: text(500),
  isCompleted: z.boolean().default(false),
  targetDate: isoDate.nullable().optional(),
  responsibleId: id.nullable().optional(),
});
const kanoSpecsInput = z.array(kanoSpecInputSchema).max(MAX_KANO_SPECS);
export const toggleKanoSpecSchema = z.object({ isCompleted: z.boolean() });

export const createKanoSchema = z.object({
  /** Owning project; defaults to the project in the URL. */
  projectId: id.optional(),
  revisionRequest: text(2000),
  specs: kanoSpecsInput.optional(),
  targetDate: isoDate.nullable().optional(),
  responsibleId: id.nullable().optional(),
});
export const updateKanoSchema = z
  .object({
    projectId: id,
    revisionRequest: text(2000),
    specs: kanoSpecsInput,
    kanoCategory: kanoCategorySchema.nullable(),
    targetDate: isoDate.nullable(),
    responsibleId: id.nullable(),
  })
  .partial();
export const kanoListQuerySchema = z.object({
  kanoCategory: kanoCategorySchema.optional(),
  unevaluated: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "code"]).optional(),
});
export type KanoSpecInput = z.input<typeof kanoSpecInputSchema>;
export type ToggleKanoSpecInput = z.infer<typeof toggleKanoSpecSchema>;
export type CreateKanoInput = z.infer<typeof createKanoSchema>;
export type UpdateKanoInput = z.infer<typeof updateKanoSchema>;

export type KanoSpecDto = {
  id: string;
  label: string;
  isCompleted: boolean;
  completedAt: string | null;
  sortOrder: number;
  targetDate: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
};

/** Completion is derived from the specs, never stored: complete only when there is at least one spec and all are done. */
export function kanoCompletion(specs: ReadonlyArray<{ isCompleted: boolean }>): {
  specsTotal: number;
  specsCompleted: number;
  completionPercent: number;
  isComplete: boolean;
} {
  const specsTotal = specs.length;
  const specsCompleted = specs.filter((s) => s.isCompleted).length;
  return {
    specsTotal,
    specsCompleted,
    completionPercent: specsTotal === 0 ? 0 : Math.round((specsCompleted / specsTotal) * 100),
    isComplete: specsTotal > 0 && specsCompleted === specsTotal,
  };
}

export type KanoDto = {
  id: string;
  projectId: string;
  code: string;
  projectCode: string;
  projectName: string;
  revisionRequest: string;
  specs: KanoSpecDto[];
  specsTotal: number;
  specsCompleted: number;
  /** 0-100, rounded; 0 when there are no specs. */
  completionPercent: number;
  /** True only when there is at least one spec and every spec is done. */
  isComplete: boolean;
  kanoCategory: KanoCategory | null;
  /** Deprecated: dates now live on each spec. Kept so legacy requests still serialize. */
  targetDate: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  createdAt: string;
};
