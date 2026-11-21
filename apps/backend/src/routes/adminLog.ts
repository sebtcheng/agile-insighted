import { Router } from "express";
import {
  adminLogApprovalSchema,
  adminLogItemParamsSchema,
  adminLogItemPatchSchema,
} from "@myapp/shared";
import { actorOf, asyncHandler, parse, requireAction } from "../middleware";
import { deleteAdminLogItem, listAdminLog, updateAdminLogItem } from "../services/adminLogService";

/** Admin Log: Project Manager only. Mounted under /api after requireAuth. */
export const adminLog = Router();

adminLog.get(
  "/admin-log",
  requireAction("adminlog.manage"),
  asyncHandler(async (_req, res) => {
    res.json(await listAdminLog());
  }),
);

adminLog.patch(
  "/admin-log/items/:sourceModule/:itemId",
  requireAction("adminlog.manage"),
  asyncHandler(async (req, res) => {
    const { sourceModule, itemId } = parse(adminLogItemParamsSchema, req.params);
    const patch = parse(adminLogItemPatchSchema, req.body);
    res.json(await updateAdminLogItem(actorOf(res), sourceModule, itemId, patch));
  }),
);

adminLog.patch(
  "/admin-log/items/:sourceModule/:itemId/approval",
  requireAction("adminlog.manage"),
  asyncHandler(async (req, res) => {
    const { sourceModule, itemId } = parse(adminLogItemParamsSchema, req.params);
    const { pmApproval } = parse(adminLogApprovalSchema, req.body);
    res.json(await updateAdminLogItem(actorOf(res), sourceModule, itemId, { pmApproval }));
  }),
);

adminLog.delete(
  "/admin-log/items/:sourceModule/:itemId",
  requireAction("adminlog.manage"),
  asyncHandler(async (req, res) => {
    const { sourceModule, itemId } = parse(adminLogItemParamsSchema, req.params);
    await deleteAdminLogItem(actorOf(res), sourceModule, itemId);
    res.status(204).end();
  }),
);
