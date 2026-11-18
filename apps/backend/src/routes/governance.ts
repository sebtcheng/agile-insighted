import { Router } from "express";
import {
  addDependencySchema,
  createChecklistTemplateSchema,
  createReleaseSchema,
  setCapacitySchema,
  setChecklistCheckSchema,
  updateChecklistTemplateSchema,
  updateReleaseSchema,
} from "@myapp/shared";
import { z } from "zod";
import { actorOf, asyncHandler, idParam, parse, requireAction } from "../middleware";
import * as gov from "../services/governanceService";

/** Phase 2 routes. Mounted under /api after requireAuth. */
export const governance = Router();

// ---- releases
governance.get(
  "/projects/:id/releases",
  asyncHandler(async (req, res) => {
    res.json({ items: await gov.listReleases(idParam(req)) });
  }),
);
governance.post(
  "/projects/:id/releases",
  requireAction("release.write"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await gov.createRelease(idParam(req), parse(createReleaseSchema, req.body)));
  }),
);
governance.patch(
  "/releases/:id",
  requireAction("release.write"),
  asyncHandler(async (req, res) => {
    res.json(await gov.updateRelease(idParam(req), parse(updateReleaseSchema, req.body)));
  }),
);
governance.delete(
  "/releases/:id",
  requireAction("release.write"),
  asyncHandler(async (req, res) => {
    await gov.deleteRelease(idParam(req));
    res.status(204).end();
  }),
);

// ---- sprint capacity and scope changes
governance.get(
  "/sprints/:id/capacity",
  asyncHandler(async (req, res) => {
    res.json(await gov.getSprintCapacity(idParam(req)));
  }),
);
governance.put(
  "/sprints/:id/capacity",
  requireAction("capacity.write"),
  asyncHandler(async (req, res) => {
    const { members } = parse(setCapacitySchema, req.body);
    res.json(await gov.setSprintCapacity(idParam(req), members));
  }),
);
governance.get(
  "/sprints/:id/scope-changes",
  asyncHandler(async (req, res) => {
    res.json({ items: await gov.listScopeChanges(idParam(req)) });
  }),
);

// ---- dependencies (team members may change them on activities assigned to them; enforced in the service)
governance.get(
  "/activities/:id/dependencies",
  asyncHandler(async (req, res) => {
    res.json(await gov.listDependencies(idParam(req)));
  }),
);
governance.post(
  "/activities/:id/dependencies",
  requireAction("dependency.write"),
  asyncHandler(async (req, res) => {
    const { blockingActivityId } = parse(addDependencySchema, req.body);
    await gov.addDependency(actorOf(res), idParam(req), blockingActivityId);
    res.status(201).json(await gov.listDependencies(idParam(req)));
  }),
);
governance.delete(
  "/activities/:id/dependencies/:blockingId",
  requireAction("dependency.write"),
  asyncHandler(async (req, res) => {
    await gov.removeDependency(actorOf(res), idParam(req), idParam(req, "blockingId"));
    res.status(204).end();
  }),
);

// ---- checklists
governance.get(
  "/projects/:id/checklist-templates",
  asyncHandler(async (req, res) => {
    res.json({ items: await gov.listTemplates(idParam(req)) });
  }),
);
governance.post(
  "/projects/:id/checklist-templates",
  requireAction("checklist_template.write"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await gov.createTemplate(idParam(req), parse(createChecklistTemplateSchema, req.body)));
  }),
);
governance.patch(
  "/checklist-templates/:id",
  requireAction("checklist_template.write"),
  asyncHandler(async (req, res) => {
    res.json(
      await gov.updateTemplate(idParam(req), parse(updateChecklistTemplateSchema, req.body)),
    );
  }),
);
governance.get(
  "/activities/:id/checklist",
  asyncHandler(async (req, res) => {
    res.json({ items: await gov.getActivityChecklist(idParam(req)) });
  }),
);
governance.put(
  "/activities/:id/checklist/:templateId",
  requireAction("checklist_check.write"),
  asyncHandler(async (req, res) => {
    const { checked } = parse(setChecklistCheckSchema, req.body);
    res.json({
      items: await gov.setChecklistCheck(
        actorOf(res),
        idParam(req),
        idParam(req, "templateId"),
        checked,
      ),
    });
  }),
);

// ---- gate overrides (read-only audit list, PM)
governance.get(
  "/gate-overrides",
  requireAction("gate_override.read"),
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({
        entityType: z.enum(["story", "activity", "solution"]).optional(),
        entityId: z.string().uuid().optional(),
      }),
      req.query,
    );
    res.json({ items: await gov.listOverrides(q) });
  }),
);
