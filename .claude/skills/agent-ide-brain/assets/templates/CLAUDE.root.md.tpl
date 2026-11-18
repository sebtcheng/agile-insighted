@{{agentsImportPath}}

<!-- agent-brain:begin root-claude-deltas -->
# Claude Code Guidelines

- Rules live in the imported AGENTS.md above; follow them strictly.
- Prefer the simplest possible implementation that satisfies the prompt.
- Do not refactor or introduce generic abstractions unless explicitly requested.
- Skills in `.agents/skills` load on demand; do not run skills in a predetermined sequence.
- Lifecycle hooks in `.claude/settings.json` and `.claude/hooks/` are authoritative over instruction text.
<!-- agent-brain:end root-claude-deltas -->
