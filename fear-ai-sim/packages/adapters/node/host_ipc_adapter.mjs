// Node game-host adapter for the *local child-process* Fear AI metadata IPC
// contract. The HTTP/WebSocket FearAIClient is a DIFFERENT transport and is
// intentionally not redirected through this child-only protocol.
import { fork } from 'node:child_process';
import {
    createAuthenticatedHostIpcGateway, createHostIpcCredential,
    makeAuthenticatedHostMessage
} from '../../core/src/AuthenticatedHostIpcGateway.mjs';

const BOOTSTRAP = 'FEAR_IPC_BOOTSTRAP_V1';
const parentSessions = new WeakMap();

export function spawnAuthenticatedHostChild(target, modulePath, {
    peerId, allowedEventTypes = [], allowedEntityIds = [],
    maxMessagesPerWindow = 32, windowMs = 1000,
    maxFrameBytes = 262144, maxBytesPerWindow = 1048576,
    onResult, maxPeers = 1
} = {}) {
    if (typeof modulePath !== 'string' || !modulePath)
        throw new Error('trusted child module path required');
    if (onResult !== undefined && typeof onResult !== 'function')
        throw new Error('invalid trusted child result handler');
    const previous = parentSessions.get(target);
    if (previous?.session && !previous.session.closed)
        throw new Error('authenticated host child already owns simulator');
    // Reuse the already sealed gateway after an owned child exits. Replacing
    // the gateway itself would require leaking a second ingress capability.
    const gateway = previous?.gateway ??
        createAuthenticatedHostIpcGateway(target, { maxPeers });
    const credential = createHostIpcCredential(); // always new, never persisted
    // No inherited Node inspector/debug flags, terminal or shared stdin.
    // The path is explicitly trusted and owned by this parent.
    const child = fork(modulePath, [], {
        execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true
    });
    const policy = { peerId, ...credential, allowedEventTypes, allowedEntityIds,
        maxMessagesPerWindow, windowMs, maxFrameBytes, maxBytesPerWindow };
    try {
        gateway.attachChildProcess(child, policy, { onResult });
    } catch (error) {
        child.kill();
        throw error;
    }
    let closed = false;
    const session = Object.freeze({
        child, gateway,
        get closed() { return closed; },
        close() {
            if (closed) return;
            closed = true;
            gateway.revokePeer(child);
            if (child.connected) child.disconnect();
            // Only kill the exclusively owned child handle we forked.
            if (child.exitCode === null && !child.killed) child.kill();
        }
    });
    child.once('exit', () => { closed = true; });
    child.once('disconnect', () => { closed = true; });
    parentSessions.set(target, {gateway, session});
    // Bootstrap is delivered only through this owned child process IPC.
    // Do not log credentials, pass them in argv or environment variables.
    try {
        if (!child.send({ kind: BOOTSTRAP, ...credential }))
            throw new Error('trusted child bootstrap backpressure');
    }
    catch (error) { session.close(); throw error; }
    return session;
}

// Child-side signer, bound once to its parent-controlled process channel.
// Caller supplies primitive JSON frames; no host objects are ever serialized.
export function createAuthenticatedHostSender(channel = process) {
    if (!channel || typeof channel.on !== 'function' ||
        typeof channel.send !== 'function')
        throw new Error('child IPC channel required');
    let credential = null, sequence = 0, closed = false;
    const onBootstrap = message => {
        if (!message || typeof message !== 'object' || message.kind !== BOOTSTRAP ||
            credential || closed) return;
        // Only an authorized, isolated host child should use this helper.
        if (typeof message.secret !== 'string' ||
            typeof message.sessionId !== 'string') return;
        credential = {secret: message.secret, sessionId: message.sessionId};
    };
    const onDisconnect = () => {
        closed = true;
        credential = null;
        channel.off('message', onBootstrap);
    };
    channel.on('message', onBootstrap);
    channel.once('disconnect', onDisconnect);
    return Object.freeze({
        get ready() { return credential !== null && !closed; },
        send(frame) {
            if (!credential || closed) throw new Error('host IPC not authenticated');
            // Advance only after producing a valid signed frame. If the
            // transport reports an ambiguous failure, do NOT blindly retry.
            const signed = makeAuthenticatedHostMessage({
                ...credential, frame, sequence: sequence + 1
            });
            // A false return means the message may already be queued, so its
            // sequence is consumed. Fail closed instead of resending it.
            sequence++;
            if (!channel.send(signed)) {
                onDisconnect();
                throw new Error('host IPC backpressure; establish new session');
            }
            return sequence;
        },
        close() {
            onDisconnect();
            if (typeof channel.disconnect === 'function' && channel.connected)
                channel.disconnect();
        }
    });
}
