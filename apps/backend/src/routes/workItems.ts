import { Router } from "express";
import { adminLogItemParamsSchema } from "@myapp/shared";
import { actorOf, asyncHandler, parse } from "../middleware";
import { deleteWorkItem } from "../services/adminLogService";

/** Work items: any authenticated role. Mounted under /api after requireAuth. */
export const workItems = Router();

workItems.delete(
  "/work-items/:sourceModule/:itemId",
  asyncHandler(async (req, res) => {
    const { sourceModule, itemId } = parse(adminLogItemParamsSchema, req.params);
    await deleteWorkItem(actorOf(res), sourceModule, itemId);
    res.status(204).end();
  }),
);
