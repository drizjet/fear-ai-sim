#!/usr/bin/env node
/**
 * Verify the six adapter release packages without executing them.
 *
 * This is a release-integrity check, not a test suite. It reads the zips and
 * their manifest/checksums and asserts:
 *   - every package is built from git-tracked adapter files only;
 *   - no bin/obj/target/__pycache__/node_modules/dist entry exists;
 *   - no entry path is absolute or escapes the package root;
 *   - every source entry matches the working tree byte for byte;
 *   - LICENSE and PACKAGE_MANIFEST.json are present;
 *   - CHECKSUMS.sha256 and RELEASE_MANIFEST.json agree with the files on disk.
 *
 * The only external command used is `git`, to read the tracked-file list.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const gitRoot = resolve(repoRoot, '..');
const distDir = join(repoRoot, 'packages', 'dist');
const allowDirty = process.argv.includes('--allow-dirty');

const ADAPTERS = ['unity', 'godot', 'unreal', 'csharp', 'python', 'rust'];
const EXCLUDED = /(^|\/)(bin|obj|target|__pycache__|node_modules|dist|\.vs|\.idea|\.git)(\/|$)/;
const scopePath = join(__dirname, 'package-scope.json');
const AUXILIARY = new Set(['LICENSE', 'LICENSE-NOTE.txt', 'PACKAGE_MANIFEST.json']);
const TEXT_EXTENSION = /\.(md|txt|json|cs|js|mjs|py|gd|rs|toml|cfg|uplugin|csproj|asmdef|bat|ps1|sh|yml|yaml)$/i;

const failures = [];
function fail(message) {
    failures.push(message);
}
function check(condition, message) {
    if (!condition) fail(message);
}
function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
function git(args, cwd = gitRoot) {
    const result = spawnSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed (${result.status}): ${(result.stderr || '').trim()}`);
    }
    return result.stdout;
}
function lines(text) {
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}
function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Minimal ZIP central-directory reader for the packages this script writes.
 * Supports stored (0) and deflate (8); rejects ZIP64 and anything exotic.
 */
function readZip(path) {
    const buf = readFileSync(path);
    let eocd = -1;
    const min = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= min; i -= 1) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error(`${relative(repoRoot, path)}: end-of-central-directory record not found`);

    const count = buf.readUInt16LE(eocd + 10);
    const centralSize = buf.readUInt32LE(eocd + 12);
    const centralOffset = buf.readUInt32LE(eocd + 16);
    if (count === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
        throw new Error(`${relative(repoRoot, path)}: ZIP64 is not supported by this verifier`);
    }
    if (centralOffset + centralSize > buf.length) {
        throw new Error(`${relative(repoRoot, path)}: central directory is outside the file`);
    }

    const entries = [];
    let p = centralOffset;
    for (let i = 0; i < count; i += 1) {
        if (buf.readUInt32LE(p) !== 0x02014b50) {
            throw new Error(`${relative(repoRoot, path)}: bad central-directory signature at ${p}`);
        }
        const flags = buf.readUInt16LE(p + 8);
        const method = buf.readUInt16LE(p + 10);
        const compressedSize = buf.readUInt32LE(p + 20);
        const uncompressedSize = buf.readUInt32LE(p + 24);
        const nameLength = buf.readUInt16LE(p + 28);
        const extraLength = buf.readUInt16LE(p + 30);
        const commentLength = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.subarray(p + 46, p + 46 + nameLength).toString(flags & 0x800 ? 'utf8' : 'utf8');

        if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
            throw new Error(`${relative(repoRoot, path)}: bad local-header signature for ${name}`);
        }
        const localNameLength = buf.readUInt16LE(localOffset + 26);
        const localExtraLength = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = buf.subarray(dataStart, dataStart + compressedSize);

        let data;
        if (method === 0) data = compressed;
        else if (method === 8) data = inflateRawSync(compressed);
        else throw new Error(`${relative(repoRoot, path)}: ${name} uses unsupported compression method ${method}`);

        if (data.length !== uncompressedSize) {
            throw new Error(`${relative(repoRoot, path)}: ${name} inflated to ${data.length}, expected ${uncompressedSize}`);
        }
        entries.push({ name, data, method });
        p += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function sourceRelative(adapter, trackedPath) {
    const prefix = `packages/adapters/${adapter}/`;
    if (!trackedPath.startsWith(prefix)) throw new Error(`tracked path escaped ${adapter}: ${trackedPath}`);
    return trackedPath.slice(prefix.length);
}

function entryMap(entries) {
    const map = new Map();
    for (const entry of entries) {
        if (map.has(entry.name)) fail(`duplicate zip entry: ${entry.name}`);
        map.set(entry.name, entry);
    }
    return map;
}

console.log('============================================================');
console.log('VERIFY FEAR AI ADAPTER PACKAGES');
console.log('============================================================');

const releaseManifestPath = join(distDir, 'RELEASE_MANIFEST.json');
const checksumsPath = join(distDir, 'CHECKSUMS.sha256');
check(existsSync(releaseManifestPath), `missing ${relative(repoRoot, releaseManifestPath)}`);
check(existsSync(checksumsPath), `missing ${relative(repoRoot, checksumsPath)}`);
if (failures.length > 0) {
    for (const message of failures) console.error(`  FAIL  ${message}`);
    process.exit(1);
}

const releaseManifest = readJson(releaseManifestPath);
const scope = readJson(scopePath);
const sourceCommit = git(['rev-parse', 'HEAD']).trim();
const sourceDirty = git(['status', '--porcelain']).trim().length > 0;
const rootLicense = readFileSync(join(gitRoot, 'LICENSE'));

check(scope.schema === 'fear-ai-package-scope/v1', 'package scope schema is not fear-ai-package-scope/v1');
check(scope.adapters && typeof scope.adapters === 'object', 'package scope has no adapters object');
for (const adapter of ADAPTERS) check(scope.adapters && scope.adapters[adapter], `package scope is missing adapter ${adapter}`);
check(releaseManifest.schema === 'fear-ai-release-package/v1', 'release manifest schema is not fear-ai-release-package/v1');
check(releaseManifest.packageCount === ADAPTERS.length, `release manifest packageCount is ${releaseManifest.packageCount}, expected ${ADAPTERS.length}`);
check(Array.isArray(releaseManifest.packages) && releaseManifest.packages.length === ADAPTERS.length,
    'release manifest does not list exactly six packages');
check(releaseManifest.checksumsSha256 === sha256(readFileSync(checksumsPath)),
    'release manifest checksumsSha256 does not match CHECKSUMS.sha256');

if (!allowDirty) {
    check(!sourceDirty, 'working tree is dirty; release verification must run on a committed checkout');
    check(releaseManifest.sourceCommit === sourceCommit,
        `release manifest sourceCommit ${releaseManifest.sourceCommit} does not match HEAD ${sourceCommit}`);
    check(releaseManifest.sourceDirty === false, 'release manifest says sourceDirty=true');
}

const checksumMap = new Map();
for (const line of lines(readFileSync(checksumsPath, 'utf8'))) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
    if (!match) {
        fail(`malformed CHECKSUMS.sha256 line: ${line}`);
        continue;
    }
    checksumMap.set(match[2], match[1]);
}
check(checksumMap.size === ADAPTERS.length, `CHECKSUMS.sha256 lists ${checksumMap.size} files, expected ${ADAPTERS.length}`);

const listedAdapters = new Set(releaseManifest.packages.map(pkg => pkg.adapter));
for (const adapter of ADAPTERS) check(listedAdapters.has(adapter), `release manifest is missing adapter ${adapter}`);
for (const adapter of listedAdapters) check(ADAPTERS.includes(adapter), `release manifest has unknown adapter ${adapter}`);

for (const adapter of ADAPTERS) {
    const pkg = releaseManifest.packages.find(item => item.adapter === adapter);
    if (!pkg) continue;

    const zipPath = join(distDir, pkg.file);
    check(existsSync(zipPath), `missing package ${pkg.file}`);
    if (!existsSync(zipPath)) continue;

    const zipBytes = readFileSync(zipPath);
    const zipHash = sha256(zipBytes);
    check(pkg.sha256 === zipHash, `${pkg.file}: release manifest sha256 does not match the file`);
    check(checksumMap.get(pkg.file) === zipHash, `${pkg.file}: CHECKSUMS.sha256 does not match the file`);
    check(pkg.bytes === zipBytes.length, `${pkg.file}: release manifest byte count does not match the file`);

    let entries;
    try {
        entries = readZip(zipPath);
    } catch (error) {
        fail(`${pkg.file}: ${error.message}`);
        continue;
    }
    const map = entryMap(entries);
    const names = [...map.keys()];

    for (const name of names) {
        if (name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name) || name.includes('\\')) {
            fail(`${pkg.file}: absolute or non-portable entry path: ${name}`);
        }
        if (name.split('/').includes('..')) fail(`${pkg.file}: parent traversal in entry path: ${name}`);
        if (EXCLUDED.test(name)) fail(`${pkg.file}: build-output entry is not allowed: ${name}`);
    }

    check(map.has('LICENSE'), `${pkg.file}: LICENSE is missing`);
    check(map.has('PACKAGE_MANIFEST.json'), `${pkg.file}: PACKAGE_MANIFEST.json is missing`);
    if (map.has('LICENSE')) {
        check(map.get('LICENSE').data.equals(rootLicense), `${pkg.file}: LICENSE does not match the repository LICENSE`);
    }

    let manifest;
    if (map.has('PACKAGE_MANIFEST.json')) {
        try {
            manifest = JSON.parse(map.get('PACKAGE_MANIFEST.json').data.toString('utf8'));
        } catch (error) {
            fail(`${pkg.file}: PACKAGE_MANIFEST.json is not valid JSON: ${error.message}`);
        }
    }
    if (!manifest) continue;

    check(manifest.schema === 'fear-ai-adapter-package/v1', `${pkg.file}: package manifest schema is wrong`);
    check(manifest.adapter === adapter, `${pkg.file}: package manifest adapter is ${manifest.adapter}`);
    check(manifest.licenseExpression === pkg.licenseExpression, `${pkg.file}: package manifest licenseExpression disagrees with release manifest`);
    check(manifest.sourceCommit === sourceCommit || allowDirty, `${pkg.file}: package manifest sourceCommit does not match HEAD`);
    check(manifest.sourceDirty === false || allowDirty, `${pkg.file}: package manifest says sourceDirty=true`);
    check(Array.isArray(manifest.files), `${pkg.file}: package manifest files is not an array`);
    check(manifest.fileCount === manifest.files.length, `${pkg.file}: package manifest fileCount does not match files.length`);

    const tracked = lines(git(['ls-files', '--', `packages/adapters/${adapter}`], repoRoot));
    const trackedSet = new Set(tracked.map(path => sourceRelative(adapter, path)));
    const scopeEntry = scope.adapters[adapter];
    const excluded = new Map((scopeEntry.exclude || []).map(item => [item.path, item.reason]));
    const manifestExcluded = Array.isArray(manifest.excludedSourceFiles) ? manifest.excludedSourceFiles : [];
    const manifestExcludedMap = new Map(manifestExcluded.map(item => [item.path, item.reason]));
    const expected = new Set([...trackedSet].filter(path => !excluded.has(path)));
    const manifestFiles = new Set((manifest.files || []).map(file => file.path));
    const sourceEntries = new Set(names.filter(name => !AUXILIARY.has(name)));

    check(manifest.packageScope === 'tools/packaging/package-scope.json', `${pkg.file}: package manifest does not name the package scope`);
    check(manifestExcluded.length === excluded.size, `${pkg.file}: package manifest excludedSourceFiles has the wrong length`);
    check(manifestExcludedMap.size === manifestExcluded.length, `${pkg.file}: package manifest has duplicate excluded paths`);
    for (const [path, reason] of excluded) {
        check(typeof reason === 'string' && reason.trim().length > 0, `${pkg.file}: package scope exclusion has no reason: ${path}`);
        check(trackedSet.has(path), `${pkg.file}: package scope excludes an untracked file: ${path}`);
        check(!sourceEntries.has(path), `${pkg.file}: excluded source file is still in the zip: ${path}`);
        check(!manifestFiles.has(path), `${pkg.file}: excluded source file is still in the package manifest: ${path}`);
        check(manifestExcludedMap.get(path) === reason, `${pkg.file}: package manifest exclusion does not match package scope: ${path}`);
    }
    for (const path of trackedSet) {
        check(expected.has(path) || excluded.has(path),
            `${pkg.file}: tracked file is neither packaged nor declared excluded: ${path}`);
    }
    for (const path of expected) {
        check(!EXCLUDED.test(path), `${pkg.file}: tracked build artifact would be required: ${path}`);
        check(manifestFiles.has(path), `${pkg.file}: tracked file missing from package manifest: ${path}`);
        check(sourceEntries.has(path), `${pkg.file}: tracked file missing from zip: ${path}`);
    }
    for (const path of sourceEntries) {
        check(expected.has(path), `${pkg.file}: zip contains an untracked or excluded source file: ${path}`);
    }
    for (const path of manifestFiles) {
        check(expected.has(path) || AUXILIARY.has(path), `${pkg.file}: package manifest lists an untracked or excluded file: ${path}`);
    }

    for (const file of manifest.files || []) {
        const entry = map.get(file.path);
        if (!entry) {
            fail(`${pkg.file}: manifest file is absent from zip: ${file.path}`);
            continue;
        }
        check(sha256(entry.data) === file.sha256, `${pkg.file}: ${file.path} does not match its manifest sha256`);
        check(entry.data.length === file.bytes, `${pkg.file}: ${file.path} does not match its manifest byte count`);
        if (file.path !== 'LICENSE' && !file.path.startsWith('LICENSE-NOTE')) {
            const workingPath = join(repoRoot, 'packages', 'adapters', adapter, file.path);
            check(existsSync(workingPath), `${pkg.file}: ${file.path} is absent from the working tree`);
            if (existsSync(workingPath)) {
                check(sha256(readFileSync(workingPath)) === file.sha256,
                    `${pkg.file}: ${file.path} does not match the working tree source`);
            }
        }
    }

    if (adapter === 'rust') {
        check(map.has('LICENSE-NOTE.txt'), 'fear-ai-rust.zip: LICENSE-NOTE.txt is missing');
    }

    for (const entry of entries) {
        if (!TEXT_EXTENSION.test(entry.name)) continue;
        const text = entry.data.toString('utf8');
        if (/(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)/i.test(text)) {
            fail(`${pkg.file}: local absolute path leaked into ${entry.name}`);
        }
    }

    console.log(`  PASS  ${pkg.file}  ${names.length} entries  ${zipBytes.length} bytes  ${zipHash.slice(0, 12)}…`);
}

const total = failures.length;
console.log('');
if (total > 0) {
    console.log(`FAILED - ${total} packaging finding(s).`);
    for (const message of failures) console.log(`  - ${message}`);
    process.exit(1);
}
console.log(`PASSED - ${ADAPTERS.length}/${ADAPTERS.length} adapter packages are tracked-source-only, licensed, and checksummed.`);
