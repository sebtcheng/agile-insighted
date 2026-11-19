# Candidate query sites (static, unverified)

Scanned 139 files under `agile-insighted`; schema: `../../../Users/user/AppData/Local/Temp/schema.backup.ts` (32 tables parsed). Pooler hint in repo: yes.
Every row is a **candidate**, not a conclusion. Nothing here is proven slow until EXPLAIN ANALYZE says so. `tier`: app = request-path code, script = one-off code.
One-off scripts excluded by default: **0 hits not listed** (rerun with `--include-scripts` to list them). By location: none.

## Grouped by pattern and file (10 groups, 14 sites)

| Group | Sites |
|---|---|
| select-all:apps/backend/src/services/projectService.ts | 3 |
| write-in-loop:apps/backend/src/db/seedModules.ts | 2 |
| select-all:apps/backend/src/services/governanceService.ts | 2 |
| select-all:apps/backend/src/db/seed.ts | 1 |
| select-all:apps/backend/src/services/activityQueries.ts | 1 |
| missing-limit:apps/backend/src/services/activityQueries.ts | 1 |
| missing-limit:apps/backend/src/services/userService.ts | 1 |
| orderby-unindexed:apps/backend/src/services/userService.ts | 1 |
| select-all:apps/backend/src/services/usmService.ts | 1 |
| missing-limit:apps/backend/src/services/workItemService.ts | 1 |

## All sites

| # | file:line | pattern | access_layer | tier | note | snippet |
|---|---|---|---|---|---|---|
| 1 | apps/backend/src/db/seed.ts:244 | select-all | drizzle | app | db.select() with no column list | `await db.select().from(sprints).where(eq(sprints.name, "Sprint 3")).limit(1)` |
| 2 | apps/backend/src/db/seedModules.ts:302 | write-in-loop | drizzle | app | query call lexically inside a loop/callback (N+1 candidate) | `await db.insert(storyActionSteps).values(` |
| 3 | apps/backend/src/db/seedModules.ts:504 | write-in-loop | drizzle | app | query call lexically inside a loop/callback (N+1 candidate) | `await db.insert(raidMitigatingActions).values({` |
| 4 | apps/backend/src/services/activityQueries.ts:159 | select-all | drizzle | app | db.select() with no column list | `return db.select().from(tags).orderBy(asc(tags.name));` |
| 5 | apps/backend/src/services/activityQueries.ts:159 | missing-limit | drizzle | app | select with no where and no limit (full table read) | `return db.select().from(tags).orderBy(asc(tags.name));` |
| 6 | apps/backend/src/services/governanceService.ts:107 | select-all | drizzle | app | db.select() with no column list | `const [sprint] = await db.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);` |
| 7 | apps/backend/src/services/governanceService.ts:374 | select-all | drizzle | app | db.select() with no column list | `: await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id)).limit(1);` |
| 8 | apps/backend/src/services/projectService.ts:74 | select-all | drizzle | app | db.select() with no column list | `const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);` |
| 9 | apps/backend/src/services/projectService.ts:206 | select-all | drizzle | app | db.select() with no column list | `const [row] = await db.select().from(subprojects).where(eq(subprojects.id, id)).limit(1);` |
| 10 | apps/backend/src/services/projectService.ts:290 | select-all | drizzle | app | db.select() with no column list | `: await db.select().from(subprojects).where(eq(subprojects.id, id)).limit(1);` |
| 11 | apps/backend/src/services/userService.ts:17 | missing-limit | drizzle | app | select with no where and no limit (full table read) | `return db.select(columns).from(users).orderBy(asc(users.fullName));` |
| 12 | apps/backend/src/services/userService.ts:17 | orderby-unindexed | drizzle | app | ORDER BY users.full_name: no index in schema.ts leads with this column | `return db.select(columns).from(users).orderBy(asc(users.fullName));` |
| 13 | apps/backend/src/services/usmService.ts:167 | select-all | drizzle | app | db.select() with no column list | `const [s] = await tx.select().from(usmSteps).where(eq(usmSteps.id, id)).limit(1);` |
| 14 | apps/backend/src/services/workItemService.ts:262 | missing-limit | drizzle | app | select with no where and no limit (full table read) | `db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users),` |
