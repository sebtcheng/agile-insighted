<!-- agent-brain:begin antigravity-permissions -->
# Google Antigravity & Gemini Permissions Policy

## 1. Foreground Synchronous Verification
- Verification commands must run synchronously in the foreground with short timeouts.
- Never trigger long-running asynchronous background commands for test suites or linters.

## 2. Polling Prohibition
- Polling via background task status or scheduled cron timers is strictly prohibited.
- Do not call background task status tools or set timer loops to await command completion.
- Append concise reporter flags (`--silent`, `--reporter=dot`) so output returns cleanly within the foreground window.

## 3. Parallel Tool Batching Mandate
- Emit 3 to 6 independent search and file inspection calls in a single turn.
- Consolidate file replacements across frontend, backend, and shared packages into a single multi-file edit turn.
- Do not make sequential single-chunk edits on the same file.

## 4. Terminal Command Policy
- Pre-approved commands: linting (`{{commandPrefix}} run lint`), typechecking (`{{commandPrefix}} run typecheck`), unit testing (`{{commandPrefix}} run test:unit`), and building (`{{commandPrefix}} run build`).
- Forbidden commands: exploratory environment searches, remote shell (`ssh`, `scp`), database migrations to remote targets, and unprompted dependency installation.
<!-- agent-brain:end antigravity-permissions -->
