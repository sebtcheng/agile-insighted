<!-- agent-brain:begin verification-rules -->
# Verification & Token-Efficiency Rules

## 1. Search-First, Targeted-Slice Protocol
- Before reading any file exceeding 250 lines, search for specific symbols or line numbers first.
- Read cohesive slices of 150 to 250 lines around the target region (never 45-line micro-slices, and never whole 1,000-line files).
- When several non-contiguous sections of a file are needed, request all slices as parallel reads in a single turn.
- Never re-read a file in the same session if it is already in context and has not been modified.

## 2. Parallel Tool Batching Mandate
- Discovery batching: when searching or inspecting multiple files, emit 3 to 6 parallel search and read calls in a single turn whenever the calls do not depend on each other's output.
- Cross-layer edit batching: once discovery is complete, emit file modifications across backend, shared, and frontend in parallel in the same turn.
- Single-file edit consolidation: never make several sequential single-chunk edits on the same file; consolidate all replacements for that file into one turn.

## 3. Pre-Edit Test & Schema Contract Rule
- In the discovery turn, before writing any implementation code, batch-read the target module's existing unit test specs and Zod schemas together with the source files.
- Ensure that data transformations, field validations, and test assertions are fully accounted for before editing.

## 4. Run-Command Budget
- Target at most 6 CLI command executions per task. Never run an individual verification command after every single file edit.

## 5. Two-Tier Verification
- **Tier 1 (Inner Loop):**
  Batch all related edits first. Then verify with one chained foreground command scoped to modified files so it finishes in under 5 seconds:
  `{{tier1Command}}`
  No full-repo builds or whole-suite test runs in the inner loop.
- **Tier 2 (Outer Loop / CI Gate):**
  Run exactly once, as one consolidated foreground command, at the very end of the task after all edits and Tier 1 checks pass:
  `{{tier2Command}}`
  If `lint` covers `lint:fast`, drop the redundant `lint:fast` pass; never drop an uncovered gate.
  The hard rule "done means green" requires Tier 2 to pass once before concluding.

## 6. Context Payload Hygiene (Silent Reporter Rule)
- Append `--silent` or `--reporter=dot` to all test runner and package manager calls to suppress voluminous passing-test chatter.

## 7. 3-Strike Circuit Breaker
- After 3 consecutive failed repair attempts on any Tier 1 or Tier 2 verification command, stop autonomous retries, preserve the diff, and report the exact error trace.

## 8. Polling Prohibition
- Never poll task status or schedule polling for tests, linting, typechecking, or builds.
- Run all verification synchronously in the foreground.

## 9. Environment Execution Profile
- Host: {{osPlatform}} ({{osShell}}), Node.js {{nodeVersion}}.
- Always run commands from the workspace root using the detected command prefix (`{{commandPrefix}}`, `{{npxPrefix}}`).
- No exploratory environment discovery commands and no unprompted package installations.

## 10. Post-Compaction Rule
- When Tier 2 passes, record the passing status and git diff state.
- If a context compaction follows a green Tier 2 run with zero files modified since, conclude immediately without re-running verification.

## 11. No Weakening Guardrail
- No ESLint rule, TypeScript strictness setting, or unit test requirement may be weakened to pass verification.
<!-- agent-brain:end verification-rules -->
