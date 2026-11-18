#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillDir = path.resolve(__dirname, '..');
const hooksDir = path.join(skillDir, 'assets', 'templates', 'claude', 'hooks');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runHookTest(name, scriptName, inputPayload, expectedExitCode, expectedStderrSubstr = null, customEnv = {}, cwd = process.cwd()) {
  totalTests++;
  const scriptPath = path.join(hooksDir, scriptName);
  const inputStr = JSON.stringify(inputPayload);

  const res = spawnSync(process.execPath, [scriptPath], {
    input: inputStr,
    encoding: 'utf8',
    env: { ...process.env, ...customEnv },
    cwd,
  });

  const codeMatch = res.status === expectedExitCode;
  const stderrMatch = !expectedStderrSubstr || (res.stderr && res.stderr.includes(expectedStderrSubstr));

  if (codeMatch && stderrMatch) {
    console.log(`PASS: ${name} (exit: ${res.status})`);
    passedTests++;
  } else {
    console.error(`FAIL: ${name}`);
    console.error(`  Expected exit: ${expectedExitCode}, got: ${res.status}`);
    if (expectedStderrSubstr) {
      console.error(`  Expected stderr to include: "${expectedStderrSubstr}"`);
      console.error(`  Actual stderr: "${res.stderr.trim()}"`);
    }
    failedTests++;
  }
}

console.log('\n=== RUNNING HOOK FIXTURE TEST SUITE ===\n');

// 1. Destructive rm -rf / and git reset --hard (exit 2)
runHookTest(
  'Destructive rm -rf / is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
  2,
  'Destructive deletion'
);

runHookTest(
  'Destructive git reset --hard is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'git reset --hard' } },
  2,
  'Hard git reset'
);

// 2. Reading .env via Get-Content and cat (exit 2)
runHookTest(
  'Reading .env via Get-Content is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'Get-Content .env' } },
  2,
  'Reading .env secret files'
);

runHookTest(
  'Reading .env via cat is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'cat .env' } },
  2,
  'Reading .env secret files'
);

// 3. Remote ssh and psql -h non-local (exit 2)
runHookTest(
  'Remote ssh is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'ssh user@production.server.com' } },
  2,
  'Remote shell and transfer commands'
);

runHookTest(
  'Remote psql with external host is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'psql -h db.production.aws.com -U admin' } },
  2,
  'Database utility targeting non-local host'
);

// 4. Edit on AGENTS.md without approval (exit 2) and with approval (exit 0)
runHookTest(
  'Edit on AGENTS.md without approval is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Edit', tool_input: { file_path: 'AGENTS.md', text: 'modified' } },
  2,
  'Editing protected path "AGENTS.md" is blocked',
  { AGENT_BRAIN_ALLOW_PROTECTED: '0' }
);

runHookTest(
  'Edit on AGENTS.md with AGENT_BRAIN_ALLOW_PROTECTED=1 is allowed',
  'pre-tool-guard.mjs',
  { tool_name: 'Edit', tool_input: { file_path: 'AGENTS.md', text: 'modified' } },
  0,
  null,
  { AGENT_BRAIN_ALLOW_PROTECTED: '1' }
);

// 5. npm install without approval (exit 2)
runHookTest(
  'npm install without approval is blocked',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'npm install lodash' } },
  2,
  'Package installation commands are blocked'
);

// 6. Benign test command (exit 0)
runHookTest(
  'Benign vitest command is allowed',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'npx vitest run foo.spec.ts --reporter=dot' } },
  0
);

// 7. Skill own apply-brain.mjs command (exit 0)
runHookTest(
  "Skill's own apply-brain.mjs is always allowed",
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'node .agents/skills/agent-ide-brain/scripts/apply-brain.mjs --mode update' } },
  0
);

// Setup a scratch repo for circuit breaker and stop-gate tests
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-test-hooks-'));
const scratchStateDir = path.join(scratchDir, '.claude', 'state');
fs.mkdirSync(scratchStateDir, { recursive: true });
fs.mkdirSync(path.join(scratchDir, '.agents'), { recursive: true });
fs.writeFileSync(
  path.join(scratchDir, '.agents', 'brain.config.json'),
  JSON.stringify({ maxToolCalls: 300, allowInstall: false }),
  'utf8'
);

// 8. Circuit breaker: 301st call with cap of 300 (exit 2)
fs.writeFileSync(
  path.join(scratchStateDir, 'calls.json'),
  JSON.stringify({ count: 300, tripped: false }),
  'utf8'
);

runHookTest(
  '301st tool call trips circuit breaker',
  'pre-tool-guard.mjs',
  { tool_name: 'Bash', tool_input: { command: 'echo test' } },
  2,
  'Session tool call limit (300) exceeded',
  {},
  scratchDir
);

// 9. Stop with stop_hook_active: true (exit 0)
runHookTest(
  'Stop hook with stop_hook_active: true allows termination',
  'stop-gate.mjs',
  { stop_hook_active: true },
  0,
  null,
  {},
  scratchDir
);

// 10. Stop with circuit breaker tripped (exit 0)
// calls.json has count: 301 and tripped: true
runHookTest(
  'Stop hook allows termination when circuit breaker tripped',
  'stop-gate.mjs',
  {},
  0,
  null,
  {},
  scratchDir
);

// Clean up scratchDir
try {
  fs.rmSync(scratchDir, { recursive: true, force: true });
} catch {}

console.log(`\nTests completed: ${passedTests}/${totalTests} passed, ${failedTests} failed.\n`);
process.exit(failedTests > 0 ? 1 : 0);
