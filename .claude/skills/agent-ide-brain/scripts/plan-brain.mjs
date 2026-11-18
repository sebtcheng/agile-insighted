#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeLf,
  sha256,
  toPosixPath,
  renderTemplate,
  replaceManagedBlock,
  jsonDeepMerge,
  parseManagedBlocks,
} from './lib/brain-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillDir = path.resolve(__dirname, '..');
const templatesDir = path.join(skillDir, 'assets', 'templates');

function parseArgs() {
  const args = process.argv.slice(2);
  let mode = 'update';
  let configPath = null;
  let root = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1];
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      configPath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--root' && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      i++;
    }
  }

  if (!['bootstrap', 'update', 'overwrite'].includes(mode)) {
    console.error(`Invalid mode: ${mode}. Must be bootstrap, update, or overwrite.`);
    process.exit(2);
  }

  return { mode, configPath, root };
}

const { mode, configPath, root } = parseArgs();

// Path traversal check
const resolvedRoot = path.resolve(root);

function assertInsideRoot(targetPath) {
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    console.error(`ERROR: Path traversal detected outside root: ${targetPath}`);
    process.exit(1);
  }
  return resolvedTarget;
}

// Load config
let config = {
  tools: ['claude', 'codex', 'gemini'],
  mode,
  commands: {
    tier1: process.platform === 'win32'
      ? 'npx.cmd eslint [files] && npm.cmd run test:unit -w apps/frontend -- [spec] --reporter=dot'
      : 'npx eslint [files] && npm run test:unit -w apps/frontend -- [spec] --reporter=dot',
    tier2: process.platform === 'win32'
      ? 'npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test:unit -- --reporter=dot && npm.cmd run build'
      : 'npm run lint && npm run typecheck && npm run test:unit -- --reporter=dot && npm run build',
  },
  maxToolCalls: 300,
  localDbHosts: ['localhost', '127.0.0.1', '::1'],
  protectedHosts: [],
  allowInstall: false,
  optionalModules: {
    ciWorkflow: true,
    preCommit: false,
    devcontainer: false,
    codeKnowledgeGraph: false,
  },
  repoName: path.basename(resolvedRoot),
  packageScope: `@${path.basename(resolvedRoot)}`,
};

const defaultConfigFile = configPath || path.join(resolvedRoot, '.agents', 'brain.config.json');
if (fs.existsSync(defaultConfigFile)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(defaultConfigFile, 'utf8'));
    config = { ...config, ...loaded };
  } catch {}
}

const isDir = (rel) => {
  const full = path.join(resolvedRoot, rel);
  return fs.existsSync(full) && fs.statSync(full).isDirectory();
};

const backendDir = isDir('apps/backend') ? 'apps/backend' : (isDir('apps/api') ? 'apps/api' : 'apps/backend');
const frontendDir = isDir('apps/frontend') ? 'apps/frontend' : (isDir('apps/web') ? 'apps/web' : 'apps/frontend');
const sharedDir = isDir('packages/shared') ? 'packages/shared' : 'packages/shared';

const templateVars = {
  repoName: config.repoName,
  packageScope: config.packageScope,
  backendDir,
  frontendDir,
  sharedDir,
  tier1Command: config.commands?.tier1 || 'npm.cmd run lint',
  tier2Command: config.commands?.tier2 || 'npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test:unit -- --reporter=dot && npm.cmd run build',
  commandPrefix: process.platform === 'win32' ? 'npm.cmd' : 'npm',
  npxPrefix: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  osPlatform: process.platform,
  osShell: process.platform === 'win32' ? (process.env.PSModulePath ? 'powershell' : 'cmd') : 'bash',
  nodeVersion: process.version,
  packageManager: 'npm',
  agentsImportPath: 'AGENTS.md',
};

// Check if monorepo skeleton exists
const hasSkeleton = fs.existsSync(path.join(resolvedRoot, 'package.json')) &&
  (fs.existsSync(path.join(resolvedRoot, 'apps')) || fs.existsSync(path.join(resolvedRoot, 'packages')));

// Build plan items
const planItems = [];

function planFile(relPath, templatePath, isJson = false, isToml = false, blockId = null, extraVars = {}) {
  const fullPath = assertInsideRoot(relPath);
  const exists = fs.existsSync(fullPath);
  let action = 'SKIP';
  let reason = '';
  let sizeDelta = 0;

  let newContent = '';
  if (templatePath) {
    const rawTpl = fs.readFileSync(path.join(templatesDir, templatePath), 'utf8');
    newContent = renderTemplate(rawTpl, { ...templateVars, ...extraVars });
  }

  if (!exists) {
    action = 'CREATE';
    reason = 'File does not exist';
    sizeDelta = Buffer.byteLength(newContent, 'utf8');
  } else if (mode === 'bootstrap') {
    action = 'SKIP';
    reason = 'File exists (bootstrap mode skips existing)';
    sizeDelta = 0;
  } else if (mode === 'update') {
    action = 'EDIT';
    reason = isJson ? 'Deep-merge JSON (preserve user entries)' : `Update managed block [${blockId || 'default'}]`;
    const oldSize = fs.statSync(fullPath).size;
    sizeDelta = Buffer.byteLength(newContent, 'utf8') - oldSize;
  } else if (mode === 'overwrite') {
    action = 'OVERWRITE';
    reason = 'Replace file completely (backup to .agents/backups first)';
    const oldSize = fs.statSync(fullPath).size;
    sizeDelta = Buffer.byteLength(newContent, 'utf8') - oldSize;
  }

  planItems.push({
    path: toPosixPath(relPath),
    action,
    reason,
    sizeDelta: (sizeDelta >= 0 ? `+${sizeDelta}` : `${sizeDelta}`) + ' B',
  });
}

// 1. Scaffold files if skeleton missing
if (!hasSkeleton) {
  planFile('package.json', 'scaffold/package.json.tpl', true);
  planFile('tsconfig.base.json', 'scaffold/tsconfig.base.json.tpl', true);
  planFile('.gitignore', 'scaffold/gitignore.tpl');
  planFile('.env.example', 'scaffold/env.example.tpl');
}

// 2. Instructions & adapters
planFile('AGENTS.md', 'AGENTS.root.md.tpl', false, false, 'root-rules');
planFile('CLAUDE.md', 'CLAUDE.root.md.tpl', false, false, 'root-claude-deltas', { agentsImportPath: 'AGENTS.md' });
planFile('GEMINI.md', 'GEMINI.md.tpl', false, false, 'gemini-deltas');

// Nested
planFile(`${backendDir}/AGENTS.md`, 'AGENTS.backend.md.tpl', false, false, 'backend-rules');
planFile(`${backendDir}/CLAUDE.md`, 'CLAUDE.backend.md.tpl', false, false, 'backend-claude-deltas', { agentsImportPath: 'AGENTS.md' });
planFile(`${frontendDir}/AGENTS.md`, 'AGENTS.frontend.md.tpl', false, false, 'frontend-rules');
planFile(`${frontendDir}/CLAUDE.md`, 'CLAUDE.frontend.md.tpl', false, false, 'frontend-claude-deltas', { agentsImportPath: 'AGENTS.md' });

// 3. Rule files
planFile('.agents/rules/architecture.md', 'rules/architecture.md.tpl', false, false, 'architecture-rules');
planFile('.agents/rules/verification.md', 'rules/verification.md.tpl', false, false, 'verification-rules');
planFile('.agents/rules/security.md', 'rules/security.md.tpl', false, false, 'security-rules');
planFile('.agents/rules/environment.md', 'rules/environment.md.tpl', false, false, 'environment-rules');
planFile('.agents/rules/antigravity-permissions.md', 'rules/antigravity-permissions.md.tpl', false, false, 'antigravity-permissions');

// 4. Config & Lock
planFile('.agents/brain.config.json', 'brain.config.json.tpl', true);
planFile('.agents/brain.lock.json', null); // Generated dynamically

// 5. Tool configs
planFile('.claude/settings.json', 'claude/settings.json.tpl', true);
planFile('.codex/config.toml', 'codex/config.toml.tpl', false, true, 'codex-config');
planFile('.gemini/settings.json', 'gemini/settings.json.tpl', true);

// 6. Claude hooks (copied verbatim)
for (const hookFile of [
  'lib.mjs',
  'pre-tool-guard.mjs',
  'post-edit-format.mjs',
  'pre-compact-save.mjs',
  'session-start-restore.mjs',
  'stop-gate.mjs',
]) {
  const rel = `.claude/hooks/${hookFile}`;
  const fullPath = assertInsideRoot(rel);
  const exists = fs.existsSync(fullPath);
  let action = exists ? (mode === 'overwrite' ? 'OVERWRITE' : 'EDIT') : 'CREATE';
  if (exists && mode === 'bootstrap') action = 'SKIP';
  planItems.push({
    path: toPosixPath(rel),
    action,
    reason: 'Copy hook script',
    sizeDelta: exists ? '0 B' : 'new file',
  });
}

// 7. Lint & boundary configs
planFile('eslint.boundaries.config.mjs', 'lint/eslint.boundaries.config.mjs.tpl');
planFile('steiger.config.ts', 'lint/steiger.config.ts.tpl');

// 8. Documentation
planFile('docs/db-changes.md', 'docs/db-changes.md.tpl');
planFile('docs/agent-state/README.md', 'docs/agent-state-README.md.tpl');

// ci-gate skill
const ciGatePath = assertInsideRoot('.agents/skills/ci-gate/SKILL.md');
if (!fs.existsSync(ciGatePath)) {
  planItems.push({
    path: '.agents/skills/ci-gate/SKILL.md',
    action: 'CREATE',
    reason: 'Install ci-gate Tier 2 skill',
    sizeDelta: '+800 B',
  });
}

// 9. CI workflow if enabled
if (config.optionalModules?.ciWorkflow) {
  planFile('.github/workflows/brain-check.yml', 'ci/brain-check.yml.tpl');
}

// Print Plan Table
console.log(`\n=== AGENT-IDE-BRAIN PLAN (Mode: ${mode}) ===\nTarget Root: ${toPosixPath(resolvedRoot)}\n`);
console.log('| Action | Path | Reason | Delta |');
console.log('| :--- | :--- | :--- | :--- |');
for (const item of planItems) {
  console.log(`| **${item.action}** | \`${item.path}\` | ${item.reason} | ${item.sizeDelta} |`);
}

console.log('\n--- Required Dependency Installation Command (Run only with human approval) ---');
const installCmd = process.platform === 'win32'
  ? 'npm.cmd install -D typescript eslint typescript-eslint eslint-plugin-boundaries oxlint prettier steiger @feature-sliced/steiger-plugin vitest'
  : 'npm install -D typescript eslint typescript-eslint eslint-plugin-boundaries oxlint prettier steiger @feature-sliced/steiger-plugin vitest';
console.log(installCmd);
console.log('-------------------------------------------------------------------------------\n');
