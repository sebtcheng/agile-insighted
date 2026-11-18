# Enterprise Architecture Best Practices for AI Agent IDE Brains

A distilled architectural reference for maintaining deterministic guardrails, preventing context rot, and avoiding regressions across Claude Code, OpenAI Codex, and Gemini CLI / Google Antigravity.

## Table of Contents
1. [Folder Architecture](#1-folder-architecture)
2. [Deterministic Boundaries](#2-deterministic-boundaries)
3. [Instruction Layering](#3-instruction-layering)
4. [Context Rot Management](#4-context-rot-management)
5. [Retrieval & Repository Maps](#5-retrieval--repository-maps)
6. [Lifecycle Hooks & Circuit Breakers](#6-lifecycle-hooks--circuit-breakers)
7. [Edit Protocol](#7-edit-protocol)
8. [Two-Tier Verification](#8-two-tier-verification)
9. [Supply-Chain & Execution Security](#9-supply-chain--execution-security)

---

## 1. Folder Architecture
- **Problem**: Transformer self-attention scales $O(N^2)$ with token length. Irrelevant code tokens (distractors) impair model reasoning more than pure noise. Monolithic layered folders (controllers/services/models) force an agent to ingest multiple unrelated domains just to modify one endpoint.
- **Solution**:
  - **Backend**: Vertical Slice Architecture (VSA). Co-locate endpoint routing, request validation, business logic, persistence repository, and unit specs within a single self-contained directory (`src/features/[slice]/`).
  - **Frontend**: Feature-Sliced Design (FSD). Strict layer ordering: `app` > `pages` > `widgets` > `features` > `entities` > `shared`.
  - Slices on the same layer must never import from each other. Every slice exposes an explicit public API via `index.ts`.

## 2. Deterministic Boundaries
- **Problem**: Natural language rules in markdown are advisory. Under heavy reasoning load or long contexts, models forget or ignore markdown instructions.
- **Solution**: Enforce structural rules deterministically via tooling:
  - `eslint-plugin-boundaries` in ESLint flat configuration validates allowed dependencies between layers and elements.
  - `@feature-sliced/steiger` validates file-system layout and layer isolation for FSD.
  - Failures appear directly in stdout/stderr during lint runs so agents self-correct automatically.

## 3. Instruction Layering
- **Problem**: Monolithic instruction files flood context windows, risk token limits, and suffer from "lost-in-the-middle" recall degradation. Furthermore, Google Antigravity silently truncates rule files exceeding ~12,000 characters (24,000 bytes).
- **Solution**:
  - Root `AGENTS.md` is ruthlessly lean (hard budget: $\le 120$ lines, $\le 8,000$ characters). It contains only commands, architecture mandates, hard rules, verification links, and a routing table.
  - Detailed procedures live in `.agents/rules/` and on-demand `.agents/skills/<name>/SKILL.md`.
  - Harness adapters (`CLAUDE.md`, `GEMINI.md`, `.codex/config.toml`) contain only harness-specific deltas and import/reference `AGENTS.md`.

## 4. Context Rot Management
- **Problem**: In long sessions, accumulated transcripts create prompt degradation. Model attention dilutes across old tool outputs.
- **Solution**: Progressive Prompt Ephemerality (PPE):
  - **Tier 1 (Stable System Instructions)**: Static `AGENTS.md` and harness configurations cached via prompt caching.
  - **Tier 2 (Condensed Session Memory)**: Persistent, append-only summary in `docs/agent-state/summary.md` and serialized hook state (`.claude/state/session-state.json`).
  - **Tier 3 (Ephemeral Raw Output)**: Output-suppressing flags (`--silent`, `--reporter=dot`) prevent hundreds of passing test lines from bloating context.

## 5. Retrieval & Repository Maps
- **Problem**: Vector RAG frequently fails on multi-hop architectural queries (e.g. "which slices depend on entity user?").
- **Solution**: Deterministic AST-based Code Knowledge Graphs (CKG) via Tree-sitter or dependency-cruiser provide deterministic call/import hierarchies. Kept as an optional opt-in module.

## 6. Lifecycle Hooks & Circuit Breakers
- **Problem**: Autonomous agents can enter infinite repair loops, execute destructive commands, or terminate without verifying changes.
- **Solution**:
  - `PreToolUse`: Intercept destructive shell commands (`rm -rf /`, `git reset --hard`, reading `.env`) and block protected path edits. Return exit code 2 to inject feedback directly to the model.
  - `PostToolUse`: Run fast formatters/linters on edited files; record Tier 2 completion markers.
  - `PreCompact` & `SessionStart`: Serialize and restore active invariants and changed file lists across context compactions.
  - `Stop`: Check git status against the Tier 2 marker. If source changed without a green Tier 2 pass, block termination with exit code 2 (guarding with `stop_hook_active` to prevent loops).
  - Circuit Breakers: Cap total tool calls per session (e.g. 300) to halt runaway loops.

## 7. Edit Protocol
- **Search-First, Targeted-Slice**: For files exceeding 250 lines, search for line numbers and read 150–250 line cohesive windows.
- **Pre-Edit Contract**: Batch-read unit tests and Zod schemas together with source code before editing.
- **Batching & Consolidation**: Issue 3–6 discovery calls in parallel; consolidate multiple edits to the same file into a single multi-chunk operation.

## 8. Two-Tier Verification
- **Tier 1 (Inner Loop)**: Sub-5-second targeted test and lint on modified slices only. Fast feedback loop during development.
- **Tier 2 (Outer Loop / CI Gate)**: Consolidated full verification (`lint`, `typecheck`, `test:unit`, `build`) run exactly once after all changes pass Tier 1.
- **3-Strike Circuit Breaker**: Halt after 3 failed repair attempts on any command and report the error trace.

## 9. Supply-Chain & Execution Security
- **Instruction Files as Attack Surface**: Instruction files (`AGENTS.md`, `CLAUDE.md`, skills) execute with agent authority. Untrusted web content must never be written into instructions.
- **Hidden Unicode Scanning**: Reject zero-width characters, bidirectional overrides, and tag characters in instruction files.
- **Environment Isolation**: Deny reading `.env` secrets; gate remote shell (`ssh`, `scp`) and remote DB access.
