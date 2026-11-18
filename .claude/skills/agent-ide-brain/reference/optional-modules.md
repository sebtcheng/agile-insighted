# Optional Modules Reference (Opt-In Only)

These modules are disabled by default and should only be enabled when explicitly approved by the human engineer.

---

## 1. Code Knowledge Graph (CKG)

- **Purpose**: Exposes a structural AST-based graph of functions, classes, and call/import relationships over MCP (Model Context Protocol). Enables deterministic blast-radius calculations and high-precision repository mapping without relying on fuzzy vector embeddings.
- **Default State**: OFF (`optionalModules.codeKnowledgeGraph: false`).
- **Security Assessment**:
  - Many public CKG utilities rely on unvetted third-party native binaries or post-install scripts.
  - Adding any CKG server requires explicit version pinning, security source review, and zero post-install script execution (`--ignore-scripts`).
- **Lightweight Alternative**:
  - `dependency-cruiser`: A deterministic, dependency-free npm package that parses import trees directly into JSON or Mermaid graphs. It provides exact blast-radius analysis without external daemon processes or native binaries.

---

## 2. Devcontainer Sandbox with Egress Filtering

- **Purpose**: Creates an isolated Linux container development environment that prevents agent tool calls from accessing host OS credentials, SSH keys, or unapproved network destinations.
- **Default State**: OFF (`optionalModules.devcontainer: false`).
- **Configuration Structure**:
  - `.devcontainer/devcontainer.json`: Configures the container image, Node.js environment, and non-root user.
  - `.devcontainer/docker-compose.yml`: Spins up local PostgreSQL and Redis instances for local migration rehearsal.
- **Egress Filtering Guidance**:
  - Use `iptables` or Docker network firewalling to restrict outbound traffic to:
    - Package registries: `registry.npmjs.org`
    - Version control: GitHub / GitLab host
    - Local loopback: PostgreSQL (5432) and Redis (6379)
  - Drop all other outbound network traffic to prevent exfiltration.

---

## 3. Pre-Commit Scan Hook

- **Purpose**: Runs a lightweight git pre-commit hook that verifies no hidden Unicode characters or unresolved template placeholders are committed into version control.
- **Default State**: OFF (`optionalModules.preCommit: false`).
- **Implementation**:
  - Configured via simple git hooks (`.git/hooks/pre-commit` or husky/lefthook).
  - Executes: `node .agents/skills/agent-ide-brain/scripts/check-brain.mjs`.
  - Ensures clean commits before code reaches remote pull requests.
