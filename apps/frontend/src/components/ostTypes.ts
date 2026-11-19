import type { OpportunityDto, OstTreeDto, OutcomeDto, SolutionDto } from "@myapp/shared";

/** Which OST form is open. Shared by the tree page and the table view so neither imports the other. */
export type OstDialog =
  | { kind: "outcome"; existing?: OutcomeDto }
  | { kind: "opportunity"; outcomeId: string; existing?: OpportunityDto }
  | { kind: "solution"; opportunityId: string; existing?: SolutionDto }
  | null;

/** What every OST row needs: the tree, permissions and the dialog and drawer openers. */
export type OstCtx = {
  tree: OstTreeDto;
  isPm: boolean;
  readOnly: boolean;
  setDialog: (d: OstDialog) => void;
  openSolution: (id: string) => void;
};
