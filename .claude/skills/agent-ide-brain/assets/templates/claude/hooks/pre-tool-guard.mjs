#!/usr/bin/env node
import {
  readStdinJson,
  findRepoRoot,
  loadBrainConfig,
  incrementToolCallCount,
  isProtectedPath,
  containsHiddenUnicode,
} from './lib.mjs';

const repoRoot = findRepoRoot();
const config = loadBrainConfig(repoRoot);
const payload = readStdinJson();

const toolName = payload.tool_name || payload.name || '';
const toolInput = payload.tool_input || payload.input || {};

// 1. Tool Call Counter / Circuit Breaker
const maxCalls = config.maxToolCalls || 300;
const callState = incrementToolCallCount(repoRoot, maxCalls);
if (callState.tripped) {
  process.stderr.write(
    `[RULE-CIRCUIT-BREAKER] Session tool call limit (${maxCalls}) exceeded. Stop executing tools, synthesize findings, and conclude.\n`
  );
  process.exit(2);
}

// 2. Edit / Write / MultiEdit Guards
if (['Edit', 'Write', 'MultiEdit', 'create_file', 'replace_file_content', 'write_file', 'edit_file'].includes(toolName)) {
  const targetPath = toolInput.file_path || toolInput.path || toolInput.target_file || toolInput.filePath || '';
  const allowProtected = process.env.AGENT_BRAIN_ALLOW_PROTECTED === '1';

  if (isProtectedPath(targetPath) && !allowProtected) {
    process.stderr.write(
      `[RULE-SEC-01] Editing protected path "${targetPath}" is blocked. Instruction files and agent configurations require explicit approval and AGENT_BRAIN_ALLOW_PROTECTED=1.\n`
    );
    process.exit(2);
  }

  // Hidden Unicode check in content or replacement chunks
  const contentToCheck = [
    toolInput.content,
    toolInput.replacement,
    toolInput.text,
    ...(toolInput.replacements ? toolInput.replacements.map(r => r.replacement) : []),
  ].filter(Boolean).join('\n');

  if (containsHiddenUnicode(contentToCheck)) {
    process.stderr.write(
      `[RULE-SEC-04] Write blocked: content contains forbidden hidden or bidirectional Unicode characters (supply-chain injection defense).\n`
    );
    process.exit(2);
  }

  process.exit(0);
}

// 3. Bash / Command Guards
if (['Bash', 'bash', 'terminal', 'execute_command', 'run_command'].includes(toolName)) {
  const command = (toolInput.command || toolInput.CommandLine || '').trim();
  if (!command) {
    process.exit(0);
  }

  // Always allow the agent-ide-brain skill's own scripts
  if (/node\s+(?:\.agents|\.claude)[\\/]skills[\\/]agent-ide-brain[\\/]scripts[\\/][\w.-]+\.mjs/i.test(command)) {
    process.exit(0);
  }

  // 3.1 Destructive Deletions outside ephemeral folders
  if (
    /(?:rm\s+-(?:rf?|fr?)|Remove-Item\s+.*-Recurse|rmdir\s+\/s)/i.test(command)
  ) {
    const isEphemeral = /(node_modules|dist|build|coverage|tmp|\.turbo|\.cache)/i.test(command);
    if (!isEphemeral) {
      process.stderr.write(
        `[RULE-SEC-02] Destructive deletion outside ephemeral directories (node_modules, dist, build, coverage, tmp) is blocked.\n`
      );
      process.exit(2);
    }
  }

  // 3.2 Git destructive commands
  if (/git\s+push\s+.*(?:--force|-f)\b/i.test(command)) {
    process.stderr.write(`[RULE-SEC-02] Force pushing to git is blocked.\n`);
    process.exit(2);
  }
  if (/git\s+reset\s+--hard\b/i.test(command)) {
    process.stderr.write(`[RULE-SEC-02] Hard git reset is blocked. Use git restore or stash instead.\n`);
    process.exit(2);
  }
  if (/git\s+clean\s+-[a-zA-Z]*f[a-zA-Z]*d\b/i.test(command)) {
    process.stderr.write(`[RULE-SEC-02] Destructive git clean is blocked.\n`);
    process.exit(2);
  }
  if (/git\s+commit\s+.*--no-verify\b/i.test(command)) {
    process.stderr.write(`[RULE-VER-02] Bypassing git verification hooks (--no-verify) is prohibited.\n`);
    process.exit(2);
  }

  // 3.3 SQL Destructive Operations
  if (/\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE|TRUNCATE)\b/i.test(command)) {
    process.stderr.write(`[RULE-DB-01] Destructive SQL statements (DROP/TRUNCATE) are blocked. Use drizzle-kit migrations with rollback plans.\n`);
    process.exit(2);
  }

  // 3.4 Database migrations push vs local hosts
  if (/drizzle-kit\s+push\b/i.test(command)) {
    const localHosts = config.localDbHosts || ['localhost', '127.0.0.1', '::1'];
    // If command mentions host or env points to external, block
    const externalHostMatch = command.match(/-h\s+([^\s]+)|--host[=\s]([^\s]+)/i);
    if (externalHostMatch) {
      const targetHost = externalHostMatch[1] || externalHostMatch[2];
      if (!localHosts.includes(targetHost)) {
        process.stderr.write(`[RULE-DB-02] drizzle-kit push against non-local host "${targetHost}" is blocked.\n`);
        process.exit(2);
      }
    }
  }

  // 3.5 Remote SSH / SCP / Rsync
  if (/\b(ssh|scp|rsync)\b/i.test(command)) {
    process.stderr.write(`[RULE-SEC-03] Remote shell and transfer commands (ssh, scp, rsync) are prohibited. Never touch production hosts.\n`);
    process.exit(2);
  }

  // 3.6 Remote Postgres utilities
  if (/\b(psql|pg_dump|pg_restore)\b/i.test(command)) {
    const localHosts = config.localDbHosts || ['localhost', '127.0.0.1', '::1'];
    const hostMatch = command.match(/-h\s+([^\s]+)|--host[=\s]([^\s]+)/i);
    if (hostMatch) {
      const targetHost = hostMatch[1] || hostMatch[2];
      if (!localHosts.includes(targetHost)) {
        process.stderr.write(`[RULE-DB-03] Database utility targeting non-local host "${targetHost}" is prohibited.\n`);
        process.exit(2);
      }
    }
  }

  // 3.7 Reading .env secret contents
  if (
    /(?:cat|type|Get-Content|more|head|tail|less)\s+.*\.env(?:\..*)?/i.test(command) ||
    /Get-Content\s+\.env/i.test(command)
  ) {
    process.stderr.write(`[RULE-SEC-01] Reading .env secret files is strictly blocked. Never print or expose secrets.\n`);
    process.exit(2);
  }

  // 3.8 Pipe to shell
  if (/(?:curl|wget)\s+.*\|\s*(?:bash|sh|cmd|pwsh|powershell)\b/i.test(command)) {
    process.stderr.write(`[RULE-SEC-04] Piping remote network content directly to a shell is blocked.\n`);
    process.exit(2);
  }

  // 3.9 Skip permissions flag
  if (/--dangerously-skip-permissions\b/i.test(command)) {
    process.stderr.write(`[RULE-SEC-05] Operating with --dangerously-skip-permissions is prohibited.\n`);
    process.exit(2);
  }

  // 3.10 Unprompted package installations
  if (
    /\b(?:npm|pnpm|yarn)\s+(?:install|ci|add)\b/i.test(command) &&
    !config.allowInstall
  ) {
    process.stderr.write(`[RULE-DEP-01] Package installation commands are blocked without explicit configuration approval (allowInstall: true).\n`);
    process.exit(2);
  }

  process.exit(0);
}

process.exit(0);
