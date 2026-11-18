#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from './lib.mjs';

const repoRoot = findRepoRoot();
const stateFile = path.join(repoRoot, '.claude', 'state', 'session-state.json');

let state = null;
try {
  if (fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }
} catch {}

let contextStr = '';
if (state) {
  const parts = [];
  if (state.git?.branch) parts.push(`Git branch: ${state.git.branch}`);
  if (state.git?.changedFiles?.length) parts.push(`Changed files: ${state.git.changedFiles.join(', ')}`);
  if (state.tier2?.timestamp) parts.push(`Tier 2 last passed: ${state.tier2.timestamp}`);
  if (state.hardRules?.length) parts.push(`Invariants: ${state.hardRules.join('; ')}`);
  contextStr = `[RESTORED SESSION STATE]\n${parts.join('\n')}`;
} else {
  contextStr = `[SESSION INITIALIZED] AGAP Agent Brain active. Follow AGENTS.md rules and Two-Tier Verification.`;
}

// Strip non-printable control characters (keep \n and \t)
const sanitized = contextStr
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .slice(0, 1500);

const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: sanitized,
  },
};

process.stdout.write(JSON.stringify(output) + '\n');
process.exit(0);
