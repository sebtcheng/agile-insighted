---
name: ui-standard-audit
description: Score a repo's front-end UI from 0 to 100 against the user's approved Schools Review design standard (typography, color, cards, layout, KPI and chart treatment, tables, filters, UX and accessibility), then recommend file-specific changes to match it. Use whenever the user asks to score, grade, rate, audit, or compare an app, repo, dashboard, or folder against 'our standard', 'our design language', 'the Schools Review standard', or 'the InsightED design standard', or asks how close a project's UI is to it. Do not use for one-off screenshot critiques with no repo, for turning the user's own revision notes into a coding prompt, or for login pages.
---

# UI Standard Audit Skill

This skill scores the front-end user interface of any repository (0 to 100) against the approved **Schools Review dashboard** standard (`assets/reference-schools-review.png` and `reference/design-standard.md`). It produces objective, reproducible measurements and file-specific recommendations in the audited repository's native styling idiom, eliminating ambiguous critiques. The skill operates in a strictly read-only mode on the audited repository, writing exclusively to `<audited-repo>/ui-audit/`.

## Numbered Workflow

Follow these steps in exact sequential order:

1. **Confirm Scope**: Confirm the target repository path and which screens or routes are in scope. If the user provided only a repo path, pick the main dashboard and list screens (discover candidate routes from router definitions and page directories). Do not ask more than one clarifying question.
2. **Anchor Judgments**: Read `reference/design-standard.md` in full, then open and inspect `assets/reference-schools-review.png` once to ground every critique in the visual source of truth. Read `rules.md` before scoring.
3. **Execute Scanner**: Run the scanner script directly:
   ```bash
   python ~/.claude/skills/ui-standard-audit/scripts/scan_ui.py <repo-path> --out <repo-path>/ui-audit/scan.json
   ```
   Do not write ad-hoc scanning scripts or manual search routines.
4. **Detect Stack**: Inspect the `stack` section of `scan.json` to identify the component library (e.g., Mantine, Tailwind CSS, MUI, Chakra, Ant Design, Bootstrap, or plain CSS variables). Translate all subsequent recommendations into that stack's native idiom.
5. **Visual Inspection**: If the application can be started with an existing dev script and Playwright is already installed, capture desktop screenshots of in-scope screens at 1366px and 1440px viewport widths. If not, record `"visual check not performed"` under `unverified`. Never install new packages to run screenshots.
6. **Evaluate Criteria**: Read `reference/scoring-rubric.md` and evaluate **every criterion** in `reference/rubric.json`.
   - Score Full, Partial (~50%), or Zero points (using 0.5 multiples).
   - Every score below maximum requires non-empty `finding`, at least one verifiable `evidence` entry (`path:line`), and a structured `recommendation`.
   - Mark `na: true` only if the application genuinely lacks that UI feature (e.g., no tables in the product), and explain why in `finding`.
7. **Write Scores File**: Write `<repo-path>/ui-audit/scores.json` conforming to the schema below.
8. **Render Report**: Run the report generator directly:
   ```bash
   python ~/.claude/skills/ui-standard-audit/scripts/render_report.py --scores <repo-path>/ui-audit/scores.json --scan <repo-path>/ui-audit/scan.json --out <repo-path>/ui-audit/ui-audit-report.md
   ```
   The script computes all category subtotals, final score, and grade bands. Never compute or edit totals by hand.
9. **Finalize Implementation Prompt**: Draft a cohesive, copy-paste-ready coding prompt in the `implementation_prompt` field of `scores.json` (organized by P0, P1, and P2 priorities with file targets), then re-run `render_report.py` to embed it into the markdown report.
10. **Conclude**: Respond with the total score, grade band, the top 3 recommended changes, and the path to `ui-audit-report.md`.

## `scores.json` Schema

```json
{
  "repo": "string",
  "audited_at": "YYYY-MM-DD",
  "stack": "string",
  "screens_in_scope": ["string"],
  "verified_by": ["code", "screenshot"],
  "criteria": [
    {
      "id": "A1",
      "score": 2,
      "max": 4,
      "na": false,
      "finding": "one or two sentences",
      "evidence": ["src/theme.ts:12"],
      "recommendation": {
        "priority": "P0",
        "change": "what to change, in the repo's own stack idiom",
        "files": ["src/theme.ts"],
        "effort": "S"
      }
    }
  ],
  "unverified": ["string"],
  "implementation_prompt": "string"
}
```

- `priority`: `"P0"`, `"P1"`, or `"P2"`.
- `effort`: `"S"`, `"M"`, or `"L"`.
- `recommendation`: Required whenever `score < max` and `na: false`.

## Reference Pointers
- Standard Specification: `reference/design-standard.md`
- Scoring Rubric: `reference/scoring-rubric.md`
- Rubric JSON Manifest: `reference/rubric.json`
- Hard Constraints & Safety: `rules.md`

## Grade Bands
The report rendering script evaluates scores using the following bands:
- **90 to 100**: "Matches the standard"
- **75 to 89**: "Close"
- **60 to 74**: "Partial"
- **40 to 59**: "Diverges"
- **Below 40**: "Far from the standard"

## Acceptance Criteria
- Every criterion in `rubric.json` appears in `scores.json` exactly once, either scored or `na: true`.
- Every deduction cites evidence that exists (the path and line can be opened and show what the finding says).
- Every recommendation names the files to change and fits the audited repo's stack.
- The total, grade, and category subtotals come from `render_report.py`, not from the model.
- The report has the same sections in the same order regardless of repo.
- Anything not checked (no screenshot, no running app, unreachable routes) is listed under unverified.
- No file in the audited repo outside `ui-audit/` was modified.

## Verification Step
Before returning the final output, define the acceptance criteria. Create the first version, inspect it using `scripts/render_report.py` validation errors, spot-checking at least five cited `path:line` evidence entries by opening them, and (when a screenshot was possible) comparing the rendered screen against `assets/reference-schools-review.png`, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
