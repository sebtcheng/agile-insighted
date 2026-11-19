import { Router } from "express";
import { insightsQuerySchema, portfolioQuerySchema, searchQuerySchema } from "@myapp/shared";
import { z } from "zod";
import { actorOf, asyncHandler, idParam, parse } from "../middleware";
import { getInsights } from "../services/insightsService";
import { getPortfolio } from "../services/portfolioService";
import { search } from "../services/searchService";
import { getVisibleProjectIds } from "../services/visibilityService";
import { getPersonItems, getWorkload } from "../services/workloadService";

/** Phase 3 read models. Mounted under /api after requireAuth; everything here is read-only and project-scoped. */
export const readModels = Router();

readModels.get(
  "/portfolio",
  asyncHandler(async (req, res) => {
    const actor = actorOf(res);
    const scope = await getVisibleProjectIds(actor);
    res.json(await getPortfolio(actor, parse(portfolioQuerySchema, req.query), new Date(), scope));
  }),
);

readModels.get(
  "/workload",
  asyncHandler(async (req, res) => {
    const { projectId } = parse(z.object({ projectId: z.string().uuid().optional() }), req.query);
    res.json(await getWorkload({ projectId, scope: await getVisibleProjectIds(actorOf(res)) }));
  }),
);

readModels.get(
  "/workload/:id/items",
  asyncHandler(async (req, res) => {
    res.json(await getPersonItems(idParam(req), await getVisibleProjectIds(actorOf(res))));
  }),
);

readModels.get(
  "/search",
  asyncHandler(async (req, res) => {
    const { q, limit } = parse(searchQuerySchema, req.query);
    res.json(await search(q, limit, await getVisibleProjectIds(actorOf(res))));
  }),
);

readModels.get(
  "/insights",
  asyncHandler(async (req, res) => {
    res.json(
      await getInsights(
        parse(insightsQuerySchema, req.query),
        new Date(),
        await getVisibleProjectIds(actorOf(res)),
      ),
    );
  }),
);
