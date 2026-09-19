/**
 * tools/verification/verify_server_reconnect.mjs
 *
 * Verifies the actual loopback WebSocket lifecycle contract:
 * 1. Registration and ticking work through a real listening socket.
 * 2. A socket close removes the transport connection but preserves the
 *    server-scoped agent state for a reconnect.
 * 3. The reconnect can continue ticking the preserved agent and can explicitly
 *    unregister it.
 * 4. Correlated pacing and snapshot errors survive the real transport path.
 *
 * Hard Rule 9 Compliant: standalone deterministic smoke probe; no test runner.
 */

import { WebSocket } from 'ws';
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function connect(url) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const onError = (error) => {
            ws.removeListener('open', onOpen);
            reject(error);
        };
        const onOpen = () => {
            ws.removeListener('error', onError);
            resolve(ws);
        };
        ws.once('error', onError);
        ws.once('open', onOpen);
    });
}

function closeSocket(ws) {
    if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        ws.once('close', () => {
            clearTimeout(timer);
            resolve();
        });
        ws.close();
    });
}

function request(ws, payload, predicate, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out waiting for ${label}.`));
        }, 2000);

        const onMessage = (data, isBinary) => {
            if (isBinary) return;
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch {
                return;
            }
            if (!predicate(message)) return;
            cleanup();
            resolve(message);
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const cleanup = () => {
            clearTimeout(timer);
            ws.removeListener('message', onMessage);
            ws.removeListener('error', onError);
        };

        ws.on('message', onMessage);
        ws.once('error', onError);
        ws.send(JSON.stringify(payload));
    });
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY REAL WEBSOCKET RECONNECT CONTRACT');
    console.log('============================================================\n');

    const server = new FearServer({ host: '127.0.0.1', port: 0, seed: 4242 });
    let firstSocket;
    let reconnectSocket;

    try {
        const bound = await server.start();
        const url = `ws://127.0.0.1:${bound.port}`;
        firstSocket = await connect(url);

        const handshake = await request(
            firstSocket,
            { type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '1.0.0', client_id: 'reconnect-client', message_id: 'h1' },
            (message) => message.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE,
            'initial handshake'
        );
        assert(handshake.status === 'ACCEPTED', 'initial handshake must be accepted.');
        assert(handshake.message_id === 'h1', 'initial handshake correlation ID must survive.');

        const registered = await request(
            firstSocket,
            { type: MESSAGE_TYPES.REGISTER_AGENT, agent_id: 'reconnect-agent', traits: { neuroticism: 0.5 }, message_id: 'r1' },
            (message) => message.type === 'REGISTER_AGENT_ACK',
            'agent registration'
        );
        assert(registered.status === 'REGISTERED', 'agent registration must succeed.');
        assert(server.simulation.agents.has('reconnect-agent'), 'registered agent must exist in server state.');

        const firstTick = await request(
            firstSocket,
            {
                type: MESSAGE_TYPES.BATCH_TICK_REQUEST,
                dt: 0.0166,
                observations: [{ agent_id: 'reconnect-agent', threats: [{ type: 'PREDATOR', distance: 3, intensity: 1 }] }],
                message_id: 't1'
            },
            (message) => message.type === MESSAGE_TYPES.BATCH_TICK_RESPONSE,
            'initial tick'
        );
        assert(firstTick.message_id === 't1', 'initial tick correlation ID must survive.');
        assert(firstTick.results.some((result) => result.agent_id === 'reconnect-agent'), 'initial tick must return the registered agent.');
        console.log('--- registration and first tick: PASS');

        await closeSocket(firstSocket);
        assert(!server.connectedClients.has(firstSocket), 'closed socket must leave connectedClients.');
        assert(server.simulation.agents.has('reconnect-agent'), 'socket close must preserve server-scoped agent state.');

        reconnectSocket = await connect(url);
        const reconnectHandshake = await request(
            reconnectSocket,
            { type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '1.0.0', client_id: 'reconnect-client', message_id: 'h2' },
            (message) => message.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE,
            'reconnect handshake'
        );
        assert(reconnectHandshake.status === 'ACCEPTED', 'reconnect handshake must be accepted.');

        const reconnectTick = await request(
            reconnectSocket,
            { type: MESSAGE_TYPES.BATCH_TICK_REQUEST, dt: 0.0166, observations: [], message_id: 't2' },
            (message) => message.type === MESSAGE_TYPES.BATCH_TICK_RESPONSE,
            'reconnect tick'
        );
        assert(reconnectTick.message_id === 't2', 'reconnect tick correlation ID must survive.');
        assert(reconnectTick.results.some((result) => result.agent_id === 'reconnect-agent'), 'reconnect tick must see preserved agent state.');
        console.log('--- close/reconnect state continuity: PASS');

        const badPacing = await request(
            reconnectSocket,
            { type: MESSAGE_TYPES.SET_PACING_OVERRIDE, intensity: { invalid: true }, message_id: 'p1' },
            (message) => message.type === MESSAGE_TYPES.ERROR_RESPONSE,
            'invalid pacing error'
        );
        assert(badPacing.code === ERROR_CODES.VALIDATION_FAILED, 'invalid pacing must be a validation error over the real socket.');
        assert(badPacing.message_id === 'p1', 'invalid pacing error must preserve correlation ID over the real socket.');

        const badSnapshot = await request(
            reconnectSocket,
            { type: MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST, snapshot: { version: 3 }, message_id: 's1' },
            (message) => message.type === MESSAGE_TYPES.ERROR_RESPONSE,
            'invalid snapshot error'
        );
        assert(badSnapshot.code === ERROR_CODES.SNAPSHOT_ERROR, 'invalid snapshot must be a snapshot error over the real socket.');
        assert(badSnapshot.message_id === 's1', 'invalid snapshot error must preserve correlation ID over the real socket.');

        const removed = await request(
            reconnectSocket,
            { type: MESSAGE_TYPES.UNREGISTER_AGENT, agent_id: 'reconnect-agent', message_id: 'u1' },
            (message) => message.type === 'UNREGISTER_AGENT_ACK',
            'explicit unregister'
        );
        assert(removed.status === 'UNREGISTERED', 'explicit unregister must remove the preserved agent.');
        assert(!server.simulation.agents.has('reconnect-agent'), 'explicit unregister must clear server state after reconnect.');
        console.log('--- real-socket validation and explicit retirement: PASS');
    } finally {
        await closeSocket(firstSocket);
        await closeSocket(reconnectSocket);
        await server.stop();
    }

    console.log('\n============================================================');
    console.log('SUCCESS: Real WebSocket reconnect verification passed.');
    console.log('============================================================\n');
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
