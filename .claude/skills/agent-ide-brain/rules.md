# Hard Rules for agent-ide-brain

## 1. Safety & Non-Destructive Operation
- Never run `apply-brain.mjs` in `overwrite` mode without a verified timestamped backup in `.agents/backups/` and explicit human approval.
- Never delete existing repository files.
- Never touch application source code, database schemas, migration files, or existing `package.json` scripts. The only permitted `package.json` modification is adding devDependencies, and only with user approval.

## 2. Supply-Chain & Integrity Defense
- Never write fetched, pasted, or unvetted third-party text into instruction or rule files without human review. Instruction files are executable supply-chain artifacts.
- Never claim guarantees (such as "zero-regression" or "mathematically guaranteed") in generated files, rule text, or task reports. Structural linting and automated tests reduce regression risk; they do not mathematically eliminate it.
- Never inject invisible or bidirectional Unicode characters into instruction files, skills, or hook scripts.

## 3. Platform Alignment & Non-Duplication
- Never enable a hook, configuration key, or platform feature marked UNVERIFIED in `reference/platform-matrix.md`.
- Never duplicate rule text across `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and rule files. Harness adapter files must contain only tool-specific deltas and reference or import the single source (`AGENTS.md`).
- Do not generate `CODEX_PROJECT_MEMORY.md` (source is an unvetted third-party convention, not an official Codex capability).

## 4. Secrets & Sandboxing
- Never read, print, log, or commit `.env` or `.env.*` secrets.
- Never weaken ESLint configurations, TypeScript strictness settings, or unit test suites.
- Never install optional modules (Code Knowledge Graph, devcontainer sandbox, pre-commit scan) unless explicitly opted into by the user.

---

## Known Failure Modes to Prevent

- **Monolithic `AGENTS.md`**: Exceeding the strict budget ($\le 120$ lines, $\le 8,000$ characters).
- **Broken Harness Imports**: `CLAUDE.md` files failing to import their sibling `AGENTS.md` via `@...AGENTS.md`.
- **Instruction Drift**: Copy-pasting identical markdown paragraphs into multiple instruction files instead of linking or importing.
- **Antigravity Rule Truncation**: Rule files exceeding 10,000 characters, risking silent truncation at the 12,000-character / 24,000-byte boundary.
- **Infinite Stop Hook Loops**: Writing a `Stop` lifecycle hook without checking `stop_hook_active` before blocking termination.
- **Host Script Incompatibilities**: Hook scripts relying on `bash` or `python` on Windows hosts. All hook scripts must run on Node.js (`.mjs`).
- **Self-Blocking Guards**: Guard regex patterns in `pre-tool-guard.mjs` intercepting the skill's own script execution (`apply-brain.mjs`, `check-brain.mjs`).
- **Unbacked Overwrites**: Replacing an existing user-crafted brain file without creating a backup.
