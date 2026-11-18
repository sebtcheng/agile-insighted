# Architecture

Browser -> nginx -> PM2 (Express API) -> PgBouncer -> PostgreSQL
Express -> Redis (BullMQ) -> worker -> PgBouncer -> PostgreSQL
Fill in: tenants, auth model, queue names, deploy targets.
