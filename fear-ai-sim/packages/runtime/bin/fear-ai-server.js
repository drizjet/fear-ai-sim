#!/usr/bin/env node
/**
 * Fear AI Standalone Middleware Server CLI
 *
 * Usage:
 *   node bin/fear-ai-server.js --port 8765 --host 127.0.0.1 --seed 1337
 */

import { FearServer } from '../src/FearServer.js';

const args = process.argv.slice(2);
let port = 8765;
let host = '127.0.0.1';
let seed = 1337;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1], 10) || 8765;
        i++;
    } else if (args[i] === '--host' && args[i + 1]) {
        host = args[i + 1];
        i++;
    } else if (args[i] === '--seed' && args[i + 1]) {
        seed = parseInt(args[i + 1], 10) || 1337;
        i++;
    }
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           FEAR AI UNIVERSAL MIDDLEWARE SERVER                ║');
console.log('║      Engine-Agnostic Affective Behavioral Intelligence       ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const server = new FearServer({ host, port, seed });

server.start().then(({ host: actualHost, port: actualPort }) => {
    console.log(`[FearAI] Server running at:`);
    console.log(`  - HTTP API:  http://${actualHost}:${actualPort}/api/v1/status`);
    console.log(`  - WebSocket: ws://${actualHost}:${actualPort}`);
    console.log(`  - Seed:      ${seed}`);
    console.log(`[FearAI] Ready to accept Unity, Unreal, Godot, and Custom Engine clients.`);
}).catch((err) => {
    console.error('[FearAI] Failed to start server:', err);
    process.exit(1);
});

process.on('SIGINT', async () => {
    console.log('\n[FearAI] Shutting down gracefully...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[FearAI] Terminating...');
    await server.stop();
    process.exit(0);
});
