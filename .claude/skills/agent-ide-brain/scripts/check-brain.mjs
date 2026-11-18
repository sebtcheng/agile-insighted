#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  sha256,
  normalizeLf,
  toPosixPath,
  findHiddenUnicode,
  readFileSafe,
} from './lib/brain-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillDir = path.resolve(__dirname, '..');

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
const resolvedRoot = path.resolve(root);

let errorCount = 0;
let warnCount = 0;
let infoCount = 0;

function report(level, msg) {
  console.log(`[${level}] ${msg}`);
  if (level === 'ERROR') errorCount++;
  else if (level === 'WARN') warnCount++;
  else if (level === 'INFO') infoCount++;
}

// Load brain.config.json
const configFile = path.join(resolvedRoot, '.agents', 'brain.config.json');
let config = {
  tools: ['claude', 'codex', 'gemini'],
  commands: {},
};
if (fs.existsSync(configFile)) {
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    report('ERROR', '.agents/brain.config.json is invalid JSON');
  }
} else {
  report('WARN', '.agents/brain.config.json does not exist');
}

// 1. Required files check based on enabled tools
const requiredFiles = [
  'AGENTS.md',
  '.agents/rules/architecture.md',
  '.agents/rules/verification.md',
  '.agents/rules/security.md',
  '.agents/rules/environment.md',
  '.agents/rules/antigravity-permissions.md',
];

if (config.tools?.includes('claude')) {
  requiredFiles.push('CLAUDE.md', '.claude/settings.json');
}
if (config.tools?.includes('codex')) {
  requiredFiles.push('.codex/config.toml');
}
if (config.tools?.includes('gemini')) {
  requiredFiles.push('GEMINI.md', '.gemini/settings.json');
}

for (const rel of requiredFiles) {
  const full = path.join(resolvedRoot, rel);
  if (!fs.existsSync(full)) {
    report('ERROR', `Required file missing: ${toPosixPath(rel)}`);
  }
}

// 2. Size budgets
const rootAgentsPath = path.join(resolvedRoot, 'AGENTS.md');
if (fs.existsSync(rootAgentsPath)) {
  const content = readFileSafe(rootAgentsPath) || '';
  const lines = content.split('\n').length;
  const chars = content.length;
  if (chars > 8000) {
    report('ERROR', `Root AGENTS.md exceeds character budget: ${chars} > 8000 chars`);
  }
  if (lines > 120) {
    report('ERROR', `Root AGENTS.md exceeds line budget: ${lines} > 120 lines`);
  }
}

// Rule files and GEMINI.md ≤ 10,000 characters
const ruleDir = path.join(resolvedRoot, '.agents', 'rules');
if (fs.existsSync(ruleDir)) {
  const ruleFiles = fs.readdirSync(ruleDir).filter(f => f.endsWith('.md'));
  for (const rf of ruleFiles) {
    const full = path.join(ruleDir, rf);
    const content = readFileSafe(full) || '';
    if (content.length > 10000) {
      report('ERROR', `.agents/rules/${rf} exceeds size budget: ${content.length} > 10000 chars (Antigravity limit 12,000)`);
    }
  }
}

const geminiPath = path.join(resolvedRoot, 'GEMINI.md');
if (fs.existsSync(geminiPath)) {
  const content = readFileSafe(geminiPath) || '';
  if (content.length > 10000) {
    report('ERROR', `GEMINI.md exceeds size budget: ${content.length} > 10000 chars`);
  }
}

// CLAUDE.md ≤ 200 lines
function findFiles(dir, matchName) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.agents/backups'].includes(e.name)) {
        results.push(...findFiles(full, matchName));
      }
    } else if (e.name === matchName) {
      results.push(full);
    }
  }
  return results;
}

const allClaudeFiles = findFiles(resolvedRoot, 'CLAUDE.md');
for (const cf of allClaudeFiles) {
  const content = readFileSafe(cf) || '';
  const lines = content.split('\n').length;
  if (lines > 200) {
    report('ERROR', `${toPosixPath(path.relative(resolvedRoot, cf))} exceeds line budget: ${lines} > 200 lines`);
  }

  // 3. CLAUDE.md import sibling AGENTS.md check
  const dir = path.dirname(cf);
  const siblingAgents = path.join(dir, 'AGENTS.md');
  const hasAgentsNearby = fs.existsSync(siblingAgents) || fs.existsSync(path.join(resolvedRoot, 'AGENTS.md'));
  if (hasAgentsNearby) {
    const importRegex = /^@(?:[\w./\\-]+)?AGENTS\.md\s*$/m;
    if (!importRegex.test(content)) {
      report('ERROR', `${toPosixPath(path.relative(resolvedRoot, cf))} must import AGENTS.md with @...AGENTS.md`);
    }
  }
}

// 4. Hidden-Unicode scan across instructions, rules, skills, hooks
const filesToScan = [
  ...findFiles(resolvedRoot, 'AGENTS.md'),
  ...findFiles(resolvedRoot, 'CLAUDE.md'),
  ...findFiles(resolvedRoot, 'GEMINI.md'),
  ...findFiles(path.join(resolvedRoot, '.agents', 'rules'), '*.md'),
  ...findFiles(path.join(resolvedRoot, '.claude', 'hooks'), '*.mjs'),
];

// Add all files in .agents/skills
function walkAll(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...walkAll(full));
    else results.push(full);
  }
  return results;
}

filesToScan.push(...walkAll(path.join(resolvedRoot, '.agents', 'skills')));
filesToScan.push(...walkAll(path.join(resolvedRoot, '.claude', 'skills')));

for (const f of new Set(filesToScan)) {
  const content = readFileSafe(f);
  if (content) {
    const hidden = findHiddenUnicode(content);
    if (hidden.length > 0) {
      report('ERROR', `Hidden Unicode detected in ${toPosixPath(path.relative(resolvedRoot, f))} on line ${hidden[0].line} (${hidden[0].codePoint})`);
    }
  }
}

// 5. Routing table links in AGENTS.md exist
if (fs.existsSync(rootAgentsPath)) {
  const content = readFileSafe(rootAgentsPath) || '';
  const routingMatch = content.match(/## Routing table([\s\S]*?)(?:##|\n\n\n|$)/);
  if (routingMatch) {
    const lines = routingMatch[1].split('\n');
    for (const line of lines) {
      if (line.includes('|')) {
        const backtickMatches = line.matchAll(/`([^`]+)`/g);
        for (const m of backtickMatches) {
          const target = m[1].trim();
          // Exclude command flags or placeholders
          if (target.includes('/') || target.endsWith('.md')) {
            const targets = target.split(',').map(t => t.trim());
            for (const t of targets) {
              const fullTarget = path.join(resolvedRoot, t);
              if (!fs.existsSync(fullTarget)) {
                report('ERROR', `Routing table path does not exist: "${t}" in AGENTS.md`);
              }
            }
          }
        }
      }
    }
  }
}

// 6. No unresolved {{token}} and no angle bracket placeholders in instruction and rule files
const instructionFilesToCheck = [
  ...findFiles(resolvedRoot, 'AGENTS.md'),
  ...findFiles(resolvedRoot, 'CLAUDE.md'),
  ...findFiles(resolvedRoot, 'GEMINI.md'),
  ...findFiles(path.join(resolvedRoot, '.agents', 'rules'), '*.md'),
  path.join(resolvedRoot, 'docs', 'db-changes.md'),
  path.join(resolvedRoot, 'docs', 'agent-state', 'README.md'),
].filter(f => fs.existsSync(f));

for (const f of new Set(instructionFilesToCheck)) {
  const content = readFileSafe(f);
  if (content) {
    const tokenMatch = content.match(/\{\{([^{}]+)\}\}/);
    if (tokenMatch) {
      report('ERROR', `Unresolved template token "${tokenMatch[0]}" found in ${toPosixPath(path.relative(resolvedRoot, f))}`);
    }
    const strippedHtml = content.replace(/<!--[\s\S]*?-->/g, '');
    const angleMatch = strippedHtml.match(/<[a-z0-9_-]{3,}>/i);
    if (angleMatch) {
      const tag = angleMatch[0].toLowerCase();
      if (!['<summary>', '<details>', '<script>', '<style>', '<div>'].includes(tag)) {
        report('ERROR', `Angle-bracket placeholder "${angleMatch[0]}" found in ${toPosixPath(path.relative(resolvedRoot, f))}`);
      }
    }
  }
}

// 7. Check for drift / duplication (4 or more consecutive identical lines)
for (let i = 0; i < instructionFilesToCheck.length; i++) {
  for (let j = i + 1; j < instructionFilesToCheck.length; j++) {
    const lines1 = (readFileSafe(instructionFilesToCheck[i]) || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('|'));
    const lines2 = (readFileSafe(instructionFilesToCheck[j]) || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('|'));

    for (let k = 0; k <= lines1.length - 4; k++) {
      const slice = lines1.slice(k, k + 4).join('\n');
      for (let m = 0; m <= lines2.length - 4; m++) {
        const slice2 = lines2.slice(m, m + 4).join('\n');
        if (slice === slice2) {
          report(
            'ERROR',
            `Duplication detected (4+ identical lines) between ${toPosixPath(path.relative(resolvedRoot, instructionFilesToCheck[i]))} and ${toPosixPath(path.relative(resolvedRoot, instructionFilesToCheck[j]))}`
          );
          break;
        }
      }
    }
  }
}

// 8. Tool configs parse and hook paths exist
const claudeSettingsPath = path.join(resolvedRoot, '.claude', 'settings.json');
if (fs.existsSync(claudeSettingsPath)) {
  try {
    const claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
    // Check all hook command paths
    const hooks = claudeSettings.hooks || {};
    for (const [eventName, groups] of Object.entries(hooks)) {
      if (Array.isArray(groups)) {
        for (const grp of groups) {
          for (const h of grp.hooks || []) {
            const cmd = typeof h === 'string' ? h : h.command || '';
            const match = cmd.match(/node\s+([^\s]+\.mjs)/i);
            if (match) {
              const hookScript = path.resolve(resolvedRoot, match[1]);
              if (!fs.existsSync(hookScript)) {
                report('ERROR', `Hook script does not exist: ${match[1]} (referenced in PreToolUse/PostToolUse/etc.)`);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    report('ERROR', `.claude/settings.json JSON parse error: ${err.message}`);
  }
}

const geminiSettingsPath = path.join(resolvedRoot, '.gemini', 'settings.json');
if (fs.existsSync(geminiSettingsPath)) {
  try {
    JSON.parse(fs.readFileSync(geminiSettingsPath, 'utf8'));
  } catch (err) {
    report('ERROR', `.gemini/settings.json JSON parse error: ${err.message}`);
  }
}

// 9. Secret patterns in instruction files
const secretRegexes = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /[a-zA-Z0-9+.-]+:\/\/[a-zA-Z0-9_.-]+:[^@\s]+@[a-zA-Z0-9_.-]+/,
];

for (const f of instructionFilesToCheck) {
  const content = readFileSafe(f) || '';
  for (const rx of secretRegexes) {
    if (rx.test(content)) {
      report('ERROR', `Secret token or credential pattern detected in ${toPosixPath(path.relative(resolvedRoot, f))}`);
    }
  }
}

// 10. Skill mirror drift check
try {
  const syncScript = path.join(skillDir, 'scripts', 'sync-skills.mjs');
  if (fs.existsSync(syncScript)) {
    execSync(`node "${syncScript}" --check --root "${resolvedRoot}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
  }
} catch {
  report('ERROR', 'Skill mirror drift detected between .agents/skills and .claude/skills');
}

// 11. Boundary lint config and Steiger config check
const boundariesPath = path.join(resolvedRoot, 'eslint.boundaries.config.mjs');
const steigerPath = path.join(resolvedRoot, 'steiger.config.ts');
if (!fs.existsSync(boundariesPath)) {
  report('WARN', 'eslint.boundaries.config.mjs missing');
}
if (!fs.existsSync(steigerPath)) {
  report('WARN', 'steiger.config.ts missing');
}

// 12. Overclaim words check (WARN)
const overclaimRegex = /\b(guarantee|guarantees|zero-regression|mathematically)\b/i;
for (const f of instructionFilesToCheck) {
  const content = readFileSafe(f) || '';
  if (overclaimRegex.test(content)) {
    report('WARN', `Overclaim vocabulary ("guarantee" / "zero-regression" / "mathematically") found in ${toPosixPath(path.relative(resolvedRoot, f))}`);
  }
}

// 13. Lock file comparison (INFO)
const lockPath = path.join(resolvedRoot, '.agents', 'brain.lock.json');
if (fs.existsSync(lockPath)) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    for (const [rel, recordedHash] of Object.entries(lock)) {
      const full = path.join(resolvedRoot, rel);
      if (fs.existsSync(full)) {
        const curHash = sha256(readFileSafe(full) || '');
        if (curHash !== recordedHash) {
          report('INFO', `user-modified: ${rel}`);
        }
      }
    }
  } catch {}
}

console.log(`\nCheck completed: ${errorCount} error(s), ${warnCount} warning(s), ${infoCount} info message(s).`);
process.exit(errorCount > 0 ? 1 : 0);
