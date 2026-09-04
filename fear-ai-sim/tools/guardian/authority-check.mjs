#!/usr/bin/env node
// tools/guardian/authority-check.mjs — V5 §2.2 Worker Write Detection
//
// Hashes every control-plane artifact before worker execution.
// After worker execution, re-hashes.
// Any worker mutation to .fear-guardian-control/ is AUTHORITY_VIOLATION.
//
// Usage:
//   node tools/guardian/authority-check.mjs --snapshot --reason "<justification>"
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

// R6 (V8 audit F-AUTH-01): baselining is authority-sensitive. A bare
// --snapshot silently blesses whatever drift exists, so the same
// principal that caused drift can clear it. Snapshots now require an
// explicit --reason (recorded in the file) and print the diff against
// the previous baseline. Git history plus the recorded reason is what
// distinguishes a justified refresh (e.g. line-ending normalization)
// from blessing. This does not replace principal separation — there
// is still no signing — but an unsigned silent bless is now refused.
function snapshotReason() {
  const idx = process.argv.indexOf('--reason');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  const prefixed = process.argv.find(arg => arg.startsWith('--reason='));
  if (prefixed) return prefixed.slice('--reason='.length);
  return null;
}

function diffAgainst(prevFiles, currentFiles) {
  const diff = { added: [], removed: [], modified: [] };
  for (const [file, hash] of Object.entries(currentFiles)) {
    if (!prevFiles[file]) diff.added.push(file);
    else if (prevFiles[file] !== hash) diff.modified.push(file);
  }
  for (const file of Object.keys(prevFiles)) {
    if (!currentFiles[file]) diff.removed.push(file);
  }
  return diff;
}

function snapshot() {
  const reason = snapshotReason();
  if (!reason) {
    console.error('Usage: node tools/guardian/authority-check.mjs --snapshot --reason "<justification>"');
    console.error('Refusing unsigned snapshot: a reason is required so the refresh is auditable.');
    process.exit(2);
  }
  const hashes = hashDir(CONTROL_DIR);
  let prev = null;
  try {
    if (existsSync(SNAPSHOT_FILE)) prev = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
  } catch {
    prev = null;
  }
  const diff = prev && prev.files ? diffAgainst(prev.files, hashes) : { added: Object.keys(hashes), removed: [], modified: [] };
  const meta = {
    timestamp: new Date().toISOString(),
    fileCount: Object.keys(hashes).length,
    files: hashes,
    reason,
    prevTimestamp: prev?.timestamp ?? null,
    diff,
  };
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(meta, null, 2));
  console.log(JSON.stringify({ action: 'snapshot', fileCount: meta.fileCount, reason, diff }, null, 2));
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
