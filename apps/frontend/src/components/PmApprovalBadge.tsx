import { Badge } from "@mantine/core";
import { isPmApproved } from "@myapp/shared";

export const APPROVAL_PENDING_HINT = "Pending Project Manager approval";

/** Pending / Approved status of a task. A missing value (legacy data) counts as Pending. */
export function PmApprovalBadge({ value }: { value: string | null | undefined }) {
  const approved = isPmApproved(value);
  return (
    <Badge
      variant="light"
      color={approved ? "green" : "gray"}
      data-approval={approved ? "APPROVED" : "PENDING"}
    >
      {approved ? "Approved" : "Pending"}
    </Badge>
  );
}

/** Props that gate a completion checkbox on PM approval: disabled, aria-disabled and a hint until APPROVED. */
export function approvalGateProps(value: string | null | undefined): {
  disabled: boolean;
  "aria-disabled"?: true;
  title?: string;
} {
  return isPmApproved(value)
    ? { disabled: false }
    : { disabled: true, "aria-disabled": true, title: APPROVAL_PENDING_HINT };
}
