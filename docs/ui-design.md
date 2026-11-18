# UI design workflow

Applies to ANY task that creates or changes UI: new screens, components, layout, color, type, motion, empty/error states.

## Tooling ladder (use the first one available in your IDE/agent)

1. **Impeccable** (https://github.com/pbakaus/impeccable): the primary design skill.
   - Install once per repo: `npx impeccable install` (supports Claude Code, Cursor, Gemini CLI, Codex CLI).
   - Google Antigravity: copy its `dist/antigravity/.agent` folder into the repo (see the Impeccable README), or run `npx impeccable install` and pick Antigravity if offered.
   - Commit the installed folders (`.claude/`, `.agent/`, etc.) so every agent and teammate gets the same skill.
2. **Fallback skill if Impeccable is unavailable in that IDE**:
   - Antigravity / Gemini CLI / Claude Code: `npx @lhi/ui-skill --antigravity` (or `--gemini`, `--claude`). Antigravity activates it from design intent.
   - Claude Code also ships Anthropic's built-in `frontend-design` skill.
3. **No skill available at all**: follow the rules in `.agents/rules/ui-design.md` plus `DESIGN.md`. Those two files are enough on their own.

## Flow for every UI task

1. **Context**: read `PRODUCT.md` and `DESIGN.md` (run `/impeccable teach` once to create them; `/impeccable document` can regenerate DESIGN.md from existing code).
2. **Shape**: `/impeccable shape <screen>` to plan UX before writing code. Propose the direction and wait for approval before applying.
3. **Build** with Mantine components and theme tokens only (see apps/frontend/CLAUDE.md).
4. **Review**: `/impeccable critique <screen>`, then `/impeccable polish <screen>` before calling it done.
5. **Verify**: before/after screenshots when the app is reachable by Playwright; otherwise use the `ui-static-audit` skill (code audit, Storybook, lint).

## Related skills

- `impeccable-ui-redesign`: redesign an existing UI with Impeccable
- `ui-static-audit` / `ui-visual-audit`: audit without or with Playwright
- `apply-hq-design-system`: enforce the HQ design tokens in an existing repo
