import { Router } from "express";
import { z } from "zod";
import {
  convertSolutionSchema,
  createJourneyStepSchema,
  createOpportunitySchema,
  createOutcomeSchema,
  createSolutionSchema,
  updateOpportunitySchema,
  updateOutcomeSchema,
  updateSolutionSchema,
  createKanoSchema,
  kanoListQuerySchema,
  promoteKanoSchema,
  updateKanoSchema,
  createPersonaSchema,
  createRaidSchema,
  createStorySchema,
  raidListQuerySchema,
  toggleMitigatingActionSchema,
  setChecklistCheckSchema,
  storyMapQuerySchema,
  createDorItemSchema,
  updateDorItemSchema,
  updateJourneyStepSchema,
  updatePersonaSchema,
  updateRaidSchema,
  updateStorySchema,
} from "@myapp/shared";
import { actorOf, asyncHandler, idParam, parse, requireAction } from "../middleware";
import * as kano from "../services/kanoService";
import * as ost from "../services/ostService";
import * as raid from "../services/raidService";
import * as stories from "../services/storyService";

/** Module routes (RAID, Story Map, Kano, OST). Mounted under /api after requireAuth. */
export const modules = Router();

// ---- RAID log
modules.get(
  "/projects/:id/raid",
  asyncHandler(async (req, res) => {
    const q = parse(raidListQuerySchema, req.query);
    res.json({
      items: await raid.listRaid(idParam(req), {
        subprojectId: q.subprojectId,
        itemType: q.itemType,
        status: q.status,
        ownerId: q.ownerId,
        openOnly: q.openOnly === "true",
      }),
    });
  }),
);
modules.post(
  "/projects/:id/raid",
  requireAction("raid.create"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await raid.createRaid(actorOf(res), idParam(req), parse(createRaidSchema, req.body)));
  }),
);
modules.patch(
  "/raid/:id",
  requireAction("raid.manage"),
  asyncHandler(async (req, res) => {
    res.json(await raid.updateRaid(idParam(req), parse(updateRaidSchema, req.body)));
  }),
);
modules.patch(
  "/raid/:id/mitigating-actions/:actionId",
  requireAction("raid.manage"),
  asyncHandler(async (req, res) => {
    const { isCompleted } = parse(toggleMitigatingActionSchema, req.body);
    res.json(
      await raid.setMitigatingActionCompleted(idParam(req), idParam(req, "actionId"), isCompleted),
    );
  }),
);
modules.delete(
  "/raid/:id",
  requireAction("raid.manage"),
  asyncHandler(async (req, res) => {
    await raid.deleteRaid(idParam(req));
    res.status(204).end();
  }),
);

// ---- User Story Mapping
modules.get(
  "/story-map",
  asyncHandler(async (req, res) => {
    const { subprojectId } = parse(storyMapQuerySchema, req.query);
    res.json(await stories.getStoryMap(subprojectId));
  }),
);
modules.post(
  "/projects/:id/personas",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await stories.createPersona(
          actorOf(res),
          idParam(req),
          parse(createPersonaSchema, req.body),
        ),
      );
  }),
);
modules.patch(
  "/personas/:id",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    res.json(await stories.updatePersona(idParam(req), parse(updatePersonaSchema, req.body)));
  }),
);
modules.delete(
  "/personas/:id",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    await stories.deletePersona(idParam(req));
    res.status(204).end();
  }),
);
modules.post(
  "/subprojects/:id/journey-steps",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await stories.createStep(
          actorOf(res),
          idParam(req),
          parse(createJourneyStepSchema, req.body),
        ),
      );
  }),
);
modules.patch(
  "/journey-steps/:id",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    res.json(await stories.updateStep(idParam(req), parse(updateJourneyStepSchema, req.body)));
  }),
);
modules.delete(
  "/journey-steps/:id",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    await stories.deleteStep(idParam(req));
    res.status(204).end();
  }),
);
modules.post(
  "/subprojects/:id/stories",
  requireAction("story.create"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await stories.createStoryFor(
          actorOf(res),
          idParam(req),
          parse(createStorySchema, req.body),
        ),
      );
  }),
);
modules.patch(
  "/stories/:id",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    res.json(
      await stories.updateStory(actorOf(res), idParam(req), parse(updateStorySchema, req.body)),
    );
  }),
);
modules.delete(
  "/stories/:id",
  requireAction("story.manage"),
  asyncHandler(async (req, res) => {
    await stories.deleteStory(idParam(req));
    res.status(204).end();
  }),
);
modules.get(
  "/stories/:id/checklist",
  asyncHandler(async (req, res) => {
    res.json({ items: await stories.getStoryChecklist(idParam(req)) });
  }),
);
modules.put(
  "/stories/:id/checklist/:templateId",
  requireAction("checklist_check.write"),
  asyncHandler(async (req, res) => {
    const { checked } = parse(setChecklistCheckSchema, req.body);
    res.json({
      items: await stories.setStoryCheck(
        actorOf(res),
        idParam(req),
        idParam(req, "templateId"),
        checked,
      ),
    });
  }),
);
modules.post(
  "/stories/:id/dor-items",
  requireAction("checklist_check.write"),
  asyncHandler(async (req, res) => {
    const { label } = parse(createDorItemSchema, req.body);
    res.status(201).json(await stories.addStoryDorItem(idParam(req), label));
  }),
);
modules.patch(
  "/stories/:id/dor-items/:itemId",
  requireAction("checklist_check.write"),
  asyncHandler(async (req, res) => {
    res.json(
      await stories.updateStoryDorItem(
        idParam(req),
        idParam(req, "itemId"),
        parse(updateDorItemSchema, req.body),
      ),
    );
  }),
);
modules.delete(
  "/stories/:id/dor-items/:itemId",
  requireAction("checklist_check.write"),
  asyncHandler(async (req, res) => {
    res.json(await stories.removeStoryDorItem(idParam(req), idParam(req, "itemId")));
  }),
);

// ---- Kano Request Tracker
modules.get(
  "/projects/:id/kano",
  asyncHandler(async (req, res) => {
    const q = parse(kanoListQuerySchema, req.query);
    res.json({
      items: await kano.listKano(idParam(req), {
        subprojectId: q.subprojectId,
        kanoCategory: q.kanoCategory,
        decision: q.decision,
        unevaluated: q.unevaluated === "true",
        sort: q.sort,
      }),
    });
  }),
);
modules.post(
  "/projects/:id/kano",
  requireAction("kano.create"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await kano.createKano(actorOf(res), idParam(req), parse(createKanoSchema, req.body)));
  }),
);
modules.patch(
  "/kano/:id",
  requireAction("kano.manage"),
  asyncHandler(async (req, res) => {
    res.json(await kano.updateKano(idParam(req), parse(updateKanoSchema, req.body)));
  }),
);
modules.delete(
  "/kano/:id",
  requireAction("kano.manage"),
  asyncHandler(async (req, res) => {
    await kano.deleteKano(idParam(req));
    res.status(204).end();
  }),
);
modules.post(
  "/kano/:id/promote",
  requireAction("kano.manage"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await kano.promoteKano(actorOf(res), idParam(req), parse(promoteKanoSchema, req.body)));
  }),
);

// ---- Opportunity Solution Tree
modules.get(
  "/projects/:id/ost",
  asyncHandler(async (req, res) => {
    const q = parse(z.object({ subprojectId: z.string().uuid().optional() }), req.query);
    res.json(await ost.getTree(idParam(req), q.subprojectId));
  }),
);
modules.post(
  "/projects/:id/ost/outcomes",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await ost.createOutcome(actorOf(res), idParam(req), parse(createOutcomeSchema, req.body)),
      );
  }),
);
modules.patch(
  "/ost/outcomes/:id",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    res.json(await ost.updateOutcome(idParam(req), parse(updateOutcomeSchema, req.body)));
  }),
);
modules.delete(
  "/ost/outcomes/:id",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    await ost.deleteOutcome(idParam(req));
    res.status(204).end();
  }),
);
modules.post(
  "/ost/outcomes/:id/opportunities",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await ost.createOpportunity(
          actorOf(res),
          idParam(req),
          parse(createOpportunitySchema, req.body),
        ),
      );
  }),
);
modules.patch(
  "/ost/opportunities/:id",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    res.json(await ost.updateOpportunity(idParam(req), parse(updateOpportunitySchema, req.body)));
  }),
);
modules.delete(
  "/ost/opportunities/:id",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    await ost.deleteOpportunity(idParam(req));
    res.status(204).end();
  }),
);
modules.post(
  "/ost/opportunities/:id/solutions",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await ost.createSolution(actorOf(res), idParam(req), parse(createSolutionSchema, req.body)),
      );
  }),
);
modules.patch(
  "/ost/solutions/:id",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    res.json(await ost.updateSolution(idParam(req), parse(updateSolutionSchema, req.body)));
  }),
);
modules.delete(
  "/ost/solutions/:id",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    await ost.deleteSolution(idParam(req));
    res.status(204).end();
  }),
);
modules.post(
  "/ost/solutions/:id/convert",
  requireAction("ost.manage"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await ost.convertSolution(
          actorOf(res),
          idParam(req),
          parse(convertSolutionSchema, req.body),
        ),
      );
  }),
);
