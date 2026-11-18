# Security & Supply-Chain Defense Model

A comprehensive breakdown of the threat model, attack vectors, and defense-in-depth architecture for AI agent instruction files and tool execution.

## 1. Threat Model: Instruction Files as Executable Artifacts

In modern agentic IDEs, instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, rule files, and skill definitions) are not passive documentation. They are executable supply-chain artifacts that directly steer LLM behavior and tool invocations.

### Key Attack Vectors:
1. **Indirect Prompt Injection**: Malicious instructions embedded in source code, dependency READMEs, or database records that manipulate the agent when read into context.
2. **Invisible & Bidirectional Unicode Attacks**: Zero-width spaces (`U+200B`), word joiners (`U+2060`), and bidirectional overrides (`U+202E`) that hide malicious prompts from human review in pull requests while remaining fully interpretable by tokenizers.
3. **Credential Exfiltration**: Prompts that coerce the agent into reading `.env` files and transmitting secrets via HTTP requests (`curl`, `wget`) or shell echoes.
4. **Malicious Package Installation**: Injections prompting the agent to install typo-squatted or malicious npm dependencies containing arbitrary post-install scripts.
5. **Instruction Poisoning**: Tampering with `AGENTS.md` or `.claude/settings.json` to weaken security gates or disable verification rules.

---

## 2. Four Layers of Defense

To mitigate these risks, the agent brain implements four layers of defense:

1. **Pre-Execution Scanning**:
   - Deterministic verification (`scripts/check-brain.mjs` and CI workflows) scans all instruction files, rule files, and hook scripts for hidden Unicode, secret patterns, and unresolved placeholders.
2. **Consent & Permission Gating**:
   - `PreToolUse` lifecycle hooks intercept file edits and shell commands before execution.
   - Protected paths (`AGENTS.md`, `.agents/**`, `.claude/**`, etc.) are blocked unless the environment variable `AGENT_BRAIN_ALLOW_PROTECTED=1` is explicitly set.
   - Reading `.env` files via shell utilities is blocked.
3. **Sandbox Without Host Credentials**:
   - The agent should ideally execute within an isolated container or OS-level sandbox without ambient AWS/GCP/SSH host credentials.
4. **Egress Filtering**:
   - Network egress should be restricted strictly to approved package registries (e.g. npmjs.org) and the project git host.

---

## 3. What Repo Files Can and Cannot Enforce

### What Repo Files CAN Enforce:
- **`PreToolUse` Hooks**: Block obvious destructive commands (`rm -rf /`, `git reset --hard`), prevent unauthorized edits to protected paths, and intercept attempts to read `.env` files.
- **Lint & Boundary Configs**: Deterministically reject cross-slice and cross-layer imports during `lint` runs.
- **Verification Gates**: Prevent task completion until all tests, typechecks, and boundary linters pass.
- **Instruction Scanning**: Fail CI pull requests if invisible Unicode or secret tokens are detected in instruction files.

### What Repo Files CANNOT Enforce (Limitations):
- **Hook Deny-Lists are Best-Effort**: Shell pattern matching and regex deny-lists in `pre-tool-guard.mjs` can be bypassed by creative shell aliasing, variable obfuscation, or custom scripts.
- **The Sandbox is the Real Security Boundary**: True containment requires OS or container-level isolation (e.g., devcontainers, Docker, Antigravity sandbox) with network egress filtering.
- **No LLM Self-Defense Guarantee**: An LLM cannot reliably detect sophisticated adversarial prompt injections in its own context window. Defense must rely on deterministic external tooling.
