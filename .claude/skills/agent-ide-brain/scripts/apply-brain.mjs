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
  parseManagedBlocks,
  jsonDeepMerge,
  writeFileSafe,
  readFileSafe,
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
  let force = false;

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
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  if (!['bootstrap', 'update', 'overwrite'].includes(mode)) {
    console.error(`Invalid mode: ${mode}. Must be bootstrap, update, or overwrite.`);
    process.exit(2);
  }

  return { mode, configPath, root, force };
}

const { mode, configPath, root, force } = parseArgs();
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

// Load lock file
const lockFilePath = path.join(resolvedRoot, '.agents', 'brain.lock.json');
let lockData = {};
if (fs.existsSync(lockFilePath)) {
  try {
    lockData = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
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

// Prepare timestamped backup directory if in overwrite mode
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(resolvedRoot, '.agents', 'backups', timestamp);

let changesCount = 0;
const results = [];
const newLock = { ...lockData };

function backupFile(relPath, fullPath) {
  if (fs.existsSync(fullPath)) {
    const dest = path.join(backupDir, relPath);
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(fullPath, dest);
  }
}

function applyFile(relPath, templatePath, isJson = false, isToml = false, blockId = null, extraVars = {}) {
  const fullPath = assertInsideRoot(relPath);
  const exists = fs.existsSync(fullPath);
  const posixPath = toPosixPath(relPath);

  let rawTpl = '';
  if (templatePath) {
    rawTpl = fs.readFileSync(path.join(templatesDir, templatePath), 'utf8');
  }
  const rendered = rawTpl ? renderTemplate(rawTpl, { ...templateVars, ...extraVars }) : '';

  if (!exists) {
    // File doesn't exist -> CREATE
    writeFileSafe(fullPath, rendered);
    newLock[posixPath] = sha256(rendered);
    changesCount++;
    results.push({ action: 'CREATE', path: posixPath, reason: 'New file written' });
    return;
  }

  // File exists
  const existingContent = readFileSafe(fullPath) || '';
  const existingHash = sha256(existingContent);

  if (mode === 'bootstrap') {
    results.push({ action: 'SKIP', path: posixPath, reason: 'File exists (bootstrap mode)' });
    newLock[posixPath] = existingHash;
    return;
  }

  if (mode === 'overwrite') {
    // Check if file was modified by user since lock
    if (lockData[posixPath] && lockData[posixPath] !== existingHash && !force) {
      console.error(`ERROR: ${posixPath} was modified by user. Overwrite requires --force.`);
      process.exit(1);
    }

    if (existingHash === sha256(rendered)) {
      results.push({ action: 'SKIP', path: posixPath, reason: 'Identical content' });
      newLock[posixPath] = existingHash;
      return;
    }

    backupFile(relPath, fullPath);
    writeFileSafe(fullPath, rendered);
    newLock[posixPath] = sha256(rendered);
    changesCount++;
    results.push({ action: 'OVERWRITE', path: posixPath, reason: `Replaced after backup to .agents/backups/${timestamp}` });
    return;
  }

  if (mode === 'update') {
    let finalContent = existingContent;

    if (isJson) {
      let existingJson = {};
      try { existingJson = JSON.parse(existingContent); } catch {}
      let templateJson = {};
      try { templateJson = JSON.parse(rendered); } catch {}
      const merged = jsonDeepMerge(existingJson, templateJson);
      finalContent = JSON.stringify(merged, null, 2) + '\n';
    } else if (blockId) {
      const extractedBlocks = parseManagedBlocks(rendered, isToml);
      const innerToInsert = extractedBlocks.has(blockId)
        ? extractedBlocks.get(blockId)
        : rendered;
      finalContent = replaceManagedBlock(existingContent, blockId, innerToInsert, isToml);
    } else {
      // If no managed block, keep user file untouched in update mode
      finalContent = existingContent;
    }

    if (sha256(finalContent) === existingHash) {
      results.push({ action: 'SKIP', path: posixPath, reason: 'Identical content (no update needed)' });
      newLock[posixPath] = existingHash;
    } else {
      writeFileSafe(fullPath, finalContent);
      newLock[posixPath] = sha256(finalContent);
      changesCount++;
      results.push({ action: 'EDIT', path: posixPath, reason: 'Updated managed blocks / merged JSON' });
    }
  }
}

// 1. Scaffold files (only when skeleton missing, never overwritten)
if (!hasSkeleton) {
  if (!fs.existsSync(path.join(resolvedRoot, 'package.json'))) {
    applyFile('package.json', 'scaffold/package.json.tpl', true);
  }
  if (!fs.existsSync(path.join(resolvedRoot, 'tsconfig.base.json'))) {
    applyFile('tsconfig.base.json', 'scaffold/tsconfig.base.json.tpl', true);
  }
  if (!fs.existsSync(path.join(resolvedRoot, '.gitignore'))) {
    applyFile('.gitignore', 'scaffold/gitignore.tpl');
  }
  if (!fs.existsSync(path.join(resolvedRoot, '.env.example'))) {
    applyFile('.env.example', 'scaffold/env.example.tpl');
  }
}

// 2. Instructions & adapters
applyFile('AGENTS.md', 'AGENTS.root.md.tpl', false, false, 'root-rules');
applyFile('CLAUDE.md', 'CLAUDE.root.md.tpl', false, false, 'root-claude-deltas', { agentsImportPath: 'AGENTS.md' });
applyFile('GEMINI.md', 'GEMINI.md.tpl', false, false, 'gemini-deltas');

// Nested
applyFile(`${backendDir}/AGENTS.md`, 'AGENTS.backend.md.tpl', false, false, 'backend-rules');
applyFile(`${backendDir}/CLAUDE.md`, 'CLAUDE.backend.md.tpl', false, false, 'backend-claude-deltas', { agentsImportPath: 'AGENTS.md' });
applyFile(`${frontendDir}/AGENTS.md`, 'AGENTS.frontend.md.tpl', false, false, 'frontend-rules');
applyFile(`${frontendDir}/CLAUDE.md`, 'CLAUDE.frontend.md.tpl', false, false, 'frontend-claude-deltas', { agentsImportPath: 'AGENTS.md' });

// 3. Rule files
applyFile('.agents/rules/architecture.md', 'rules/architecture.md.tpl', false, false, 'architecture-rules');
applyFile('.agents/rules/verification.md', 'rules/verification.md.tpl', false, false, 'verification-rules');
applyFile('.agents/rules/security.md', 'rules/security.md.tpl', false, false, 'security-rules');
applyFile('.agents/rules/environment.md', 'rules/environment.md.tpl', false, false, 'environment-rules');
applyFile('.agents/rules/antigravity-permissions.md', 'rules/antigravity-permissions.md.tpl', false, false, 'antigravity-permissions');

// 4. Config & Lock
applyFile('.agents/brain.config.json', 'brain.config.json.tpl', true);

// 5. Tool configs
applyFile('.claude/settings.json', 'claude/settings.json.tpl', true);
applyFile('.codex/config.toml', 'codex/config.toml.tpl', false, true, 'codex-config');
applyFile('.gemini/settings.json', 'gemini/settings.json.tpl', true);

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
  const srcPath = path.join(templatesDir, 'claude', 'hooks', hookFile);
  const hookContent = readFileSafe(srcPath) || '';
  const exists = fs.existsSync(fullPath);
  const posixPath = toPosixPath(rel);

  if (!exists) {
    writeFileSafe(fullPath, hookContent);
    newLock[posixPath] = sha256(hookContent);
    changesCount++;
    results.push({ action: 'CREATE', path: posixPath, reason: 'Installed hook script' });
  } else if (mode === 'bootstrap') {
    results.push({ action: 'SKIP', path: posixPath, reason: 'Hook script exists' });
    newLock[posixPath] = sha256(readFileSafe(fullPath) || '');
  } else if (mode === 'overwrite') {
    if (sha256(readFileSafe(fullPath) || '') !== sha256(hookContent)) {
      backupFile(rel, fullPath);
      writeFileSafe(fullPath, hookContent);
      newLock[posixPath] = sha256(hookContent);
      changesCount++;
      results.push({ action: 'OVERWRITE', path: posixPath, reason: `Updated hook after backup to .agents/backups/${timestamp}` });
    } else {
      results.push({ action: 'SKIP', path: posixPath, reason: 'Hook identical' });
    }
  } else if (mode === 'update') {
    if (sha256(readFileSafe(fullPath) || '') !== sha256(hookContent)) {
      writeFileSafe(fullPath, hookContent);
      newLock[posixPath] = sha256(hookContent);
      changesCount++;
      results.push({ action: 'EDIT', path: posixPath, reason: 'Updated hook script' });
    } else {
      results.push({ action: 'SKIP', path: posixPath, reason: 'Hook identical' });
    }
  }
}

// 7. Lint & boundary configs
applyFile('eslint.boundaries.config.mjs', 'lint/eslint.boundaries.config.mjs.tpl');
applyFile('steiger.config.ts', 'lint/steiger.config.ts.tpl');

// 8. Documentation
applyFile('docs/db-changes.md', 'docs/db-changes.md.tpl');
applyFile('docs/agent-state/README.md', 'docs/agent-state-README.md.tpl');

// 9. ci-gate skill in .agents/skills/ci-gate/SKILL.md (Retained Objective 6)
const ciGatePath = path.join(resolvedRoot, '.agents', 'skills', 'ci-gate', 'SKILL.md');
if (!fs.existsSync(ciGatePath)) {
  const ciGateContent = `---
name: ci-gate
description: Tier 2 outer-loop gate. Run once, as one consolidated foreground command, at the very end of a task after all edits and Tier 1 checks pass.
---

# ci-gate (Tier 2)

Run exactly once, at the very end, as ONE consolidated foreground command:

\`${templateVars.tier2Command}\`

- \`lint\` covers \`lint:fast\` (oxlint then eslint), so there is no separate \`lint:fast\` pass. If a repo's \`lint\` does not cover \`lint:fast\`, prepend \`${templateVars.commandPrefix} run lint:fast &&\`. Never drop a gate that is not covered.
- Passing-test output is suppressed with \`--reporter=dot\`; add \`--silent\` to npm calls if output is noisy.
- Foreground only. No polling, no background tasks, no status checks.
- 3-Strike Circuit Breaker: after 3 consecutive failed repair attempts, stop and report the exact error trace.
- Never weaken a lint rule, TypeScript strictness setting or unit test to pass.
- After a green run, record the passing status and git diff state; if nothing changed since, do not re-run.
`;
  writeFileSafe(ciGatePath, ciGateContent);
  newLock['.agents/skills/ci-gate/SKILL.md'] = sha256(ciGateContent);
  changesCount++;
  results.push({ action: 'CREATE', path: '.agents/skills/ci-gate/SKILL.md', reason: 'Installed ci-gate skill' });
}

// 10. If target repo is external (e.g. scratch repo), copy agent-ide-brain skill to .agents/skills/
const targetSkillDir = path.join(resolvedRoot, '.agents', 'skills', 'agent-ide-brain');
if (path.resolve(targetSkillDir) !== path.resolve(skillDir)) {
  function copyRecursive(src, dst) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    for (const item of fs.readdirSync(src, { withFileTypes: true })) {
      const srcItem = path.join(src, item.name);
      const dstItem = path.join(dst, item.name);
      if (item.isDirectory()) {
        if (!['node_modules', '.git', 'scratch'].includes(item.name)) {
          copyRecursive(srcItem, dstItem);
        }
      } else if (item.isFile()) {
        const content = readFileSafe(srcItem);
        const existing = readFileSafe(dstItem);
        if (existing === null || sha256(content) !== sha256(existing)) {
          writeFileSafe(dstItem, content);
        }
      }
    }
  }
  copyRecursive(skillDir, targetSkillDir);
}

// 9. CI workflow if enabled
if (config.optionalModules?.ciWorkflow) {
  applyFile('.github/workflows/brain-check.yml', 'ci/brain-check.yml.tpl');
}

// 10. Update .gitignore entries once
const gitignorePath = path.join(resolvedRoot, '.gitignore');
const requiredGitignoreEntries = [
  '.agents/backups/',
  '.claude/state/',
  '.claude/settings.local.json',
];

if (fs.existsSync(gitignorePath)) {
  let gitignoreContent = readFileSafe(gitignorePath) || '';
  let addedEntries = false;
  for (const entry of requiredGitignoreEntries) {
    if (!gitignoreContent.includes(entry)) {
      gitignoreContent = gitignoreContent.trimEnd() + '\n' + entry + '\n';
      addedEntries = true;
    }
  }
  if (addedEntries) {
    writeFileSafe(gitignorePath, gitignoreContent);
    changesCount++;
    results.push({ action: 'EDIT', path: '.gitignore', reason: 'Appended required agent-brain ignores' });
  }
}

// 11. Write lock file
const lockContent = JSON.stringify(newLock, Object.keys(newLock).sort(), 2) + '\n';
writeFileSafe(lockFilePath, lockContent);

// Report
console.log(`\n=== AGENT-IDE-BRAIN APPLY RESULT (Mode: ${mode}) ===`);
if (changesCount === 0) {
  console.log('0 changes (idempotent)');
} else {
  console.log(`${changesCount} change(s) applied:`);
  for (const r of results.filter(r => r.action !== 'SKIP')) {
    console.log(`  - [${r.action}] ${r.path}: ${r.reason}`);
  }
}
if (mode === 'overwrite' && fs.existsSync(backupDir)) {
  console.log(`Backups saved to: ${toPosixPath(backupDir)}`);
}
console.log('===================================================\n');
