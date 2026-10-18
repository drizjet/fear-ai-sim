#!/usr/bin/env node

/**
 * tools/verification/verify_runtime_real_browser.mjs
 *
 * Boots the runtime in a REAL browser — not a DOM shim — and proves its own
 * frame loop advanced there.
 *
 * WHY THIS PROBE EXISTS
 * Every runtime assertion in this repository has so far run under a DOM shim
 * (see the `"DOM shim for canvas"` fixture assumptions in
 * docs/guardian/PROTECTED_TESTS.json, and the KNOWN LIMITATION note in
 * evidence/seed-runtime-verification.mjs). A shim proves nothing about whether
 * `document`, a real canvas backing store, ESM module loading, or a real
 * requestAnimationFrame loop behave as assumed. The accepted-state entry
 * "MOVEMENT D2 — runtime uses DOM shim, not real browser" is precisely that
 * gap. This probe closes it for the boot + tick claim: it builds the SAME
 * source anything else verifies into the browser bundle (vite build), serves
 * it over loopback HTTP, launches a real Chrome/Chromium/Edge, and then reads
 * the running page's own DOM counters and its own captured console log.
 *
 * WHAT IS PROVEN WHEN IT PASSES
 *   * the vite-built bundle RESOLVES and EVALUATES as an ESM module graph in a
 *     real browser (a bare-import or bundling defect fails before main.js runs);
 *   * `new Simulation(canvas, config)` constructs against a real canvas and
 *     PIXI's renderer initializes on a real DOM (its overlay canvas is
 *     appended; its init log line is present);
 *   * the rAF loop ticks: the population counter is numeric and advancing —
 *     read from the page's DOM, not from a stub;
 *   * no error surfaced: neither the page's own error net (window error +
 *     unhandledrejection handlers feeding `window.__capturedLogs`) nor the
 *     CDP exception channel saw anything, and the screenshot is real pixels
 *     (PNG, saved to disk as an artifact path you can open).
 *
 * WHAT IS NOT PROVEN, stated rather than implied
 *   * NOT rendering correctness — that agents are drawn where the sim says;
 *   * NOT GPU behaviour (the probe pins SwiftShader software GL for determinism);
 *   * NOT long-run stability (seconds of ticks, not hours);
 *   * NOT the Electron/Tauri shells, only the browser bundle.
 *
 * WHY IT IS ALLOWED TO SKIP, AND WHY THAT IS NOT A PASS
 * A machine without Chrome/Chromium/Edge cannot run this. Failing there would
 * get the probe disabled; silently passing would be worse. A missing browser
 * prints SKIPPED, names what was and was not proven, and exits 0. A machine
 * that HAS a browser should set FEAR_AI_BROWSER_REQUIRED=1 (CI does), which
 * turns a skip into a real failure.
 *
 * THE BUILD IS PART OF THE PROBE
 * The probe builds dist/ from the CURRENT source with the repo's own vite
 * before launching anything: verifying a stale dist would verify code that is
 * not in the repository. `FEAR_AI_BROWSER_SKIP_BUILD=1` reuses an existing
 * dist/ for a faster local loop and says so in its output.
 *
 * Hard Rule 9: a standalone deterministic probe. No runner, no suites.
 */

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const DIST = path.join(REPO, 'dist');
const REQUIRED = process.env.FEAR_AI_BROWSER_REQUIRED === '1';
const SKIP_BUILD = process.env.FEAR_AI_BROWSER_SKIP_BUILD === '1';
const KEEP = process.env.FEAR_AI_BROWSER_KEEP === '1';

const BOOT_DEADLINE_MS = 90_000;
// CI margins: on the GPU-less windows runner PIXI init alone consumed most of
// a 60s budget, and the first-run counter movement can crawl under SwiftShader
// (slow frames + the sim's own dt clamp). Both waits are bounded; a frozen
// one-frame mutant never moves and still fails — just after the deadline.
const PIXI_DEADLINE_MS = 120_000;
const PROGRESS_DEADLINE_MS = 120_000;
const SCREENSHOT_MIN_BYTES = 10_000;

function findBrowser() {
    const explicit = process.env.FEAR_AI_BROWSER;
    if (explicit) return fs.existsSync(explicit) ? explicit : null;

    const candidates = {
        win32: [
            path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        ],
        darwin: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ],
        linux: []
    }[process.platform] || [];

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }

    // Linux: PATH lookup. GitHub's ubuntu runners ship google-chrome here.
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
        for (const name of names) {
            const candidate = path.join(dir, name);
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return null;
}

async function pickFreePort(start, end) {
    for (let port = start; port <= end; port += 1) {
        // eslint-disable-next-line no-await-in-loop
        const free = await new Promise((resolve) => {
            const probe = net.createServer();
            probe.unref();
            probe.once('error', () => resolve(false));
            probe.listen({ host: '127.0.0.1', port }, () => probe.close(() => resolve(true)));
        });
        if (free) return port;
    }
    return null;
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm'
};

/**
 * Serve dist/ over loopback. A static server rather than `vite preview` so the
 * probe owns the child lifecycle and cannot inherit a stale port or a watcher.
 */
function startStaticServer(distDir, port) {
    const server = http.createServer((req, res) => {
        try {
            const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
            let filePath = path.normalize(path.join(distDir, urlPath));
            if (!filePath.startsWith(distDir)) {
                res.writeHead(403); res.end('forbidden'); return;
            }
            if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404); res.end(`not found: ${urlPath}`); return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            res.end(fs.readFileSync(filePath));
        } catch (error) {
            res.writeHead(500); res.end(String(error && error.message));
        }
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port }, () => resolve(server));
    });
}

function buildBundle() {
    if (SKIP_BUILD && fs.existsSync(path.join(DIST, 'index.html'))) {
        console.log('dist: reusing existing dist/ (FEAR_AI_BROWSER_SKIP_BUILD=1) — NOT a fresh build of current source');
        return true;
    }
    const viteBin = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(viteBin)) {
        console.error(`FAIL: vite is not installed at ${path.relative(REPO, viteBin)}.`);
        console.error('  The probe builds the browser bundle itself; without vite there is no honest run.');
        return false;
    }
    const started = Date.now();
    const result = spawnSync(process.execPath, [viteBin, 'build'], {
        cwd: REPO, encoding: 'utf8', timeout: 240_000, maxBuffer: 32 * 1024 * 1024
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status !== 0) {
        console.error('FAIL: `vite build` failed; no bundle to verify.');
        console.error(output.trim().split(/\r?\n/).slice(-15).join('\n'));
        return false;
    }
    console.log(`dist: built from current source in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return true;
}

/** Minimal CDP client: one page target over one websocket. */
class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        ws.on('message', (raw) => {
            const message = JSON.parse(raw.toString());
            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) reject(new Error(`${message.error.message} (${JSON.stringify(message.error.data || '')})`));
                else resolve(message.result);
            } else if (message.method) {
                this.events.push(message);
            }
        });
    }

    static async connect(webSocketDebuggerUrl) {
        const ws = new WebSocket(webSocketDebuggerUrl, { perMessageDeflate: false });
        await new Promise((resolve, reject) => {
            ws.once('open', resolve);
            ws.once('error', reject);
        });
        return new Cdp(ws);
    }

    send(method, params = {}) {
        const id = this.nextId++;
        const payload = JSON.stringify({ id, method, params });
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(payload, (error) => { if (error) { this.pending.delete(id); reject(error); } });
        });
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression, returnByValue: true, awaitPromise: true
        });
        if (result.exceptionDetails) {
            throw new Error(`page evaluation threw: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description || ''}`);
        }
        return result.result.value;
    }

    close() {
        try { this.ws.close(); } catch { /* already closed */ }
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(check, deadlineMs, intervalMs, label) {
    const deadline = Date.now() + deadlineMs;
    let lastValue;
    let lastError;
    while (Date.now() < deadline) {
        try {
            lastValue = await check();
            if (lastValue !== false && lastValue !== null && lastValue !== undefined) return lastValue;
        } catch (error) {
            lastError = error;
        }
        await sleep(intervalMs);
    }
    throw new Error(`timed out waiting ${deadlineMs / 1000}s for ${label}` +
        (lastError ? ` — last error: ${lastError.message}` : ` — last value: ${JSON.stringify(lastValue)}`));
}

async function fetchJson(url, timeoutMs = 5_000) {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.json();
}

function killChromeTree(pid) {
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', timeout: 10_000 });
    } else {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY THE RUNTIME BOOTS AND TICKS IN A REAL BROWSER');
    console.log('============================================================\n');

    const browser = findBrowser();
    if (!browser) {
        console.log('SKIPPED: no real Chrome/Chromium/Edge found on this machine.');
        console.log('');
        console.log('  WHAT THIS MEANS, stated rather than implied:');
        console.log('    * no real browser loaded the vite-built bundle, so nothing here says');
        console.log('      whether the runtime boots, ticks, or errors OUTSIDE a DOM shim;');
        console.log('    * the shim-based runtime assertions still run (and still only prove');
        console.log('      what a shim can prove); the accepted-state entry');
        console.log('      "MOVEMENT D2 — runtime uses DOM shim, not real browser" stays open;');
        console.log('    * this is NOT a pass: the claim has no evidence on this machine.');
        console.log('');
        console.log('  To run it: set FEAR_AI_BROWSER to a browser binary, or set');
        console.log('  FEAR_AI_BROWSER_REQUIRED=1 to make this probe FAIL instead of skipping.');
        process.exit(REQUIRED ? 1 : 0);
    }
    console.log(`Browser binary: ${browser}`);

    if (!buildBundle()) process.exit(1);

    const webPort = await pickFreePort(8400, 8499);
    const cdpPort = await pickFreePort(8500, 8599);
    if (!webPort || !cdpPort) {
        console.error('FAIL: no free loopback port pair found.');
        process.exit(1);
    }

    const server = await startStaticServer(DIST, webPort);
    const url = `http://127.0.0.1:${webPort}/index.html`;
    console.log(`Serving dist/ at ${url}`);

    const userDataDir = path.join(os.tmpdir(), `fear-ai-browser-probe-${process.pid}`);
    fs.rmSync(userDataDir, { recursive: true, force: true });

    const chrome = spawn(browser, [
        '--headless=new',
        '--remote-debugging-port=' + cdpPort,
        '--remote-allow-origins=*',
        '--user-data-dir=' + userDataDir,
        '--window-size=1280,800',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        // Windows-only occlusion heuristics can mark a headless window
        // "occluded" and stop producing frames entirely (rAF never fires).
        // On the GPU-less CI runner that class matched this probe's failure:
        // boot logs present, zero counter movement, zero errors.
        '--disable-backgrounding-occluded-windows',
        '--disable-features=CalculateNativeWinOcclusion',
        '--disable-dev-shm-usage',
        // Software GL is acceptable here (see scope note) but recent Chrome
        // needs this switch to allow it at all — without it, PIXI's WebGL
        // init can fail on GPU-less CI machines and the run would be a false red.
        '--enable-unsafe-swiftshader',
        // Pin ANGLE's SwiftShader backend so the renderer stack is identical on
        // every machine. On GPU-less Windows CI the default D3D11/WARP path lost
        // its GPU context mid-run (THREE "Context Restored" in the job log) and
        // the first frames stalled past the old fixed sampling window; pinning
        // software GL removes that class of false red from the verdict.
        '--use-gl=angle',
        '--use-angle=swiftshader',
        'about:blank'
    ], { stdio: 'ignore' });

    let cdp = null;
    const passed = [];
    const failed = [];
    const check = (label, ok, detail) => {
        const line = ok ? 'PASS' : 'FAIL';
        console.log(`  [${passed.length + failed.length + 1}] ${line} — ${label}${detail ? ` (${detail})` : ''}`);
        (ok ? passed : failed).push(label);
    };

    try {
        const version = await waitUntil(async () => {
            try { return await fetchJson(`http://127.0.0.1:${cdpPort}/json/version`); } catch { return false; }
        }, 30_000, 500, 'Chrome DevTools endpoint');
        console.log(`Browser: ${version.Browser}\n`);
        check('CDP endpoint answered with a real browser version', /Chrome|Chromium|Edg|HeadlessChrome/.test(version.Browser), version.Browser);

        const target = await waitUntil(async () => {
            const list = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
            return list.find((entry) => entry.type === 'page') || false;
        }, 30_000, 500, 'a page target');
        cdp = await Cdp.connect(target.webSocketDebuggerUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Log.enable');
        check('CDP page session established', true, target.url);

        await cdp.send('Page.navigate', { url });

        const moduleRan = await waitUntil(async () => {
            const state = await cdp.evaluate(`(() => ({
                ready: document.readyState,
                captured: typeof window.__capturedLogs
            }))()`);
            return state.captured === 'object' ? state : false;
        }, BOOT_DEADLINE_MS, 500, 'main.js to execute in the browser');
        check('main.js executed as an ESM module graph in a real browser', moduleRan.captured === 'object', `document.readyState=${moduleRan.ready}`);

        // PIXI's init is asynchronous and software GL can be slow: wait for it
        // (bounded) instead of sampling once. A one-shot read here raced the
        // async init on CI and produced a false red.
        try {
            await waitUntil(async () => {
                const state = await cdp.evaluate(`(() => ({
                    pixi: window.__capturedLogs.some(entry => /PixiJS High-Performance Renderer Initialized/.test(entry.message)),
                    canvasCount: document.querySelectorAll('canvas').length
                }))()`);
                return state.pixi === true && state.canvasCount >= 2;
            }, PIXI_DEADLINE_MS, 500, 'PIXI renderer to initialize (async; software GL can be slow)');
        } catch (error) {
            console.log(`  note: ${error.message}`);
        }

        const bootLog = await cdp.evaluate(`(() => {
            const messages = window.__capturedLogs.map(entry => entry.message);
            const created = messages.find(message => /\\[DEBUG\\] Simulation created, agents: \\d+/.test(message)) || null;
            const agents = created ? Number(created.match(/agents: (\\d+)/)[1]) : null;
            const pixi = messages.some(message => /PixiJS High-Performance Renderer Initialized/.test(message));
            const canvas = document.getElementById('sim-canvas');
            return {
                created, agents, pixi,
                canvasWidth: canvas ? canvas.width : 0,
                canvasHeight: canvas ? canvas.height : 0,
                canvasCount: document.querySelectorAll('canvas').length,
                userAgent: navigator.userAgent
            };
        })()`);
        check('the Simulation constructed against a real canvas with agents', typeof bootLog.agents === 'number' && bootLog.agents >= 1, bootLog.created || 'no construction log line');
        check('PIXI renderer initialized on the real DOM (overlay canvas appended)', bootLog.pixi === true && bootLog.canvasCount >= 2, `${bootLog.canvasCount} canvas element(s)`);
        check('the canvas has a real, non-zero backing store', bootLog.canvasWidth > 0 && bootLog.canvasHeight > 0, `${bootLog.canvasWidth}x${bootLog.canvasHeight}`);
        check('the page runs in a real browser engine, not a shim', /Chrome|Chromium|Edg/.test(bootLog.userAgent) && !/jsdom/i.test(bootLog.userAgent), bootLog.userAgent.slice(0, 80));

        const sample = () => cdp.evaluate(`(() => ({
            pop: Number(document.getElementById('pop-count').textContent),
            gen: Number(document.getElementById('gen-count').textContent),
            fear: document.getElementById('avg-fear').textContent
        }))()`);
        const first = await waitUntil(async () => {
            const current = await sample();
            return Number.isFinite(current.pop) && current.pop > 0 ? current : false;
        }, BOOT_DEADLINE_MS, 500, 'the population counter to become a positive number');
        check('the rAF loop set a positive population from real ticks', first.pop > 0, `population=${first.pop}`);

        // Poll for the first counter movement rather than sleeping a fixed
        // window: on software GL the first frames after init can stall for
        // several seconds, and the old fixed 5s sample turned that into a
        // false red on CI. A frozen one-frame mutant never changes anything
        // and still fails — after the deadline, not after five seconds.
        let second = first;
        let advanced = false;
        try {
            second = await waitUntil(async () => {
                const current = await sample();
                const moved = current.pop !== first.pop || current.gen !== first.gen || current.fear !== first.fear;
                return moved ? current : false;
            }, PROGRESS_DEADLINE_MS, 250, `the counters to move (up to ${PROGRESS_DEADLINE_MS / 1000}s)`);
            advanced = true;
        } catch (error) {
            console.log(`  note: ${error.message}`);
            // Discriminate the two CI failure classes for the next run:
            // rAF dead (frames 0 - throttling/occlusion) vs frames real but
            // counter movement slower than the deadline (software GL slow,
            // sim dt clamped). Printed to stderr so the CI error block shows it.
            const frameProbe = await cdp.evaluate(`new Promise((resolve) => {
                let frames = 0;
                const t0 = performance.now();
                const finish = () => resolve({
                    frames,
                    elapsedMs: Math.round(performance.now() - t0),
                    pop: document.getElementById('pop-count').textContent,
                    fear: document.getElementById('avg-fear').textContent,
                    visibility: document.visibilityState
                });
                const tick = () => {
                    frames += 1;
                    if (performance.now() - t0 < 8000) requestAnimationFrame(tick); else finish();
                };
                requestAnimationFrame(tick);
                setTimeout(finish, 10000);
            })`).catch(() => null);
            console.error(`    advancement diagnostic (stderr so CI shows it): ${JSON.stringify(frameProbe)}`);
        }
        check(`the simulation advanced within a ${PROGRESS_DEADLINE_MS / 1000}s window (not one frozen frame)`, advanced,
            `pop ${first.pop}->${second.pop}, gen ${first.gen}->${second.gen}, avgFear ${first.fear}->${second.fear}`);

        const errorState = await cdp.evaluate(`(() => {
            const errors = window.__capturedLogs.filter(entry => entry.level === 'error').map(entry => entry.message);
            return { errors, total: window.__capturedLogs.length };
        })()`);
        const cdpExceptions = cdp.events.filter((event) => event.method === 'Runtime.exceptionThrown')
            .map((event) => event.params.exceptionDetails.text + ' ' + (event.params.exceptionDetails.exception?.description || ''));
        const cdpLogErrors = cdp.events.filter((event) => event.method === 'Log.entryAdded' && event.params.entry.level === 'error')
            .map((event) => event.params.entry.text);
        check('no runtime errors in the page\'s own error net or via CDP', errorState.errors.length === 0 && cdpExceptions.length === 0 && cdpLogErrors.length === 0,
            `${errorState.total} log line(s), ${errorState.errors.length + cdpExceptions.length + cdpLogErrors.length} error(s)`);
        for (const error of [...errorState.errors, ...cdpExceptions, ...cdpLogErrors].slice(0, 5)) {
            console.log(`         error: ${String(error).slice(0, 160)}`);
        }

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const shotBytes = Math.floor(shot.data.length * 0.75);
        const shotPath = path.join(userDataDir, 'runtime-boot.png');
        fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
        check('the browser rendered real pixels (PNG screenshot captured)', shot.data.startsWith('iVBORw0KGgo') && shotBytes >= SCREENSHOT_MIN_BYTES,
            `${shotBytes} bytes at ${shotPath}`);

        console.log('');
        console.log('============================================================');
        if (failed.length === 0) {
            console.log(`SUCCESS: the vite-built runtime bundle booted, rendered, and its frame`);
            console.log(`loop advanced inside ${version.Browser}.`);
            console.log('Scope: boot + construction + real-canvas PIXI init + rAF progression +');
            console.log('error-free console, on this machine and this build. NOT rendering');
            console.log('correctness, NOT GPU fidelity (software GL pinned for determinism), NOT long-run');
            console.log('stability, NOT the Electron/Tauri shells.');
            if (KEEP) console.log(`Artifacts kept at ${userDataDir} (FEAR_AI_BROWSER_KEEP=1).`);
            console.log(`All ${passed.length} runtime-real-browser assertions PASSED.`);
        } else {
            console.error(`FAILED ${failed.length} of ${passed.length + failed.length} runtime-real-browser assertions:`);
            for (const label of failed) console.error(`  * ${label}`);
            const tail = await cdp.evaluate(`window.__capturedLogs.slice(-10).map(entry => entry.level + ': ' + entry.message)`).catch(() => []);
            for (const line of tail) console.error(`    ${String(line).slice(0, 160)}`);
        }
        console.log('============================================================');
    } finally {
        cdp?.close();
        killChromeTree(chrome.pid);
        server.close();
        // close() only stops accepting new connections; the page's keep-alive
        // sockets to this server can keep the event loop alive until they time
        // out, which is exactly the "proved its claim, then got killed by the
        // suite budget" false red this probe hit on CI 2026-10-18.
        server.closeAllConnections?.();
        if (KEEP) {
            console.log(`Kept: ${userDataDir}`);
        } else {
            await sleep(300);
            try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome children may still hold files; harmless */ }
        }
    }

    if (failed.length > 0) process.exit(1);
    // A success must terminate the process as decisively as a failure does.
    // Everything this probe exists to prove has been printed above; from here
    // only best-effort teardown remains. Without this exit, one stray handle
    // (a socket the killed Chrome never FINed, a pending CDP frame) keeps the
    // event loop alive and the suite's timeout kills a probe that already
    // printed its SUCCESS banner — the false red observed on CI 2026-10-18.
    process.exit(0);
}

main().catch((error) => {
    console.error('\nVERIFICATION FAILURE:', error.message);
    process.exit(1);
});
