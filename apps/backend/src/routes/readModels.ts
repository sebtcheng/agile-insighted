import { Router } from "express";
import { projectWorkItemsQuerySchema, searchQuerySchema } from "@myapp/shared";
import { actorOf, asyncHandler, idParam, parse } from "../middleware";
import { search } from "../services/searchService";
import { getVisibleProjectIds } from "../services/visibilityService";
import { getPersonItems, getWorkload } from "../services/workloadService";
import { listProjectWorkItems } from "../services/workItemService";

/** Phase 3 read models. Mounted under /api after requireAuth; everything here is read-only and project-scoped. */
export const readModels = Router();

readModels.get(
  "/workload",
  asyncHandler(async (req, res) => {
    res.json(await getWorkload({ scope: await getVisibleProjectIds(actorOf(res)) }));
  }),
);

readModels.get(
  "/workload/:id/items",
  asyncHandler(async (req, res) => {
    res.json(await getPersonItems(idParam(req), await getVisibleProjectIds(actorOf(res))));
  }),
);

/** Every action of one project across Projects, OST, Kano, User Story Map and RAID (scopeGuard checks :id). */
readModels.get(
  "/projects/:id/work-items",
  asyncHandler(async (req, res) => {
    const q = parse(projectWorkItemsQuerySchema, req.query);
    res.json(await listProjectWorkItems(idParam(req), q, await getVisibleProjectIds(actorOf(res))));
  }),
);

readModels.get(
  "/search",
  asyncHandler(async (req, res) => {
    const { q, limit } = parse(searchQuerySchema, req.query);
    res.json(await search(q, limit, await getVisibleProjectIds(actorOf(res))));
  }),
);
