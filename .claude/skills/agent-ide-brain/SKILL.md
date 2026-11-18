---
name: agent-ide-brain
description: Create, update, or overwrite the AI agent IDE brain for a TypeScript/Node monorepo so Claude Code, OpenAI Codex, and Gemini CLI/Google Antigravity follow one rule set: lean AGENTS.md as single source, CLAUDE.md/GEMINI.md/.agents/rules adapters, vertical-slice backend and Feature-Sliced frontend boundaries enforced by lint, lifecycle hooks and permission guards, token-efficiency and two-tier verification rules, and hidden-Unicode scanning of instruction files. Replaces the deprecated bootstrap-ts-monorepo skill (also scaffolds apps/backend, apps/frontend, packages/shared with settings and dependencies). Use when the user says 'set up the agent brain', 'bootstrap a new TS monorepo', 'make Codex and Gemini follow the same rules as Claude', 'fix drift between AGENTS.md and CLAUDE.md', 'add hooks and guardrails for AI agents', or 'harden my agent instructions'. Not for scoring folder architecture, running CI, or splitting large files.
---

# agent-ide-brain

The `agent-ide-brain` skill establishes, updates, and hardens the AI agent IDE brain for a TypeScript/Node.js monorepo so Claude Code, OpenAI Codex, and Gemini CLI / Google Antigravity operate under a single, synchronized rule set. It provides deterministic boundary enforcement, progressive prompt caching, context rot resistance, and lifecycle hooks with circuit breakers. This skill completely supersedes and deprecates `bootstrap-ts-monorepo` while retaining every one of its monorepo scaffolding, permissions, and foundation dependency objectives.

Before modifying platform files, read `reference/platform-matrix.md`. When scaffolding or checking monorepo folders, consult `reference/folder-architecture.md`. When modifying lifecycle hooks, settings, or instruction files, review `reference/security-supply-chain.md`. Hard constraints and forbidden operations are specified in `rules.md`.

## Numbered Workflow

1. **Detect**: Run the deterministic inspection script:
   ```bash
   node .agents/skills/agent-ide-brain/scripts/detect-repo.mjs
   ```
   Inspect the JSON output (operating system, shell, Node version, package manager command prefix, detected workspaces, brain file hashes, existing skills, package scripts, and git state). Do not perform hand exploration or arbitrary recursive directory listings.

2. **Decide**: From the detected JSON facts, fill all known configuration fields. Ask the user at most three clarifying questions only for remaining gaps:
   - **Target tools**: (default: `claude`, `codex`, `gemini/antigravity`)
   - **Mode**: `bootstrap` (clean setup, skip existing files), `update` (surgical update of managed blocks and JSON merge, preserving user customizations), or `overwrite` (full replacement after timestamped backup to `.agents/backups/`).
   - **Optional modules**: CI workflow (`.github/workflows/brain-check.yml`), pre-commit hook, devcontainer sandbox, Code Knowledge Graph (default: only CI workflow enabled; all others off).
   Persist user selections into `.agents/brain.config.json`.

3. **Plan**: Run the dry-run planner:
   ```bash
   node .agents/skills/agent-ide-brain/scripts/plan-brain.mjs --mode <mode>
   ```
   Display the generated plan table indicating which files will be created, edited, overwritten, or skipped, along with the size delta and required dependencies. Obtain explicit human approval before any edit or overwrite of files not created by this skill, and before any dependency install.

4. **Apply**: Execute the brain generator:
   ```bash
   node .agents/skills/agent-ide-brain/scripts/apply-brain.mjs --mode <mode>
   ```
   Never write or hand-edit generated brain files directly.

5. **Mirror Skills**: Synchronize the canonical skill tree to Claude Code:
   ```bash
   node .agents/skills/agent-ide-brain/scripts/sync-skills.mjs
   ```

6. **Dependencies**: Output the pinned dependency installation command from `reference/dependencies.md`. Execute package installation only with human consent, in the foreground, exactly once.

7. **Verify**: Execute the deterministic verification suite:
   ```bash
   node .agents/skills/agent-ide-brain/scripts/check-brain.mjs
   node .agents/skills/agent-ide-brain/scripts/test-hooks.mjs
   ```
   Then execute the repository's own Tier 2 command once if package scripts exist.

8. **Report**: Summarize files created, edited, and overwritten, backup paths, check and test results, anything unverified, and any platform features that remain unverified according to `reference/platform-matrix.md`.

## Acceptance Criteria

- `scripts/check-brain.mjs` exits with code 0.
- `scripts/test-hooks.mjs` passes all test fixtures with zero failures.
- A second sequential run of `scripts/apply-brain.mjs` reports `0 changes (idempotent)`.
- No unresolved template tokens or placeholder text remain in generated files.
- Root `AGENTS.md` is within its budget: $\le 120$ lines and $\le 8,000$ characters.
- Every `CLAUDE.md` imports its sibling `AGENTS.md` via `@...AGENTS.md`.
- No instruction file, rule file, or hook script contains hidden Unicode.
- Skill mirror `.claude/skills/` matches `.agents/skills/` with zero drift.
- Every file overwritten in `overwrite` mode has a verified backup in `.agents/backups/<timestamp>/`.

## Verification Step

Before returning the final output, define the acceptance criteria. Create the first version, inspect it using scripts/check-brain.mjs, scripts/test-hooks.mjs and a second idempotent apply run, fix every issue, run another pass. Return only after it meets the criteria, with a short summary of what you checked. Report anything that cannot be verified.
