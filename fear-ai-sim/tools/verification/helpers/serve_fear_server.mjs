#!/usr/bin/env node

/**
 * tools/verification/helpers/serve_fear_server.mjs
 *
 * Start a `FearServer` for a probe, with the options probes actually need.
 *
 * WHY THIS EXISTS RATHER THAN `packages/runtime/bin/fear-ai-server.js`
 * Two reasons, both worth writing down:
 *
 *   1. `packages/runtime/bin/` is matched by the repository's `**​/bin/`
 *      ignore rule, so tooling that respects ignore rules cannot see or edit the
 *      packaged CLI - and a probe that cannot set the option it is testing is a
 *      probe that silently tests the default.
 *   2. `--signature-policy` is what makes the difference between "the host knows
 *      the session name" and "the host proved a private key", and a probe about
 *      request signing has to control it explicitly.
 *
 * Usage:
 *   node tools/verification/helpers/serve_fear_server.mjs \
 *     --port=8890 --host=127.0.0.1 --signature-policy=required [--snapshot-dir=<path>]
 *
 * Prints `FEAR_SERVER_READY port=<n>` on stdout once it is listening, so a probe
 * can wait for a fact instead of sleeping and hoping.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FearServer } from '../../../packages/runtime/src/FearServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');

const options = { port: 8765, host: '127.0.0.1', signaturePolicy: 'preferred', snapshotDir: null };
for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--port=')) options.port = Number(arg.slice('--port='.length)) || 8765;
    else if (arg.startsWith('--host=')) options.host = arg.slice('--host='.length);
    else if (arg.startsWith('--signature-policy=')) options.signaturePolicy = arg.slice('--signature-policy='.length).trim();
    else if (arg.startsWith('--snapshot-dir=')) options.snapshotDir = arg.slice('--snapshot-dir='.length);
}

if (!['off', 'preferred', 'required'].includes(options.signaturePolicy)) {
    console.error(`[probe-server] unknown signature policy '${options.signaturePolicy}'`);
    process.exit(2);
}

// A snapshot directory lets a probe restart the middleware around a persisted
// world AND a persisted public key, which is what proves that a restarted server
// still recognises the host that signed before the restart.
if (options.snapshotDir) {
    if (!fs.existsSync(options.snapshotDir)) fs.mkdirSync(options.snapshotDir, { recursive: true });
    process.chdir(options.snapshotDir);
}

const server = new FearServer({
    host: options.host,
    port: options.port,
    signaturePolicy: options.signaturePolicy
});

server.start().then(({ port }) => {
    console.log(`FEAR_SERVER_READY port=${port} policy=${options.signaturePolicy} root=${REPO}`);
}).catch((err) => {
    console.error('[probe-server] failed to start:', err);
    process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        await server.stop();
        process.exit(0);
    });
}
