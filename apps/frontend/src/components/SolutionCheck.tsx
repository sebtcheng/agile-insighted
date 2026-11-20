import { Badge, Checkbox } from "@mantine/core";
import type { SolutionDto } from "@myapp/shared";
import { useToggleSolution } from "../api/hooks";
import { isSolutionDone } from "../lib/ostOptimistic";
import { approvalGateProps } from "./PmApprovalBadge";
import { toast } from "./ui";

/**
 * A solution is the action: ticking marks it validated, unticking returns it to planned. The update is
 * optimistic (see useToggleSolution) and rolls back with a toast if the request fails.
 */
export function SolutionCheck({
  solution,
  editable,
}: {
  solution: SolutionDto;
  editable: boolean;
}) {
  const toggle = useToggleSolution();
  const done = isSolutionDone(solution);
  const gate = approvalGateProps(solution.pmApproval);
  return (
    <Checkbox
      size="xs"
      className="ost-action-check"
      checked={done}
      disabled={!editable || gate.disabled}
      aria-disabled={gate["aria-disabled"]}
      title={gate.title}
      aria-label={`${solution.code} ${solution.title}`}
      label={
        <>
          <b>{solution.code}</b> {solution.title}
          {solution.convertedStoryCode ? (
            <Badge size="xs" variant="outline" ml={6}>
              {solution.convertedStoryCode}
            </Badge>
          ) : null}
        </>
      }
      onChange={(e) =>
        toggle.mutate(
          { id: solution.id, checked: e.currentTarget.checked },
          { onError: (err) => toast.error(err.message) },
        )
      }
    />
  );
}
