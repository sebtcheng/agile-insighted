<!-- agent-brain:begin environment-rules -->
# Environment Execution Profile

## Host Environment
- Operating System: {{osPlatform}}
- Shell: {{osShell}}
- Node Version: {{nodeVersion}}
- Package Manager: {{packageManager}}
- Command Prefix: `{{commandPrefix}}`
- NPX Equivalent: `{{npxPrefix}}`

## Execution Rules
- Always execute commands from the workspace root. Do not change directory into sub-packages unless running targeted workspace flags (`-w {{backendDir}}`, `-w {{frontendDir}}`).
- Windows Command Profiles: always use `npm.cmd` and `npx.cmd` (or `pnpm.cmd` / `yarn.cmd`) on Windows hosts to avoid shell spawning failures.
- No exploratory discovery: do not run exploratory commands such as `where vitest`, `dir /s /b node_modules`, or recursive file listings. Use targeted lookups.
- No unprompted installations: never execute package installation commands (`npm install`, `npm ci`, `pnpm add`) without explicit human instruction.
<!-- agent-brain:end environment-rules -->
