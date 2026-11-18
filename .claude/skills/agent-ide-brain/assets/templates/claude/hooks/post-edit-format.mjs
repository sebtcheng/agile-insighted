#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { readStdinJson, findRepoRoot, loadBrainConfig, ensureStateDir } from './lib.mjs';

const repoRoot = findRepoRoot();
const config = loadBrainConfig(repoRoot);
const payload = readStdinJson();

const toolName = payload.tool_name || payload.name || '';
const toolInput = payload.tool_input || payload.input || {};

// 1. Post-Edit Formatting / Linting
if (['Edit', 'Write', 'MultiEdit', 'create_file', 'replace_file_content', 'write_file', 'edit_file'].includes(toolName)) {
  const targetPath = toolInput.file_path || toolInput.path || toolInput.target_file || toolInput.filePath;
  if (targetPath && typeof targetPath === 'string') {
    const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(repoRoot, targetPath);
    if (fs.existsSync(fullPath)) {
      // Check if prettier or oxlint is available
      const prettierBin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier');
      const oxlintBin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint');

      if (fs.existsSync(prettierBin)) {
        try {
          execSync(`"${prettierBin}" --write "${fullPath}"`, { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'] });
        } catch {}
      }

      if (fs.existsSync(oxlintBin)) {
        try {
          execSync(`"${oxlintBin}" "${fullPath}"`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (err) {
          if (err.stdout || err.stderr) {
            const out = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
            process.stderr.write(`[OXLINT NOTICE] Post-edit findings on ${targetPath}:\n${out}\n`);
          }
        }
      }
    }
  }
}

// 2. Tier 2 Pass Marker Logic
if (['Bash', 'bash', 'terminal', 'execute_command', 'run_command'].includes(toolName)) {
  const command = (toolInput.command || toolInput.CommandLine || '').trim();
  const tier2Cmd = (config.commands?.tier2 || '').trim();

  // If this command matches the Tier 2 outer gate chain
  const isTier2 = tier2Cmd && (
    command === tier2Cmd ||
    (command.includes('lint') && command.includes('typecheck') && command.includes('test:unit') && command.includes('build'))
  );

  if (isTier2) {
    let diffHash = 'clean';
    try {
      const diff = execSync('git diff HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const status = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      diffHash = crypto.createHash('sha256').update(diff + status, 'utf8').digest('hex');
    } catch {}

    const stateDir = ensureStateDir(repoRoot);
    const markerFile = path.join(stateDir, 'tier2-pass.json');
    try {
      fs.writeFileSync(
        markerFile,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            gitDiffHash: diffHash,
            command,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {}
  }
}

process.exit(0);
