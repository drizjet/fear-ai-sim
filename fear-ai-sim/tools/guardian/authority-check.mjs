#!/usr/bin/env node
// tools/guardian/authority-check.mjs — V5 §2.2 Worker Write Detection
//
// Hashes every control-plane artifact before worker execution.
// After worker execution, re-hashes.
// Any worker mutation to .fear-guardian-control/ is AUTHORITY_VIOLATION.
//
// Usage:
//   node tools/guardian/authority-check.mjs --snapshot    # hash current state
//   node tools/guardian/authority-check.mjs --verify      # compare to last snapshot

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const CONTROL_DIR = resolve(process.cwd(), '.fear-guardian-control');
const SNAPSHOT_FILE = join(CONTROL_DIR, 'worker-write-snapshot.json');

function hashDir(dir, base = dir) {
  const result = {};
  if (!existsSync(dir)) return result;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, hashDir(full, base));
    } else if (entry.isFile() && entry.name !== 'worker-write-snapshot.json') {
      const content = readFileSync(full);
      const hash = createHash('sha256').update(content).digest('hex');
      result[relative(base, full).replace(/\\/g, '/')] = hash;
    }
  }
  return result;
}

function snapshot() {
  const hashes = hashDir(CONTROL_DIR);
  const meta = {
    timestamp: new Date().toISOString(),
    fileCount: Object.keys(hashes).length,
    files: hashes,
  };
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(meta, null, 2));
  console.log(JSON.stringify({ action: 'snapshot', fileCount: meta.fileCount }, null, 2));
}

function verify() {
  if (!existsSync(SNAPSHOT_FILE)) {
    console.log(JSON.stringify({ action: 'verify', result: 'NO_SNAPSHOT' }, null, 2));
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
  const current = hashDir(CONTROL_DIR);
  const violations = [];
  for (const [file, hash] of Object.entries(current)) {
    if (!prev.files[file]) {
      violations.push({ file, kind: 'NEW_FILE', hash });
    } else if (prev.files[file] !== hash) {
      violations.push({ file, kind: 'MODIFIED', prev: prev.files[file], current: hash });
    }
  }
  for (const file of Object.keys(prev.files)) {
    if (!current[file]) {
      violations.push({ file, kind: 'DELETED', prev: prev.files[file] });
    }
  }
  if (violations.length > 0) {
    console.log(JSON.stringify({
      action: 'verify',
      result: 'AUTHORITY_VIOLATION',
      violations,
    }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ action: 'verify', result: 'CLEAN', fileCount: Object.keys(current).length }, null, 2));
}

const action = process.argv[2];
if (action === '--snapshot') snapshot();
else if (action === '--verify') verify();
else {
  console.error('Usage: node tools/guardian/authority-check.mjs --snapshot|--verify');
  process.exit(1);
}
