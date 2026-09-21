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
 * 5. PER-CONNECTION OWNERSHIP, which is the part state continuity alone could
 *    not answer. Two live sockets, two session ids, one crowd:
 *      - the owner's batch registration binds the session to its socket;
 *      - the same session re-claiming its own agent is never a conflict;
 *      - a rival may register unowned agents and ONLY those, and a refused
 *        claim mutates nothing (no trait merge, no ownership change, no
 *        duplicate or shadow agent);
 *      - when the owner's socket dies, its agents AND its ownership survive,
 *        the session reads `attached: false` in `/api/v1/sessions`, and the
 *        agents are still not adoptable while the owner is inside its liveness
 *        window;
 *      - the owner returning on a NEW socket with the SAME session id gets its
 *        crowd back with state preserved, no duplication, and a working tick;
 *      - `claim: "takeover"` deliberately displaces a LIVE owner and is counted
 *        as such, and batch teardown releases ownership with the agent so the
 *        freed id is normally claimable again.
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

async function waitFor(predicate, label, timeoutMs = 1500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${label}.`);
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

        // ------------------------------------------------------------------
        // Per-connection ownership across a real reconnect.
        //
        // The suite above proves server-scoped STATE continuity. This proves
        // IDENTITY continuity: that the server can tell the host coming back
        // from a rival host claiming the same crowd, over a real socket, and
        // that the answer is deterministic rather than whoever asked last.
        // ------------------------------------------------------------------
        console.log('--- per-connection ownership across reconnect: start');
        // Baseline agent count, so "did not duplicate" is asserted against the
        // real starting population rather than a hardcoded number that would
        // drift with the rest of the suite.
        const agentBaseline = server.simulation.agents.size;
        const owner = await connect(url);
        const intruder = await connect(url);
        try {
            await request(owner, {
                type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '1.0.0',
                client_id: 'host-a', session_id: 'hostA', message_id: 'oa-h'
            }, (m) => m.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'owner handshake');

            const owned = await request(owner, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostA',
                agents: [{ agent_id: 'owned_1', traits: { fear: 0.2 } }, { agent_id: 'owned_2' }],
                message_id: 'oa-r'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'owner batch registration');
            assert(owned.count === 2, 'a session batch over the wire must register every agent.');
            // The credential that makes this host recognisable rather than merely
            // nameable. Everything below that recognises the host uses it.
            const hostAToken = owned.session_token;
            assert(typeof hostAToken === 'string' && hostAToken.length === 64,
                'establishing a session over the wire must issue a token.');
            assert(server.claims.ownerOf('owned_1') === 'hostA', 'the socket must be attributable to the session that claimed them.');
            // The bound connection is the SERVER-side handle, not this client
            // object, so it is asserted by identity against the server's own set.
            const boundSocket = server.claims.sessions.get('hostA').connection;
            assert(boundSocket !== null && boundSocket !== undefined,
                'a live session must be bound to the socket that named it.');
            assert(server.connectedClients.has(boundSocket),
                'the bound socket must be one the server actually has open.');

            // An idempotent re-register is not a conflict: the token still proves
            // it is the same host.
            const reclaim = await request(owner, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostA', session_token: hostAToken,
                agents: [{ agent_id: 'owned_1' }], message_id: 'oa-r2'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'owner re-claim');
            assert(reclaim.count === 1, 'a session must be able to re-claim its own agent.');
            assert(reclaim.refused.length === 0, 'a session must never be refused its own agent.');

            // KNOWING THE NAME IS NOT ENOUGH. This is the guessing attack the
            // name-only model allowed, asserted closed over a real socket.
            const guessByName = await request(intruder, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostA', agents: [{ agent_id: 'owned_2' }], message_id: 'ob-guess'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'name-guessing attempt');
            assert(guessByName.count === 0, 'a guessed session name must not register an agent a live session owns.');
            assert(guessByName.refused.length === 1, 'the guessed claim must be refused per entry.');
            assert(server.claims.ownerOf('owned_2') === 'hostA', 'a guessed claim must not transfer ownership.');

            // A wrong token is reported as a mismatch rather than falling back
            // to name-only handling.
            const wrongToken = await request(intruder, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostA', session_token: 'a'.repeat(64),
                agents: [{ agent_id: 'owned_2' }], message_id: 'ob-wrong'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'wrong-token attempt');
            assert(wrongToken.count === 0, 'a mismatched token must not register anything.');
            assert(wrongToken.refused[0].reason.includes('TOKEN_MISMATCH'),
                'a mismatched token must be reported as a mismatch.');

            // A rival on its own live socket does NOT get the crowd, and nothing
            // about the agent is mutated by the attempt.
            await request(intruder, {
                type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '1.0.0',
                client_id: 'host-b', session_id: 'hostB', message_id: 'ob-h'
            }, (m) => m.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'intruder handshake');
            server.simulation.agents.get('owned_1').traits.fear = 0.42;
            const refused = await request(intruder, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostB',
                agents: [{ agent_id: 'owned_1', traits: { fear: 0.99 } }, { agent_id: 'owned_3' }],
                message_id: 'ob-r'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'intruder batch registration');
            // hostB is a name of its own, so it is established and gets its own
            // credential; it is not borrowing hostA's identity.
            const hostBToken = refused.session_token;
            assert(typeof hostBToken === 'string' && hostBToken !== hostAToken,
                'a different session must receive a different token.');
            assert(refused.count === 1, 'a rival may register the agents nobody owns, and only those.');
            assert(refused.registered.includes('owned_3'), 'the unowned agent must go to the rival.');
            assert(refused.refused.length === 1, 'the owned agent must be refused, per entry.');
            assert(refused.refused[0].owner_session_id === 'hostA', 'the refusal must name the live owner.');
            assert(server.simulation.agents.get('owned_1').traits.fear === 0.42,
                'a refused claim must not merge traits into the live owner\'s agent.');
            assert(server.claims.ownerOf('owned_1') === 'hostA', 'a refused claim must not transfer ownership.');
            assert(server.simulation.agents.size === agentBaseline + 3,
                'refusal must not create a duplicate or shadow agent.');
            console.log('--- rival host over a real socket is refused: PASS');

            // THE ABANDONED-CONNECTION CASE. The owner's socket dies. Its agents
            // must survive, its ownership must survive, and the session must read
            // as detached - but not yet adoptable, because its own reconnect has
            // not had a chance to happen.
            await closeSocket(owner);
            // The server's own close handler runs independently of this client's
            // close event, so detachment is awaited rather than assumed.
            await waitFor(() => server.connectedClients.has(boundSocket) === false,
                'the closed socket to leave the server\'s client set');
            await waitFor(() => server.claims.sessions.get('hostA').connection === null,
                'the session to detach from the closed socket');
            assert(server.simulation.agents.has('owned_1'), 'a dropped owner socket must preserve its agents.');
            assert(server.claims.ownerOf('owned_1') === 'hostA', 'a dropped owner socket must preserve ownership.');
            assert(server.claims.sessions.get('hostA').connection === null, 'a dropped socket must detach the session.');
            assert(server.claims.sessions.get('hostA').detachedAt !== null, 'a detached session must record when it detached.');
            const summaryMid = server.claims.summary();
            const hostA = summaryMid.sessions.find((s) => s.session_id === 'hostA');
            assert(hostA.attached === false, 'the sessions view must show the abandoned connection as detached.');
            assert(hostA.agent_count === 2, 'the abandoned session must still be credited with its agents.');

            // A rival still cannot take them while the owner is within its
            // liveness window: a brief drop is not an invitation.
            const grabWhileWarm = await request(intruder, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostB', session_token: hostBToken,
                agents: [{ agent_id: 'owned_1' }], message_id: 'ob-r2'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'warm-grab attempt');
            assert(grabWhileWarm.refused.length === 1, 'a briefly-dropped owner must still hold its agents.');
            console.log('--- abandoned connection preserves state and ownership: PASS');

            // The owner comes back on a NEW socket with the SAME session id and
            // re-adopts its crowd outright. This is the reconnect contract.
            const returning = await connect(url);
            try {
                await request(returning, {
                    type: MESSAGE_TYPES.HANDSHAKE_REQUEST, protocol_version: '1.0.0',
                    client_id: 'host-a', session_id: 'hostA', message_id: 'oa-h2'
                }, (m) => m.type === MESSAGE_TYPES.HANDSHAKE_RESPONSE, 'returning handshake');
                const readopt = await request(returning, {
                    type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                    session_id: 'hostA', session_token: hostAToken,
                    agents: [{ agent_id: 'owned_1' }, { agent_id: 'owned_2' }],
                    message_id: 'oa-r3'
                }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'returning re-adopt');
                assert(readopt.count === 2, 'the returning host must get both of its agents back.');
                assert(readopt.refused.length === 0, 'the returning host must not be refused its own crowd.');
                assert(server.claims.ownerOf('owned_1') === 'hostA', 'the returning host must still own its agents.');
                assert(server.simulation.agents.get('owned_1').traits.fear === 0.42,
                    're-adoption must preserve agent state, not reset it.');
                const reboundSocket = server.claims.sessions.get('hostA').connection;
                assert(reboundSocket !== null && reboundSocket !== boundSocket,
                    'the session must rebind to the new socket, not the dead one.');
                assert(server.connectedClients.has(reboundSocket),
                    'the rebound socket must be one the server has open.');
                assert(server.simulation.agents.size === agentBaseline + 3,
                    're-adoption must not duplicate any agent.');

                // And the returned host can keep working: a tick still reaches
                // its agents, so ownership is not a lock on the data plane.
                const postReconnectTick = await request(returning, {
                    type: MESSAGE_TYPES.BATCH_TICK_REQUEST,
                    dt: 0.0166, session_id: 'hostA',
                    observations: [{ agent_id: 'owned_2', threats: [{ type: 'PREDATOR', distance: 4, intensity: 0.8 }] }],
                    message_id: 't3'
                }, (m) => m.type === MESSAGE_TYPES.BATCH_TICK_RESPONSE, 'post-reconnect tick');
                assert(postReconnectTick.results.some((r) => r.agent_id === 'owned_2'),
                    'a reconnected host must still receive advisories for its agents.');
                console.log('--- reconnect re-adopts the same crowd without duplication: PASS');
            } finally {
                await closeSocket(returning);
            }

            // Explicit takeover is how a host DELIBERATELY migrates while the
            // other one is still connected, and it must be visible as such.
            const migrated = await request(intruder, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostB', session_token: hostBToken, claim: 'takeover',
                agents: [{ agent_id: 'owned_1' }], message_id: 'ob-r3'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'takeover');
            assert(migrated.count === 1, 'an explicit takeover must register the agent.');
            assert(server.claims.ownerOf('owned_1') === 'hostB', 'an explicit takeover must transfer ownership.');
            assert(server.simulation.agents.size === agentBaseline + 3, 'a takeover must not duplicate the agent.');
            const summary = server.claims.summary();
            assert(summary.takeovers === 1, 'the summary must record the takeover.');
            // Two refusals happened above: the rival's first attempt, and its
            // attempt while the owner was briefly dropped.
            assert(summary.refusals >= 2, 'the summary must record every refusal.');

            // Batch teardown releases ownership with the agent, so a later host
            // can claim the freed id normally rather than being refused. Intent
            // is stated explicitly here so the setup does not depend on how the
            // takeover above happens to leave `intruder`'s queue.
            const retired = await request(intruder, {
                type: MESSAGE_TYPES.UNREGISTER_AGENT_BATCH,
                session_id: 'hostB', session_token: hostBToken,
                agent_ids: ['owned_1', 'not_there'], message_id: 'ob-u'
            }, (m) => m.type === MESSAGE_TYPES.UNREGISTER_AGENT_BATCH_RESPONSE, 'batch unregister');
            assert(retired.count === 1, 'batch teardown must remove the registered agent.');
            assert(retired.not_found.length === 1, 'batch teardown must report the absent id separately.');
            assert(server.claims.ownerOf('owned_1') === null, 'teardown must release ownership with the agent.');
            assert(!server.simulation.agents.has('owned_1'), 'teardown must remove the agent from simulation state.');
            const reclaimed = await request(intruder, {
                type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
                session_id: 'hostB', session_token: hostBToken,
                agents: [{ agent_id: 'owned_1' }], message_id: 'ob-r4'
            }, (m) => m.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'reclaim freed id');
            assert(reclaimed.count === 1, 'a freed id must be claimable again.');
            assert(reclaimed.refused.length === 0, 'a freed id must not need a takeover.');
            assert(reclaimed.session_token === undefined || reclaimed.session_token === null,
                'a proven session must not be re-issued a token.');
            console.log('--- explicit takeover, teardown, and ownership release: PASS');
        } finally {
            await closeSocket(intruder);
        }
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
