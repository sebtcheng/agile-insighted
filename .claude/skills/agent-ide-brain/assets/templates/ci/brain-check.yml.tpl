name: Agent Brain Guardrail Check

on:
  pull_request:
    paths:
      - 'AGENTS.md'
      - '**/AGENTS.md'
      - 'CLAUDE.md'
      - '**/CLAUDE.md'
      - 'GEMINI.md'
      - '.agents/**'
      - '.claude/**'
      - '.codex/**'
      - '.gemini/**'
      - 'eslint.boundaries.config.mjs'
      - 'steiger.config.ts'

jobs:
  check-brain:
    name: Check Brain & Instructions
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run Brain Verifier
        run: node .agents/skills/agent-ide-brain/scripts/check-brain.mjs
