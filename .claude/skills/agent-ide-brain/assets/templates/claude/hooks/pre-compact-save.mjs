#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { findRepoRoot, ensureStateDir } from './lib.mjs';

const repoRoot = findRepoRoot();
const stateDir = ensureStateDir(repoRoot);

let branch = 'unknown';
let changedFiles = [];
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const status = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (status) {
    changedFiles = status.split('\n').map(l => l.trim().split(/\s+/).slice(1).join(' ')).filter(Boolean);
  }
} catch {}

let tier2Pass = null;
try {
  const markerPath = path.join(stateDir, 'tier2-pass.json');
  if (fs.existsSync(markerPath)) {
    tier2Pass = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  }
} catch {}

const hardRuleIds = [
  'RULE-SEC-01 (No .env secrets)',
  'RULE-DB-01 (drizzle-kit rehearsal + rollback)',
  'RULE-GATE-01 (Tier 2 green before completion)',
  'RULE-PROD-01 (No prod DB/VM without authorization)',
  'RULE-PATH-01 (Protected paths require AGENT_BRAIN_ALLOW_PROTECTED=1)',
];

const sessionState = {
  savedAt: new Date().toISOString(),
  git: {
    branch,
    changedFiles: changedFiles.slice(0, 20),
  },
  tier2: tier2Pass,
  hardRules: hardRuleIds,
};

try {
  fs.writeFileSync(path.join(stateDir, 'session-state.json'), JSON.stringify(sessionState, null, 2), 'utf8');
} catch {}

process.exit(0);
