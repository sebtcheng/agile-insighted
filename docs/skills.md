# Skills (run on demand)

Installed project skills live in `.claude/skills/<name>/SKILL.md`. This list matches that folder; update both together.

## Build, test and ship

- `ci-gate`: the final gate (lint, format, typecheck, build, test) as one command, run once at the end of a task.
- `backend-integration-tests`: Vitest + Supertest operation tests through Express and Postgres with auth/lock doubles.
- `api-endpoint-health-check`: call every endpoint safely and report 5xx, leaks, missing auth and slow responses.
- `git-sync-push`: stash, pull, pop, commit and push to main.

## Database and performance

- `drizzle-repo-scorecard`: score the Drizzle schema, migrations and data code against Postgres best practice.
- `orm-optimizer`: find slow Drizzle or pg queries and confirm with EXPLAIN (ANALYZE, BUFFERS).
- `pg-health-assessment`: read-only health score for a Postgres server and schema.
- `pgbouncer-redis-plan`: tailored PgBouncer and Redis plan to protect Postgres under bursts.
- `pg-clone-to-local`: copy the `.env` database to a local Postgres.
- `load-capacity-test`: k6 load tests and slow-query analysis on the local test environment.
- `data-workflow-narrative`: plain-English data flow and endpoints that do not persist properly.

## Security and review

- `security-testing`: secrets, SAST, dependency audit, route-auth inventory, SQL injection and ZAP scans.
- `diff-vuln-scan`: scan a diff for vulnerabilities and functional errors.

## Structure and agent setup

- `folder-architecture-audit`: score the folder architecture for agent debuggability.
- `agent-ide-brain`: set up or refresh agent context files.
- `dev-diagnostics-logger`: the dev-only `.logs/` diagnostics layer.
- `bootstrap-ts-monorepo`: deprecated, use `agent-ide-brain`.

## UI

- `impeccable` (`/impeccable ...`): required for every UI task (see `docs/ui-design.md`).
- `insighted-ui-rules`: enforce the InsightED design language.
- `impeccable-ui-redesign`, `empathic-ui-redesign`: redesign work with a proposed direction first.
- `ui-standard-audit`, `ui-visual-audit`: score or audit the UI against the standard.
