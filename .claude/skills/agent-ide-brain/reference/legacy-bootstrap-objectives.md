# Legacy Bootstrap Objectives Mapping

Complete mapping of all nine core objectives and additional capabilities from the deprecated `bootstrap-ts-monorepo` skill to `agent-ide-brain`.

| # | Retained Objective | Old Skill Implementation | New `agent-ide-brain` Coverage |
| --- | --- | --- | --- |
| **1** | Full new-repo setup (CLAUDE.md set, `.claude/settings.json` permissions, dependency setup) | `scripts/scaffold.mjs` wrote static files; manual instruction in SKILL.md | `scripts/apply-brain.mjs` in `bootstrap` mode writes scaffold, CLAUDE.md set, merged `settings.json`, and outputs dependency commands from `reference/dependencies.md`. |
| **2** | Full frontend/backend separation (`apps/backend`, `apps/frontend`, `packages/shared`, scoped package names `@scope/*`) | Handled via folder mkdir in `scaffold.mjs` | `assets/templates/scaffold/` and `assets/templates/AGENTS.*.md.tpl` configure `@repoName/backend`, `frontend`, `shared` with VSA and FSD layout. |
| **3** | Root `CLAUDE.md` short with routes to other files (nested files + docs), never one long file | `CLAUDE.md` had 5 lines routing to `docs/` | `assets/templates/CLAUDE.md.tpl` (≤ 30 lines) imports sibling `@AGENTS.md` and delegates all routing to `AGENTS.md`. |
| **4** | Four hard rules in root instructions: (a) no .env secrets, (b) drizzle-kit + rehearsal + rollback, (c) Tier 2 green gate before done, (d) no prod DB/VM | Embedded in `reference/agents-md-rules.md` | `assets/templates/AGENTS.root.md.tpl` and `.agents/rules/security.md.tpl` include all 4 hard rules, plus `docs/db-changes.md.tpl` and `claude/hooks/pre-tool-guard.mjs`. |
| **5** | `AGENTS.md` (plus `.agents/rules/`) as single source; `CLAUDE.md` imports it; Antigravity version included | Single `AGENTS.md` file; CLAUDE.md imported it | `AGENTS.md` is single source; `CLAUDE.md` imports it via `@AGENTS.md`; `GEMINI.md` and `.agents/rules/*.md` provide modular single source; Antigravity permissions in `.agents/rules/antigravity-permissions.md`. |
| **6** | Lint/CI tooling in starter (eslint, oxlint, CI) and Impeccable skill for UI design tasks | Listed in `package.json` scripts | `eslint.boundaries.config.mjs`, `steiger.config.ts`, `ci/brain-check.yml`, and `AGENTS.frontend.md` explicitly mandates the Impeccable skill (or equivalent). |
| **7** | All token-efficiency rules (Search-First Targeted-Slice, Batching, Edit Consolidation, Pre-Edit Contract, Two-Tier Verification, 3-Strike Breaker, Polling Ban, Environment Profile, Post-Compaction) | Embedded verbatim in `reference/agents-md-rules.md` | Fully encoded in `.agents/rules/verification.md.tpl` and enforced programmatically via `.claude/hooks/pre-tool-guard.mjs` and `stop-gate.mjs`. |
| **8** | Foundation libraries: Express, Mantine, Drizzle, Postgres, PgBouncer, Redis; zod, Vitest, Playwright, pino, Helmet, express-rate-limit, TanStack Query, BullMQ | Listed as prose in step 5 | Pinned versions and commands in `reference/dependencies.md`, scaffold templates, and detection in `detect-repo.mjs`. |
| **9** | Skills run on demand, not in a fixed order | Rule in `SKILL.md` step 3 | Declared explicitly in `AGENTS.root.md.tpl`: "Skills run on demand, not in a fixed order." |

---

## Additional Capabilities Retained from Old Skill Files:
- **Windows Command Profile**: Explicitly retains `npm.cmd` and `npx.cmd` execution without shell failures.
- **ci-gate Skill Preservation**: Maintains `.agents/skills/ci-gate/SKILL.md` as the Tier 2 outer-loop runner.
- **Non-Destructive Update Behavior**: Preserves user-added rules in `AGENTS.md` and custom hooks in `settings.json` during updates.
