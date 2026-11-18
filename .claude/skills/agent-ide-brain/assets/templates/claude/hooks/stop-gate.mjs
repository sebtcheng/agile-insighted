#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { readStdinJson, findRepoRoot, loadBrainConfig, isCircuitBreakerTripped } from './lib.mjs';

const repoRoot = findRepoRoot();
const config = loadBrainConfig(repoRoot);
const payload = readStdinJson();

// 1. Prevent infinite loop if stop hook was already active
const stopHookActive = Boolean(
  payload.stop_hook_active ||
  payload.stopHookActive ||
  process.env.STOP_HOOK_ACTIVE === 'true'
);
if (stopHookActive) {
  process.exit(0);
}

// 2. Allow termination if circuit breaker has tripped
if (isCircuitBreakerTripped(repoRoot)) {
  process.exit(0);
}

// 3. Compute current git state
let currentDiffHash = 'clean';
let hasChanges = false;
try {
  const status = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (status) {
    hasChanges = true;
    const diff = execSync('git diff HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    currentDiffHash = crypto.createHash('sha256').update(diff + status, 'utf8').digest('hex');
  }
} catch {
  // If not a git repo, allow exit
  process.exit(0);
}

// If working tree is completely clean, no gate run required
if (!hasChanges) {
  process.exit(0);
}

// 4. Check Tier 2 pass marker
const markerPath = path.join(repoRoot, '.claude', 'state', 'tier2-pass.json');
let marker = null;
try {
  if (fs.existsSync(markerPath)) {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  }
} catch {}

if (marker && marker.gitDiffHash === currentDiffHash) {
  // Clean pass match!
  process.exit(0);
}

// Otherwise block termination and instruct agent to run Tier 2
const tier2Cmd = config.commands?.tier2 || 'npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test:unit -- --reporter=dot && npm.cmd run build';
process.stderr.write(
  `[RULE-GATE-01] Done means green: source changes detected and Tier 2 gate has not passed for current changes.\nExecute Tier 2 outer gate once before concluding:\n${tier2Cmd}\n`
);
process.exit(2);
