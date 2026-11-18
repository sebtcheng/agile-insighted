#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { sha256, normalizeLf, toPosixPath, readFileSafe, writeFileSafe } from './lib/brain-lib.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  let checkOnly = false;
  let root = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') {
      checkOnly = true;
    } else if (args[i] === '--root' && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      i++;
    }
  }

  return { checkOnly, root };
}

const { checkOnly, root } = parseArgs();
const resolvedRoot = path.resolve(root);

const canonicalRoot = path.join(resolvedRoot, '.agents', 'skills');
const mirrorRoot = path.join(resolvedRoot, '.claude', 'skills');

function walkDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...walkDir(full));
    } else if (e.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const canonicalFiles = walkDir(canonicalRoot);
const mirrorFiles = walkDir(mirrorRoot);

const canonicalRel = new Map();
for (const f of canonicalFiles) {
  const rel = toPosixPath(path.relative(canonicalRoot, f));
  canonicalRel.set(rel, f);
}

const mirrorRel = new Map();
for (const f of mirrorFiles) {
  const rel = toPosixPath(path.relative(mirrorRoot, f));
  mirrorRel.set(rel, f);
}

let driftCount = 0;
let syncedCount = 0;

// 1. Sync from canonical (.agents/skills) to mirror (.claude/skills)
for (const [rel, srcFull] of canonicalRel.entries()) {
  const destFull = path.join(mirrorRoot, rel);
  const srcContent = readFileSafe(srcFull) || '';
  const srcHash = sha256(srcContent);

  const destContent = readFileSafe(destFull);
  const destHash = destContent !== null ? sha256(destContent) : null;

  if (destHash === null || srcHash !== destHash) {
    driftCount++;
    if (checkOnly) {
      console.log(`DRIFT: .claude/skills/${rel} is ${destHash === null ? 'missing' : 'out of sync'}`);
    } else {
      writeFileSafe(destFull, srcContent);
      syncedCount++;
      console.log(`SYNCED: .agents/skills/${rel} -> .claude/skills/${rel}`);
    }
  }
}

// 2. Check for files that exist only on mirror side
for (const [rel, mirrorFull] of mirrorRel.entries()) {
  if (!canonicalRel.has(rel)) {
    console.log(`NOTICE: File exists only on mirror side (not deleted): .claude/skills/${rel}`);
  }
}

if (checkOnly) {
  if (driftCount > 0) {
    console.error(`FAILED: Skill mirror has ${driftCount} drift item(s). Run sync-skills.mjs to update.`);
    process.exit(1);
  } else {
    console.log('PASS: Skill mirror has zero drift.');
    process.exit(0);
  }
} else {
  console.log(`Sync complete: ${syncedCount} file(s) mirrored from .agents/skills to .claude/skills.`);
  process.exit(0);
}
