#!/usr/bin/env node
// Bounded packaging gate, not a dead-code classifier. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';

// With no arguments (the probe suite runs every verify_*.mjs bare), gate this
// repository's own browser and Tauri packaging boundary.
const argv = process.argv.slice(2);
const args = argv.length ? argv : ['--root', path.resolve(import.meta.dirname, '../..')];
const flags = new Set(['--root', '--entry', '--tauri-config', '--quarantine']);
const option = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`Missing value for ${flag}`);
  return args[index + 1];
};

try {
  if (args.length % 2 || args.some((arg, index) => index % 2 === 0 && !flags.has(arg))) {
    // Deliberately do not infer alternative entrypoints from an arbitrary directory.
    throw new Error('Usage: node verify_entrypoint_assets.mjs --root DIR [--entry index.html] [--tauri-config src-tauri/tauri.conf.json] [--quarantine config/quarantined-modules.json]');
  }
  if (!args.includes('--root')) throw new Error('--root is required');
  const root = fs.realpathSync(path.resolve(option('--root', '')));
  if (!root || !fs.statSync(root).isDirectory()) throw new Error('Root must be an existing directory');
  const entry = option('--entry', 'index.html');
  const config = option('--tauri-config', 'src-tauri/tauri.conf.json');
  const quarantine = option('--quarantine', 'config/quarantined-modules.json');
  const problems = [];
  const graph = [];
  const browserAssets = new Set();
  const workerTargets = new Set();
  const tauriIcons = [];
  const retainedOptional = [];
  const externalImports = new Set();
  const visited = new Set();
  const queue = [];
  const rel = (file) => path.relative(root, file).split(path.sep).join('/') || '.';
  const isInside = (file) => {
    const distance = path.relative(root, file);
    return distance !== '..' && !distance.startsWith(`..${path.sep}`) && !path.isAbsolute(distance);
  };

  function locate(base, spec, kind) {
    if (/^(?:https?:|data:|blob:|#)/i.test(spec)) return null;
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
      if (kind === 'static-import' || kind === 'dynamic-import') externalImports.add(spec);
      else problems.push({ kind: 'NONLOCAL_REFERENCE', from: rel(base), spec });
      return null;
    }
    const file = path.resolve(spec.startsWith('/') ? root : path.dirname(base), spec.startsWith('/') ? `.${spec}` : spec);
    if (!isInside(file)) {
      problems.push({ kind: 'OUTSIDE_PROJECT', from: rel(base), spec });
      return null;
    }
    if (!fs.existsSync(file)) {
      problems.push({ kind: 'MISSING_REQUIRED', via: kind, from: rel(base), file: rel(file) });
      return null;
    }
    if (!isInside(fs.realpathSync(file)) || !fs.statSync(file).isFile()) {
      problems.push({ kind: 'UNSAFE_TARGET', via: kind, from: rel(base), file: rel(file) });
      return null;
    }
    graph.push({ via: kind, from: rel(base), to: rel(file) });
    if (kind === 'worker-url') workerTargets.add(rel(file));
    if (kind === 'html-module' || kind === 'html-stylesheet') browserAssets.add(rel(file));
    if (/\.(?:m?js|cjs|jsx|ts|tsx)$/i.test(file)) queue.push(file);
    return file;
  }

  const entryFile = path.resolve(root, entry);
  if (!isInside(entryFile) || !fs.existsSync(entryFile) || !fs.statSync(entryFile).isFile()) {
    problems.push({ kind: 'INVALID_BROWSER_ENTRY', file: entry });
  } else if (path.extname(entryFile).toLowerCase() === '.html') {
    const html = fs.readFileSync(entryFile, 'utf8');
    let modules = 0;
    for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
      if (!/\btype\s*=\s*['"]module['"]/i.test(match[0])) continue;
      const src = /\bsrc\s*=\s*['"]([^'"]+)['"]/i.exec(match[0]);
      if (src) { modules++; locate(entryFile, src[1], 'html-module'); }
      else problems.push({ kind: 'UNSUPPORTED_INLINE_MODULE', file: rel(entryFile) });
    }
    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
      if (!/\brel\s*=\s*['"]stylesheet['"]/i.test(match[0])) continue;
      const href = /\bhref\s*=\s*['"]([^'"]+)['"]/i.exec(match[0]);
      if (href && href[1].startsWith('.')) locate(entryFile, href[1], 'html-stylesheet');
    }
    if (!modules) problems.push({ kind: 'NO_BROWSER_MODULE_ENTRY', file: rel(entryFile) });
  } else {
    queue.push(entryFile);
  }

  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\r\n]*$/gm, '');
    const direct = /^\s*import\s+(?:[\w$*{},\s]+?\s+from\s*)?(['"])([^'"\r\n]+)\1/gm;
    const reexport = /^\s*export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\s*(['"])([^'"\r\n]+)\1/gm;
    const dynamic = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
    const worker = /\bnew\s+(?:Shared)?Worker\s*\(\s*new\s+URL\s*\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g;
    for (const match of source.matchAll(direct)) locate(file, match[2], 'static-import');
    for (const match of source.matchAll(reexport)) locate(file, match[2], 'static-import');
    for (const match of source.matchAll(dynamic)) locate(file, match[2], 'dynamic-import');
    let recognizedWorkers = 0;
    for (const match of source.matchAll(worker)) {
      recognizedWorkers++;
      locate(file, match[2], 'worker-url');
    }
    const totalWorkers = [...source.matchAll(/\bnew\s+(?:Shared)?Worker\s*\(/g)].length;
    if (totalWorkers !== recognizedWorkers) {
      problems.push({ kind: 'UNSUPPORTED_WORKER_CONSTRUCTOR', file: rel(file), totalWorkers, recognizedWorkers });
    }
  }

  const configFile = path.resolve(root, config);
  if (!isInside(configFile) || !fs.existsSync(configFile)) {
    problems.push({ kind: 'MISSING_TAURI_CONFIG', file: config });
  } else {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!Array.isArray(parsed.bundle?.icon)) {
      problems.push({ kind: 'MISSING_TAURI_ICON_DECLARATIONS', file: rel(configFile) });
    } else {
      for (const icon of parsed.bundle.icon) {
        tauriIcons.push(icon);
        if (typeof icon !== 'string' || !icon.startsWith('.')) {
          // Tauri icon paths are config-directory-relative, e.g. icons/32x32.png.
          const canonical = path.resolve(path.dirname(configFile), String(icon));
          locate(configFile, `./${path.relative(path.dirname(configFile), canonical).split(path.sep).join('/')}`, 'tauri-icon');
        } else locate(configFile, icon, 'tauri-icon');
      }
    }
  }

  const quarantineFile = path.resolve(root, quarantine);
  if (!isInside(quarantineFile) || !fs.existsSync(quarantineFile)) {
    problems.push({ kind: 'MISSING_QUARANTINE_MANIFEST', file: quarantine });
  } else {
    const parsed = JSON.parse(fs.readFileSync(quarantineFile, 'utf8'));
    for (const item of parsed.modules ?? []) {
      if (item.verdict !== 'RETAIN_OPTIONAL') continue;
      const file = path.resolve(root, item.module);
      if (!isInside(file)) {
        problems.push({ kind: 'OUTSIDE_OPTIONAL_DECLARATION', file: item.module });
        continue;
      }
      retainedOptional.push({ file: rel(file), present: fs.existsSync(file), disposition: 'PROTECT_FROM_DELETION' });
    }
  }

  const result = {
    status: problems.length ? 'FAIL' : 'PASS',
    root,
    entry,
    modules: [...visited].map(rel).sort(),
    browserAssets: [...browserAssets].sort(),
    workerTargets: [...workerTargets].sort(),
    tauriIcons,
    retainedOptional,
    graph,
    externalImports: [...externalImports].sort(),
    problems,
    note: 'An absent static import is NEVER evidence that an asset is safe to delete. Only these explicit browser/Tauri boundaries are checked.'
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = problems.length ? 1 : 0;
} catch (error) {
  process.stderr.write(`CONFIGURATION_ERROR ${error.message}\n`);
  process.exitCode = 2;
}
