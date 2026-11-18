import fs from 'node:fs';
import path from 'node:path';

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function findRepoRoot(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, '.agents')) || fs.existsSync(path.join(curr, '.claude')) || fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return process.cwd();
}

export function loadBrainConfig(repoRoot = findRepoRoot()) {
  const configPath = path.join(repoRoot, '.agents', 'brain.config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return {
    maxToolCalls: 300,
    localDbHosts: ['localhost', '127.0.0.1', '::1'],
    allowInstall: false,
    commands: {
      tier1: 'npm.cmd run lint',
      tier2: 'npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test:unit -- --reporter=dot && npm.cmd run build',
    },
  };
}

export function ensureStateDir(repoRoot = findRepoRoot()) {
  const dir = path.join(repoRoot, '.claude', 'state');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function incrementToolCallCount(repoRoot = findRepoRoot(), maxLimit = 300) {
  const stateDir = ensureStateDir(repoRoot);
  const callsFile = path.join(stateDir, 'calls.json');
  let data = { count: 0, tripped: false };
  try {
    if (fs.existsSync(callsFile)) {
      data = JSON.parse(fs.readFileSync(callsFile, 'utf8'));
    }
  } catch {}

  data.count = (data.count || 0) + 1;
  if (data.count > maxLimit) {
    data.tripped = true;
  }
  try {
    fs.writeFileSync(callsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
  return data;
}

export function isCircuitBreakerTripped(repoRoot = findRepoRoot()) {
  const callsFile = path.join(repoRoot, '.claude', 'state', 'calls.json');
  try {
    if (fs.existsSync(callsFile)) {
      const data = JSON.parse(fs.readFileSync(callsFile, 'utf8'));
      return Boolean(data.tripped);
    }
  } catch {}
  return false;
}

export const HIDDEN_UNICODE_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/u;

export function containsHiddenUnicode(str) {
  if (typeof str !== 'string') return false;
  return HIDDEN_UNICODE_REGEX.test(str);
}

export function isProtectedPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const norm = filePath.replace(/\\/g, '/');

  // Exact file matches or patterns
  if (/(?:^|\/)(AGENTS\.md|CLAUDE\.md|GEMINI\.md)$/i.test(norm)) return true;
  if (/(?:^|\/)\.(agents|claude|codex|gemini)\//i.test(norm)) return true;
  if (/(?:^|\/)(eslint\.boundaries\.config\.mjs|steiger\.config\.ts|eslint\.config\.[cm]?js)$/i.test(norm)) return true;
  if (/(?:^|\/)\.github\/workflows\//i.test(norm)) return true;
  if (/(?:^|\/)\.env(?:\..*)?$/i.test(norm)) return true;

  return false;
}
