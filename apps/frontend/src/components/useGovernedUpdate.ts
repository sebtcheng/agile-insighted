import { useState } from "react";
import type { ActivityUpdateResult, UpdateActivityInput } from "@myapp/shared";
import { ApiClientError } from "../api/client";
import { useUpdateActivity } from "../api/hooks";
import { toast } from "./ui";

/**
 * Updates an activity and turns the two governance rules into UI state instead of dead-end errors:
 * - dod_incomplete (422): the Definition of Done has unchecked items; a PM can override with a reason.
 * - scope_change_required (409): the target sprint is active; trade something out or override.
 * The refused patch is kept so the follow-up can resend it with the missing governance fields.
 */
export function useGovernedUpdate(activityId: string) {
  const update = useUpdateActivity();
  const [pending, setPending] = useState<UpdateActivityInput | null>(null);
  const [dodMissing, setDodMissing] = useState<string[] | null>(null);
  const [needsTrade, setNeedsTrade] = useState(false);

  const clear = () => {
    setPending(null);
    setDodMissing(null);
    setNeedsTrade(false);
  };

  const run = async (patch: UpdateActivityInput): Promise<ActivityUpdateResult | null> => {
    try {
      const res = await update.mutateAsync({ id: activityId, patch });
      clear();
      for (const w of res.warnings) toast.warn(w);
      return res;
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "dod_incomplete") {
        setPending(patch);
        setDodMissing((e.details as { missing?: string[] } | undefined)?.missing ?? []);
      } else if (e instanceof ApiClientError && e.code === "scope_change_required") {
        setPending(patch);
        setNeedsTrade(true);
      } else {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
      return null;
    }
  };

  return { run, pending, dodMissing, needsTrade, clear, isPending: update.isPending };
}
