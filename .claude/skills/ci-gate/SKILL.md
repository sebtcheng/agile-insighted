---
name: ci-gate
description: Tier 2 outer-loop gate. Run once, as one consolidated foreground command, at the very end of a task after all edits and Tier 1 checks pass.
---

# ci-gate (Tier 2)

Run exactly once, at the very end, as ONE consolidated foreground command:

`npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test:unit -- --reporter=dot && npm.cmd run build`

- `lint` covers `lint:fast` (oxlint then eslint), so there is no separate `lint:fast` pass. If a repo's `lint` does not cover `lint:fast`, prepend `npm.cmd run lint:fast &&`. Never drop a gate that is not covered.
- Passing-test output is suppressed with `--reporter=dot`; add `--silent` to npm calls if output is noisy.
- Foreground only. No polling, no background tasks, no status checks.
- 3-Strike Circuit Breaker: after 3 consecutive failed repair attempts, stop and report the exact error trace.
- Never weaken a lint rule, TypeScript strictness setting or unit test to pass.
- After a green run, record the passing status and git diff state; if nothing changed since, do not re-run.
