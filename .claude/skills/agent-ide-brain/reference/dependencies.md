# Foundation Dependencies & Tooling

Pinned versions and installation commands for the TypeScript monorepo starter kit across workspaces.

> [!NOTE]
> Dependency installation commands must run in the foreground with user approval. Never execute unprompted `npm install` or `npm ci` during routine development tasks.

---

## 1. Root Workspace (Linting, Formatting, Build Tooling)

Pinned devDependencies for deterministic boundary enforcement and code quality:

```bash
npm.cmd install -D \
  typescript@5.7.2 \
  eslint@9.15.0 \
  typescript-eslint@8.15.0 \
  eslint-plugin-boundaries@5.0.1 \
  oxlint@0.15.2 \
  prettier@3.3.3 \
  steiger@0.5.5 \
  @feature-sliced/steiger-plugin@0.5.5 \
  vitest@2.1.5
```

---

## 2. Shared Workspace (`packages/shared`)

Shared contracts and schema validation:

```bash
npm.cmd install -w packages/shared \
  zod@3.23.8
```

---

## 3. Backend Workspace (`apps/backend`)

Express, Drizzle ORM, PostgreSQL, Redis, logging, and security:

```bash
npm.cmd install -w apps/backend \
  express@4.21.1 \
  drizzle-orm@0.36.4 \
  postgres@3.4.5 \
  ioredis@5.4.1 \
  pino@9.5.0 \
  pino-http@10.3.0 \
  helmet@8.0.0 \
  express-rate-limit@7.4.1 \
  bullmq@5.25.6

npm.cmd install -D -w apps/backend \
  @types/express@4.17.21 \
  @types/pino-http@5.8.4 \
  drizzle-kit@0.28.1 \
  supertest@7.0.0 \
  @types/supertest@6.0.2
```

> [!IMPORTANT]
> **BullMQ Note**: BullMQ is provisioned as infrastructure plumbing for asynchronous worker queues after the local database migration and before endpoint creation. It is not wired to any public HTTP endpoint by default.

---

## 4. Frontend Workspace (`apps/frontend`)

React, Mantine UI components, TanStack Query, and Vite:

```bash
npm.cmd install -w apps/frontend \
  react@18.3.1 \
  react-dom@18.3.1 \
  @mantine/core@7.14.2 \
  @mantine/hooks@7.14.2 \
  @tanstack/react-query@5.60.6 \
  @tabler/icons-react@3.22.0

npm.cmd install -D -w apps/frontend \
  @types/react@18.3.12 \
  @types/react-dom@18.3.1 \
  vite@5.4.11 \
  @vitejs/plugin-react@4.3.3 \
  @testing-library/react@16.0.1 \
  jsdom@25.0.1 \
  @playwright/test@1.49.0
```
