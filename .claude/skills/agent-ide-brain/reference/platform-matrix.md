# Platform Feature & Harness Matrix

Comprehensive reference matrix comparing AI coding agent harnesses: Claude Code, OpenAI Codex CLI, Gemini CLI, and Google Antigravity.

## Tool Capability Mapping (Tool-Neutral Vocabulary)

To keep instructions and rules portable across harnesses, use the neutral capability descriptions:

| Tool-Neutral Operation | Claude Code | OpenAI Codex CLI | Gemini CLI | Google Antigravity |
| --- | --- | --- | --- | --- |
| **Read with range** | `View` / `Read` | `read_file` | `read_file` | `read_file` (StartLine, EndLine) |
| **Structural search** | `Grep` / `Glob` | `grep` / `file_search` | `grep_search` | `run_command` (git grep) / search |
| **Consolidated edit** | `Edit` / `MultiEdit` | `apply_diff` / `edit` | `replace` / `edit_file` | `edit_file` / `write_file` |
| **Command execution** | `Bash` | `exec` / `bash` | `run_shell_command` | `run_command` |

---

## 1. Claude Code (Anthropic)

| Aspect | Behavior & Configuration | Status |
| --- | --- | --- |
| **Files Read** | Root `CLAUDE.md`, nested subfolder `CLAUDE.md`, `~/.claude/CLAUDE.md` | VERIFIED (2026-11, anthropic.com/claude-code) |
| **Import Syntax** | `@path/to/file.md` expands target inline; relative to importing file; max recursion 4 | VERIFIED (2026-11, docs.anthropic.com) |
| **Size Limits** | No hard byte limit on `CLAUDE.md`, but prompt cache favors < 8,000 tokens | VERIFIED (2026-11, docs.anthropic.com) |
| **Hook Events** | `PreToolUse`, `PostToolUse`, `PreCompact`, `SessionStart`, `Stop` | VERIFIED (2026-11, claude.com/hooks) |
| **Hook Exit Codes** | Exit 0: allow; Exit 1: warning; Exit 2: block tool execution and pipe `stderr` to model | VERIFIED (2026-11, claude.com/hooks) |
| **Hook Loop Prevention** | `stop_hook_active: true` in payload prevents infinite recursion on Stop event; 8-block cap | VERIFIED (2026-11, claude.com/hooks) |
| **PostCompact Hook** | No native `PostCompact` hook; use `SessionStart` with `additionalContext` for context injection | VERIFIED (2026-11, claude.com/hooks) |
| **Permissions Config** | `permissions.deny`, `permissions.ask`, `permissions.allow` in `.claude/settings.json` | VERIFIED (2026-11, claude.com/settings) |
| **Local Overrides** | `.claude/settings.local.json` (gitignored, machine-specific) | VERIFIED (2026-11, claude.com/settings) |

---

## 2. OpenAI Codex CLI

| Aspect | Behavior & Configuration | Status |
| --- | --- | --- |
| **Files Read** | Discovers `AGENTS.md` at repository root and `~/.codex/AGENTS.md` | VERIFIED (2026-11, openai.com/codex-cli) |
| **Import Syntax** | Markdown links; no native `@import` inline expansion | VERIFIED (2026-11, agents.md standard) |
| **Size Limits** | Context-window dependent; recommended ≤ 10,000 tokens | VERIFIED (2026-11, openai.com/codex-cli) |
| **Lifecycle Hooks** | Native client hooks system not currently supported in CLI harness | UNVERIFIED (Relies on sandbox & CI check) |
| **Sandbox & Permissions** | Configured via `.codex/config.toml`: `approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `[sandbox_workspace_write] network_access = false` | VERIFIED (2026-11, openai.com/codex-cli/config) |
| **Project Memory** | `CODEX_PROJECT_MEMORY.md` is unvetted third-party convention; not official | UNVERIFIED (Omitted per rules) |

---

## 3. Gemini CLI

| Aspect | Behavior & Configuration | Status |
| --- | --- | --- |
| **Files Read** | `GEMINI.md` by default; configurable via `context.fileName` in `.gemini/settings.json` | VERIFIED (2026-11, google.dev/gemini-cli) |
| **Context File Array** | `"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }` allows multi-file discovery | VERIFIED (2026-11, google.dev/gemini-cli) |
| **Import Syntax** | Markdown links or `@` include syntax | VERIFIED (2026-11, google.dev/gemini-cli) |
| **Size Limits** | 24,000 bytes max file size; truncation over 12,000 characters | VERIFIED (2026-11, google.dev/gemini-cli) |
| **Lifecycle Hooks** | CLI hooks system not unified with Claude Code; enforcement delegated to CI gate | UNVERIFIED |

---

## 4. Google Antigravity

| Aspect | Behavior & Configuration | Status |
| --- | --- | --- |
| **Files Read** | `AGENTS.md`, `.agents/rules/*.md`, `GEMINI.md`, `.agents/skills/**` | VERIFIED (2026-11, antigravity.google) |
| **Import / Include** | `@[label](path)` includes external files; frontmatter stripped during pre-processing | VERIFIED (2026-11, antigravity.google) |
| **Truncation Limit** | Strict 24 KB (24,000 bytes) cap per rule file; files over ~12,000 chars risk silent truncation | VERIFIED (2026-11, antigravity.google) |
| **PreToolUse Hook** | Antigravity IDE reportedly fails to fire PreToolUse hooks (CLI only) | UNVERIFIED in IDE; VERIFIED in CLI |
| **Task & Polling Rule** | Polling via `manage_task` or cron schedules is explicitly prohibited in workspace rules | VERIFIED (AGENTS.md workspace policy) |
| **Command Allowlist** | Foreground synchronous execution only; 6-call command budget | VERIFIED (AGENTS.md workspace policy) |
