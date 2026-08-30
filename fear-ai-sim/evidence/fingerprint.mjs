// evidence/fingerprint.mjs
//
// Source-state fingerprint for the evidence ledger.
//
// EVID-2026-08-28-EVIDENCE-STATUS-LINTER
//
// The fingerprint binds evidence records to the source state they
// were observed against. If any tracked file changes between evidence
// creation and a subsequent audit, the evidence is reported STALE
// (or worse, CONTRADICTED, if the change invalidates the claim).
//
// The fingerprint is a sha256 of a canonical JSON object that
// includes:
//   * the git HEAD commit (or 'no-git' if not in a git repo);
//   * the dirty-worktree flag (git status --porcelain is empty);
//   * a sorted list of (relative path, sha256 of file contents) for
//     every file in `fingerprintFiles`.
//
// The hash is cheap to compute (< 1s for 50 files) and deterministic.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function sha256(s) {
    return createHash('sha256').update(s).digest('hex');
}

function safeReadFile(absPath) {
    try {
        if (!existsSync(absPath)) return null;
        const st = statSync(absPath);
        if (!st.isFile()) return null;
        return readFileSync(absPath);
    } catch {
        return null;
    }
}

function fileHash(absPath) {
    const data = safeReadFile(absPath);
    if (data === null) return null;
    return sha256(data);
}

function safeGit(cwd, args) {
    try {
        const out = execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
        });
        return out.trim();
    } catch {
        return null;
    }
}

/**
 * Compute the source-state fingerprint.
 *
 * @param {Object} options
 * @param {string} options.rootDir - the repo root (absolute)
 * @param {string[]} [options.fingerprintFiles] - file paths (relative to rootDir) to hash
 * @returns {{ head: string, dirty: boolean, fileHashes: Array<{path: string, hash: string|null}>, fingerprint: string }}
 */
export function computeSourceFingerprint({ rootDir, fingerprintFiles = [] } = {}) {
    if (!rootDir) throw new TypeError('computeSourceFingerprint: rootDir is required');
    const head = safeGit(rootDir, ['rev-parse', 'HEAD']) ?? 'no-git';
    // `git status --porcelain` is non-empty when the worktree has
    // uncommitted or untracked-but-tracked changes. This is a
    // conservative dirty flag.
    const porcelain = safeGit(rootDir, ['status', '--porcelain']);
    const dirty = porcelain !== null && porcelain.length > 0;
    const fileHashes = [];
    for (const rel of fingerprintFiles) {
        const abs = join(rootDir, rel);
        const h = fileHash(abs);
        fileHashes.push({ path: rel.split(sep).join('/'), hash: h });
    }
    // Canonicalize: sort by path so the hash is stable across runs
    // that pass fingerprintFiles in different orders.
    fileHashes.sort((a, b) => a.path.localeCompare(b.path));
    const canonical = JSON.stringify({
        head,
        dirty,
        fileHashes,
    });
    const fingerprint = sha256(canonical);
    return { head, dirty, fileHashes, fingerprint };
}

/**
 * Compare a recorded fingerprint against a re-derived one and report
 * freshness.
 *
 * @param {Object} recorded - the `sourceState` field of a recorded evidence row
 * @param {Object} fresh - the result of computeSourceFingerprint at audit time
 * @returns {string} 'FRESH' | 'STALE' | 'BLOCKED' | 'INCOMPLETE'
 */
export function compareFingerprints(recorded, fresh) {
    if (!recorded || !recorded.fingerprint) return 'INCOMPLETE';
    // The recorded row is FRESH if its fingerprint matches the
    // re-derived one. The re-derivation uses the *current* file
    // set, so a fingerprintFiles delta also shows up as STALE.
    if (recorded.fingerprint === fresh.fingerprint) return 'FRESH';
    if (recorded.dirty === false && fresh.dirty === true) return 'STALE';
    if (recorded.head !== fresh.head) return 'STALE';
    return 'STALE';
}
