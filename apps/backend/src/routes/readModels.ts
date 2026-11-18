import { Router } from "express";
import { portfolioQuerySchema, searchQuerySchema } from "@myapp/shared";
import { z } from "zod";
import { actorOf, asyncHandler, idParam, parse } from "../middleware";
import { getPortfolio } from "../services/portfolioService";
import { search } from "../services/searchService";
import { getPersonItems, getWorkload } from "../services/workloadService";

/** Phase 3 read models. Mounted under /api after requireAuth; everything here is read-only. */
export const readModels = Router();

readModels.get(
  "/portfolio",
  asyncHandler(async (req, res) => {
    res.json(await getPortfolio(actorOf(res), parse(portfolioQuerySchema, req.query)));
  }),
);

readModels.get(
  "/workload",
  asyncHandler(async (req, res) => {
    const { projectId } = parse(z.object({ projectId: z.string().uuid().optional() }), req.query);
    res.json(await getWorkload({ projectId }));
  }),
);

readModels.get(
  "/workload/:id/items",
  asyncHandler(async (req, res) => {
    res.json(await getPersonItems(idParam(req)));
  }),
);

readModels.get(
  "/search",
  asyncHandler(async (req, res) => {
    const { q, limit } = parse(searchQuerySchema, req.query);
    res.json(await search(q, limit));
  }),
);
