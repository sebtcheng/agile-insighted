#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { sha256, normalizeLf, toPosixPath } from './lib/brain-lib.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  let root = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      i++;
    }
  }
  return { root };
}

const { root } = parseArgs();

// 1. OS & Shell
const platform = process.platform;
let shell = 'bash';
if (platform === 'win32') {
  shell = process.env.PSModulePath ? 'powershell' : 'cmd';
} else if (process.env.SHELL) {
  shell = path.basename(process.env.SHELL);
}

// 2. Node & Command Prefix
const nodeVersion = process.version;
let packageManager = 'npm';
if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
  packageManager = 'pnpm';
} else if (fs.existsSync(path.join(root, 'yarn.lock'))) {
  packageManager = 'yarn';
}

const commandPrefix = platform === 'win32'
  ? (packageManager === 'pnpm' ? 'pnpm.cmd' : packageManager === 'yarn' ? 'yarn.cmd' : 'npm.cmd')
  : packageManager;

const npxPrefix = platform === 'win32'
  ? (packageManager === 'pnpm' ? 'pnpx.cmd' : packageManager === 'yarn' ? 'yarn.cmd dlx' : 'npx.cmd')
  : (packageManager === 'pnpm' ? 'pnpx' : packageManager === 'yarn' ? 'yarn dlx' : 'npx');

// 3. Workspaces & Monorepo detection
let rootPkg = null;
try {
  const pkgStr = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  rootPkg = JSON.parse(pkgStr);
} catch {}

const isDir = (rel) => {
  const full = path.join(root, rel);
  return fs.existsSync(full) && fs.statSync(full).isDirectory();
};

const backendDir = isDir('apps/backend') ? 'apps/backend' : (isDir('apps/api') ? 'apps/api' : 'apps/backend');
const frontendDir = isDir('apps/frontend') ? 'apps/frontend' : (isDir('apps/web') ? 'apps/web' : 'apps/frontend');
const sharedDir = isDir('packages/shared') ? 'packages/shared' : 'packages/shared';

const workspaces = {
  backend: backendDir,
  frontend: frontendDir,
  shared: sharedDir,
  backendExists: isDir(backendDir),
  frontendExists: isDir(frontendDir),
  sharedExists: isDir(sharedDir),
  configuredWorkspaces: rootPkg?.workspaces || null,
};

// 4. Scripts in package.json
const scripts = rootPkg?.scripts || {};
const allDeps = {
  ...(rootPkg?.dependencies || {}),
  ...(rootPkg?.devDependencies || {}),
};

const tooling = {
  oxlint: Boolean(allDeps['oxlint']),
  eslint: Boolean(allDeps['eslint']),
  prettier: Boolean(allDeps['prettier']),
  steiger: Boolean(allDeps['steiger'] || allDeps['@feature-sliced/steiger-plugin']),
  eslintBoundaries: Boolean(allDeps['eslint-plugin-boundaries']),
  typescript: Boolean(allDeps['typescript']),
  zod: Boolean(allDeps['zod']),
  vitest: Boolean(allDeps['vitest']),
  playwright: Boolean(allDeps['@playwright/test'] || allDeps['playwright']),
  pino: Boolean(allDeps['pino']),
  helmet: Boolean(allDeps['helmet']),
  expressRateLimit: Boolean(allDeps['express-rate-limit']),
  tanstackQuery: Boolean(allDeps['@tanstack/react-query']),
  bullmq: Boolean(allDeps['bullmq']),
  drizzleOrm: Boolean(allDeps['drizzle-orm']),
  drizzleKit: Boolean(allDeps['drizzle-kit']),
};

// 5. Brain files inspection
const brainFilePaths = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.agents/rules/architecture.md',
  '.agents/rules/verification.md',
  '.agents/rules/security.md',
  '.agents/rules/environment.md',
  '.agents/rules/antigravity-permissions.md',
  '.agents/brain.config.json',
  '.agents/brain.lock.json',
  '.claude/settings.json',
  '.claude/hooks/lib.mjs',
  '.claude/hooks/pre-tool-guard.mjs',
  '.claude/hooks/post-edit-format.mjs',
  '.claude/hooks/pre-compact-save.mjs',
  '.claude/hooks/session-start-restore.mjs',
  '.claude/hooks/stop-gate.mjs',
  '.codex/config.toml',
  '.gemini/settings.json',
  'eslint.boundaries.config.mjs',
  'steiger.config.ts',
  'docs/db-changes.md',
  'docs/agent-state/README.md',
  '.github/workflows/brain-check.yml',
  `${backendDir}/AGENTS.md`,
  `${backendDir}/CLAUDE.md`,
  `${frontendDir}/AGENTS.md`,
  `${frontendDir}/CLAUDE.md`,
];

const brainFiles = {};
for (const rel of brainFilePaths) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) {
    try {
      const content = fs.readFileSync(full, 'utf8');
      brainFiles[toPosixPath(rel)] = {
        exists: true,
        hash: sha256(content),
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        lineCount: normalizeLf(content).split('\n').length,
        characterCount: content.length,
      };
    } catch {
      brainFiles[toPosixPath(rel)] = { exists: true, error: 'unreadable' };
    }
  } else {
    brainFiles[toPosixPath(rel)] = { exists: false };
  }
}

// 6. Skills listing
function listSkills(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}

const existingSkills = {
  agentsSkills: listSkills(path.join(root, '.agents', 'skills')),
  claudeSkills: listSkills(path.join(root, '.claude', 'skills')),
};

// 7. Search for bootstrap-ts-monorepo
const bootstrapLocations = [];
const searchTargets = [
  path.join(root, '.claude', 'skills', 'bootstrap-ts-monorepo'),
  path.join(root, '.agents', 'skills', 'bootstrap-ts-monorepo'),
  path.join(os.homedir(), '.claude', 'skills', 'bootstrap-ts-monorepo'),
  path.join(os.homedir(), '.agents', 'skills', 'bootstrap-ts-monorepo'),
  path.join(os.homedir(), '.gemini', 'antigravity', 'builtin', 'skills', 'bootstrap-ts-monorepo'),
];

for (const p of searchTargets) {
  if (fs.existsSync(p)) {
    bootstrapLocations.push(toPosixPath(p));
  }
}

// 8. Git state
let git = {
  isRepo: fs.existsSync(path.join(root, '.git')),
  branch: null,
  isDirty: false,
};
if (git.isRepo) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    git.branch = branch;
    git.isDirty = status.length > 0;
  } catch {}
}

// 9. Detect .env* files (names only, NEVER contents!)
function findEnvFiles(dir, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.agents'].includes(e.name)) {
          files.push(...findEnvFiles(path.join(dir, e.name), maxDepth, currentDepth + 1));
        }
      } else if (e.isFile() && e.name.startsWith('.env')) {
        files.push(toPosixPath(path.relative(root, path.join(dir, e.name))));
      }
    }
  } catch {}
  return files;
}

const envFiles = findEnvFiles(root);

const result = {
  os: {
    platform,
    release: os.release(),
    shell,
  },
  node: {
    version: nodeVersion,
    packageManager,
    commandPrefix,
    npxPrefix,
  },
  repo: {
    root: toPosixPath(root),
    name: rootPkg?.name || path.basename(root),
    packageScope: rootPkg?.name && rootPkg.name.startsWith('@') ? rootPkg.name.split('/')[0] : `@${rootPkg?.name || path.basename(root)}`,
  },
  workspaces,
  scripts,
  tooling,
  brainFiles,
  existingSkills,
  bootstrapMonorepoLocations: bootstrapLocations,
  git,
  envFiles,
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
