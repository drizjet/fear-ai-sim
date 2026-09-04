import { describe, expect, test } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// R6 (V8 audit F-AUTH-01) — the checker runs against tmp control dirs
// (cwd-scoped), never the repo's own .fear-guardian-control.
const CHECKER = resolve(process.cwd(), 'tools/guardian/authority-check.mjs');

function sandbox() {
    const root = mkdtempSync(join(tmpdir(), 'fear-guardian-'));
    mkdirSync(join(root, '.fear-guardian-control', 'frozen'), { recursive: true });
    writeFileSync(join(root, '.fear-guardian-control', 'frozen', 'matrix.json'), '{"v":1}\n');
    return root;
}

function run(root, args) {
    return spawnSync(process.execPath, [CHECKER, ...args], { cwd: root, encoding: 'utf8' });
}

function snapPath(root) {
    return join(root, '.fear-guardian-control', 'worker-write-snapshot.json');
}

describe('guardian authority snapshot discipline (R6)', () => {
    test('bare --snapshot is refused without a reason', () => {
        const root = sandbox();
        try {
            const result = run(root, ['--snapshot']);
            expect(result.status).not.toBe(0);
            expect(existsSync(snapPath(root))).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('--snapshot records the reason and diffs against the previous baseline', () => {
        const root = sandbox();
        try {
            const first = run(root, ['--snapshot', '--reason', 'initial baseline']);
            expect(first.status).toBe(0);
            const meta = JSON.parse(readFileSync(snapPath(root), 'utf8'));
            expect(meta.reason).toBe('initial baseline');
            expect(meta.files['frozen/matrix.json']).toBeDefined();
            writeFileSync(join(root, '.fear-guardian-control', 'frozen', 'matrix.json'), '{"v":2}\n');
            const second = run(root, ['--snapshot', '--reason', 'matrix v2']);
            expect(second.status).toBe(0);
            const report = JSON.parse(second.stdout);
            expect(report.diff.modified).toContain('frozen/matrix.json');
            const meta2 = JSON.parse(readFileSync(snapPath(root), 'utf8'));
            expect(meta2.reason).toBe('matrix v2');
            expect(meta2.prevTimestamp).toBe(meta.timestamp);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('--verify still catches unrecorded drift', () => {
        const root = sandbox();
        try {
            expect(run(root, ['--snapshot', '--reason', 'base']).status).toBe(0);
            writeFileSync(join(root, '.fear-guardian-control', 'frozen', 'matrix.json'), '{"v":9}\n');
            const result = run(root, ['--verify']);
            expect(result.status).not.toBe(0);
            expect(JSON.parse(result.stdout).result).toBe('AUTHORITY_VIOLATION');
            expect(run(root, ['--snapshot', '--reason', 'bless']).status).toBe(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('--verify is CLEAN on an untouched baseline', () => {
        const root = sandbox();
        try {
            expect(run(root, ['--snapshot', '--reason', 'base']).status).toBe(0);
            const result = run(root, ['--verify']);
            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout).result).toBe('CLEAN');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
