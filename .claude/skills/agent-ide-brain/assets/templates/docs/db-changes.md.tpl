# Database Changes & Migrations Protocol ({{packageScope}})

Every database schema change in this repository must follow this non-destructive engineering protocol:

## 1. Edit Schema
- `{{backendDir}}/src/db/schema.ts` is the single source of truth for the database schema.
- Make all changes in `schema.ts`.

## 2. Generate Migration
- Run: `{{commandPrefix}} run db:generate` (using drizzle-kit).
- Review the generated SQL migration file under `{{backendDir}}/drizzle/`.

## 3. Rehearse on Scratch / Local DB
- Rehearse the migration against a local PostgreSQL instance or scratch database with realistic test data.
- Confirm schema migration executes without errors or data truncation.

## 4. Rollback Plan
Before applying any migration to shared or staging environments, document the rollback plan:
- Migration ID:
- Description:
- Forward Action:
- Rollback SQL Script:
- Data Preservation Verification:

## 5. Shared and Production Safety
- Never run `drizzle-kit push` directly against shared or production databases.
- Never touch production without explicit human permission and rehearsal confirmation.
