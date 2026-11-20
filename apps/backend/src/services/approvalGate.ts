import { PM_APPROVAL_REQUIRED_MESSAGE, isPmApproved } from "@myapp/shared";
import { AppError } from "../errors";

export const approvalRequired = () =>
  new AppError(403, "pm_approval_required", PM_APPROVAL_REQUIRED_MESSAGE);

/**
 * The server-side completion gate. Ticking something done (it was open, or it is new) needs a Project Manager's
 * APPROVED sign-off first; unticking and re-saving an already completed item are always allowed.
 */
export function assertCompletionAllowed(
  approval: string | null | undefined,
  change: { wasCompleted: boolean; willComplete: boolean },
): void {
  if (change.willComplete && !change.wasCompleted && !isPmApproved(approval)) {
    throw approvalRequired();
  }
}
