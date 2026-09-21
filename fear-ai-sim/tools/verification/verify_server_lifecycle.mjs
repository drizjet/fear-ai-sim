/**
 * tools/verification/verify_server_lifecycle.mjs
 *
 * Verifies focused runtime transport and lifecycle contracts without opening a
 * network listener or using a test runner:
 * 1. WebSocket validation rejects poisonous pacing values and clamps valid ones.
 * 2. WebSocket snapshot loading reports failure instead of acknowledging a bad snapshot.
 * 3. Agent unregister removes pending, cached, social, trauma, and contagion state.
 * 4. HTTP pacing uses the same finite-number boundary as the WebSocket path.
 * 5. Batch registration equals singular registration, rejects only what is
 *    malformed, refuses an over-limit batch instead of truncating it, and is
 *    reachable over both HTTP and the binary wire.
 * 6. Batch unregistration and batch trauma authoring follow the same
 *    discipline, including their own envelope limits and per-entry reporting.
 * 7. Session ownership arbitrates registration claims so a reconnecting host is
 *    recognised, a live owner is not displaced by a rival, and an anonymous
 *    caller's behaviour is byte-identical to before ownership existed.
 * 8. DESTRUCTION is ownership-gated too. Registration was arbitrated from the
 *    start while unregistration and reset were not, so any client could tear
 *    down any crowd; the gate is checked here on all three routes, over both
 *    transports, including that a refusal mutates nothing.
 * 9. The credential has a lifetime the host can end: expiry rotates rather than
 *    locks out, an explicit rotation retires the old token, and revocation ends
 *    a session on demand.
 *
 * Hard Rule 9 Compliant: standalone deterministic script; no automated test framework.
 */

import { FearServer } from '../../packages/runtime/src/FearServer.js';
import { ERROR_CODES, MESSAGE_TYPES } from '../../packages/protocol/index.js';
import { CLAIM_OUTCOMES, TEARDOWN_OUTCOMES } from '../../packages/runtime/src/ClaimArbitration.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeWs() {
    return {
        readyState: 1,
        bufferedAmount: 0,
        messages: [],
        send(payload) {
            this.messages.push(Buffer.isBuffer(payload) ? payload : JSON.parse(payload));
        },
        close() {}
    };
}

function latest(ws) {
    return ws.messages[ws.messages.length - 1];
}

function makeResponse() {
    return {
        status: null,
        body: null,
        writeHead(status) {
            this.status = status;
        },
        end(payload) {
            this.body = JSON.parse(payload);
        }
    };
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY FEAR SERVER LIFECYCLE & PROTOCOL GUARDS');
    console.log('============================================================\n');

    const server = new FearServer({ seed: 4242 });
    const ws = makeWs();

    console.log('--- Pacing input guards ---');
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.SET_PACING_OVERRIDE,
        intensity: { poisoned: true },
        message_id: 'bad-pacing'
    });
    const badPacing = latest(ws);
    assert(badPacing.type === MESSAGE_TYPES.ERROR_RESPONSE, 'invalid WebSocket pacing must return an error response.');
    assert(badPacing.code === ERROR_CODES.VALIDATION_FAILED, 'invalid WebSocket pacing must use VALIDATION_FAILED.');
    assert(badPacing.message_id === 'bad-pacing', 'pacing validation error must preserve correlation id.');
    assert(server.simulation.pacing.pacingOverride === null, 'invalid pacing must not poison the pacing override.');

    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.SET_PACING_OVERRIDE,
        intensity: 9.0,
        message_id: 'clamped-pacing'
    });
    assert(latest(ws).type === 'SET_PACING_OVERRIDE_ACK', 'valid WebSocket pacing must acknowledge.');
    assert(server.simulation.pacing.pacingOverride === 1.5, 'pacing override must clamp to the documented maximum.');

    const httpBadPacing = makeResponse();
    server._routeHttpPost('/api/v1/pacing', { intensity: 'not-a-number' }, httpBadPacing);
    assert(httpBadPacing.status === 400, 'invalid HTTP pacing must return 400.');
    assert(httpBadPacing.body.code === ERROR_CODES.VALIDATION_FAILED, 'invalid HTTP pacing must use VALIDATION_FAILED.');
    console.log('  * WebSocket and HTTP pacing guards: PASS');

    console.log('\n--- Registration, removal, and stale-state cleanup ---');
    for (const agentId of ['alpha', 'bravo']) {
        server._handleWsMessage(ws, {
            type: MESSAGE_TYPES.REGISTER_AGENT,
            agent_id: agentId,
            traits: { neuroticism: 0.6, resilience: 0.4 }
        });
    }
    assert(server.simulation.agents.size === 2, 'two agents should be registered.');

    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.OBSERVATION_DISPATCH,
        agent_id: 'alpha',
        threat_level: 0.9
    });
    server.simulation.lastContagion.set('alpha', { contagionFear: 0.8, leaderCalm: 0 });
    server.simulation.coreTrauma.agentRecords.set('alpha', { activeTraumas: [] });
    server.simulation.social.relationships.set('alpha', new Map([['bravo', { trust: -0.4 }]]));
    server.simulation.social.relationships.set('bravo', new Map([['alpha', { trust: -0.2 }]]));
    server.simulation.contagion.activeEdges = [{ from: 'alpha', to: 'bravo', strength: 0.7 }];

    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.UNREGISTER_AGENT,
        agent_id: 'alpha',
        message_id: 'remove-alpha'
    });
    assert(latest(ws).type === 'UNREGISTER_AGENT_ACK', 'unregister must acknowledge.');
    assert(!server.simulation.agents.has('alpha'), 'unregistered agent must leave the live agent map.');
    assert(!server.simulation.pendingObservations.has('alpha'), 'unregister must clear pending observations.');
    assert(!server.simulation.lastContagion.has('alpha'), 'unregister must clear cached contagion.');
    assert(!server.simulation.coreTrauma.agentRecords.has('alpha'), 'unregister must clear core-trauma records.');
    assert(!server.simulation.social.relationships.has('alpha'), 'unregister must clear outbound social state.');
    assert(!server.simulation.social.relationships.get('bravo')?.has('alpha'), 'unregister must clear inbound social state.');
    assert(server.simulation.contagion.activeEdges.length === 0, 'unregister must not expose stale contagion edges.');
    console.log('  * agent unregister cleanup across runtime subsystems: PASS');

    console.log('\n--- WebSocket snapshot result semantics ---');
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST,
        snapshot: { version: 3 },
        message_id: 'bad-snapshot'
    });
    const badSnapshot = latest(ws);
    assert(badSnapshot.type === MESSAGE_TYPES.ERROR_RESPONSE, 'unsupported WebSocket snapshot must return an error.');
    assert(badSnapshot.code === ERROR_CODES.SNAPSHOT_ERROR, 'snapshot failure must use SNAPSHOT_ERROR.');
    assert(badSnapshot.message_id === 'bad-snapshot', 'snapshot error must preserve correlation id.');

    const snapshot = server.simulation.saveSnapshot();
    server._handleWsMessage(ws, {
        type: MESSAGE_TYPES.LOAD_SNAPSHOT_REQUEST,
        snapshot,
        message_id: 'good-snapshot'
    });
    const goodSnapshot = latest(ws);
    assert(goodSnapshot.type === 'LOAD_SNAPSHOT_ACK', 'supported WebSocket snapshot must acknowledge.');
    assert(goodSnapshot.status === 'LOADED', 'supported WebSocket snapshot must report LOADED.');
    assert(goodSnapshot.message_id === 'good-snapshot', 'snapshot acknowledgement must preserve correlation id.');
    console.log('  * failed and successful WebSocket snapshot semantics: PASS');

    console.log('\n--- Batch agent registration ---');
    {
        // The singular path is the semantic reference: a batch must produce the
        // same agent as registering that entry on its own.
        const reference = new FearServer({ seed: 4242 });
        reference.simulation.registerAgent('ref_agent', { neuroticism: 0.7, fear: 0.2 }, {
            name: 'ref_agent',
            initial_position: { x: 3, y: 4, z: 0 }
        });
        const refSnapshot = reference.simulation.agents.get('ref_agent');

        const batchServer = new FearServer({ seed: 4242 });
        const batchRes = makeResponse();
        batchServer._routeHttpPost('/api/v1/register/batch', {
            agents: [{ agent_id: 'ref_agent', name: 'ref_agent', traits: { neuroticism: 0.7, fear: 0.2 }, initial_position: { x: 3, y: 4, z: 0 } }]
        }, batchRes);
        assert(batchRes.status === 200, 'a well-formed batch must return 200.');
        assert(batchRes.body.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'batch response must use the batch type.');
        assert(batchRes.body.status === 'REGISTERED', 'batch response must report REGISTERED.');
        assert(batchRes.body.count === 1, 'batch response count must reflect the registered agents.');
        assert(batchRes.body.registered[0] === 'ref_agent', 'batch response must list the registered ids.');
        assert(batchRes.body.rejected.length === 0, 'a clean batch must report no rejections.');

        const batched = batchServer.simulation.agents.get('ref_agent');
        assert(batched !== undefined, 'a batch-registered agent must exist in the live agent map.');
        assert(batched.traits.neuroticism === refSnapshot.traits.neuroticism, 'batch registration must apply traits like the singular path.');
        assert(batched.traits.fear === refSnapshot.traits.fear, 'batch registration must apply initial fear like the singular path.');
        assert(batched.x === refSnapshot.x && batched.y === refSnapshot.y && batched.z === refSnapshot.z,
            'batch registration must apply initial_position like the singular path.');

        // A crowd is the actual use case, and every member must be live and
        // individually addressable afterwards.
        const crowdServer = new FearServer({ seed: 4242 });
        const crowdRes = makeResponse();
        const crowd = Array.from({ length: 64 }, (_, i) => ({ agent_id: `npc_${i}`, traits: { neuroticism: 0.5 } }));
        crowdServer._routeHttpPost('/api/v1/register/batch', { agents: crowd }, crowdRes);
        assert(crowdRes.body.count === 64, 'a 64-agent batch must register all 64.');
        assert(crowdServer.simulation.agents.size === 64, 'every batch member must be a distinct live agent.');
        crowdServer.simulation.registerAgent('after_batch', {}, {});
        assert(crowdServer.simulation.agents.size === 65, 'singular registration must still work on a server that served a batch.');

        // Partial failure is reported per entry, not fatal: losing a whole crowd
        // to one bad trait is the failure mode this semantics avoids.
        const mixedRes = makeResponse();
        crowdServer._routeHttpPost('/api/v1/register/batch', {
            agents: [
                { agent_id: 'keep_1', traits: { neuroticism: 0.3 } },
                { agent_id: '' },
                { agent_id: 'keep_2' },
                { traits: { neuroticism: 0.1 } }
            ]
        }, mixedRes);
        assert(mixedRes.status === 200, 'a batch with malformed entries must still return 200.');
        assert(mixedRes.body.count === 2, 'valid batch entries must register even when siblings are malformed.');
        assert(mixedRes.body.rejected.length === 2, 'each malformed entry must be reported.');
        assert(mixedRes.body.rejected[0].index === 1, 'a rejection must carry the entry index for host correction.');
        assert(mixedRes.body.rejected[1].index === 3, 'every rejection must carry its own entry index.');
        assert(crowdServer.simulation.agents.has('keep_1') && crowdServer.simulation.agents.has('keep_2'),
            'valid batch entries must survive a partially-malformed batch.');

        // Duplicate ids inside one request must not register the same agent twice.
        const dupRes = makeResponse();
        crowdServer._routeHttpPost('/api/v1/register/batch', {
            agents: [{ agent_id: 'dup_agent', traits: { fear: 0.1 } }, { agent_id: 'dup_agent', traits: { fear: 0.9 } }]
        }, dupRes);
        assert(dupRes.body.count === 1, 'duplicate ids in one batch must collapse to one registration.');
        assert(crowdServer.simulation.agents.get('dup_agent').traits.fear === 0.9,
            'the last duplicate entry must win, matching last-write semantics.');

        // Envelope-level failures are the only fatal ones.
        for (const [label, body] of [
            ['missing agents array', {}],
            ['non-array agents', { agents: 'nope' }],
            ['empty agents', { agents: [] }],
            ['over-limit agents', { agents: Array.from({ length: 513 }, (_, i) => ({ agent_id: `o_${i}` })) }]
        ]) {
            const res = makeResponse();
            crowdServer._routeHttpPost('/api/v1/register/batch', body, res);
            assert(res.status === 400, `${label} must be rejected with 400.`);
            assert(res.body.code === ERROR_CODES.VALIDATION_FAILED, `${label} must use VALIDATION_FAILED.`);
        }
        assert(!crowdServer.simulation.agents.has('o_0'), 'an over-limit batch must not be partially applied.');

        // The binary wire carries the same verb, so a WebSocket-only client is
        // not forced back into one round trip per agent.
        const wireServer = new FearServer({ seed: 4242 });
        const wire = makeWs();
        wireServer._handleWsMessage(wire, {
            type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
            agents: [{ agent_id: 'wire_1' }, { agent_id: 'wire_2' }, { agent_id: 'wire_3' }],
            message_id: 'wire-batch'
        });
        const wireAck = latest(wire);
        assert(wireAck.type === MESSAGE_TYPES.REGISTER_AGENT_BATCH_RESPONSE, 'the binary wire must answer a batch with the batch response type.');
        assert(wireAck.count === 3, 'the binary wire batch must register every entry.');
        assert(wireAck.message_id === 'wire-batch', 'the binary wire batch must preserve the correlation id.');
        assert(wireServer.simulation.agents.size === 3, 'binary-wire batch members must be live agents.');

        const wireRejected = makeWs();
        wireServer._handleWsMessage(wireRejected, {
            type: MESSAGE_TYPES.REGISTER_AGENT_BATCH,
            agents: [],
            message_id: 'wire-batch-bad'
        });
        assert(latest(wireRejected).type === MESSAGE_TYPES.ERROR_RESPONSE, 'an unusable binary-wire batch must return an error.');
        assert(latest(wireRejected).message_id === 'wire-batch-bad', 'a rejected binary-wire batch must preserve the correlation id.');
        console.log('  * HTTP + binary-wire batch registration semantics: PASS');
    }

    console.log('\n--- Batch teardown and batch trauma authoring ---');
    {
        const server = new FearServer({ seed: 4242 });
        const ids = Array.from({ length: 40 }, (_, i) => `crowd_${i}`);
        const reg = makeResponse();
        server._routeHttpPost('/api/v1/register/batch', { agents: ids.map((agent_id) => ({ agent_id })) }, reg);
        assert(reg.body.count === 40, 'setup: 40 agents must register.');

        // NOT_FOUND is terminal, not an error: the caller wanted the agent gone
        // and it is gone either way. It is still reported separately, because a
        // client that could not distinguish it would requeue the id forever.
        const unreg = makeResponse();
        server._routeHttpPost('/api/v1/unregister/batch', {
            agent_ids: [...ids.slice(0, 35), 'never_existed', 'also_missing']
        }, unreg);
        assert(unreg.status === 200, 'batch unregistration must return 200.');
        assert(unreg.body.type === MESSAGE_TYPES.UNREGISTER_AGENT_BATCH_RESPONSE, 'batch unregistration must use its own response type.');
        assert(unreg.body.count === 35, 'batch unregistration must remove every registered id it was given.');
        assert(unreg.body.not_found.length === 2, 'unregistered-but-absent ids must be reported separately.');
        assert(server.simulation.agents.size === 5, 'only the unfetched agents must remain.');
        assert(!server.simulation.agents.has('crowd_0') && server.simulation.agents.has('crowd_39'),
            'batch unregistration must remove exactly the ids it was given.');

        // Duplicate ids are idempotent here: unregistering twice cannot mean
        // anything different from unregistering once.
        const dupUnreg = makeResponse();
        server._routeHttpPost('/api/v1/unregister/batch', { agent_ids: ['crowd_39', 'crowd_39', 'crowd_39'] }, dupUnreg);
        assert(dupUnreg.body.count === 1, 'a duplicated unregister id must collapse.');
        assert(dupUnreg.body.not_found.length === 0, 'a duplicated unregister id must not be reported missing.');

        for (const [label, body] of [
            ['missing agent_ids array', {}],
            ['non-array agent_ids', { agent_ids: 'nope' }],
            ['empty agent_ids', { agent_ids: [] }],
            ['over-limit agent_ids', { agent_ids: Array.from({ length: 513 }, (_, i) => `o_${i}`) }]
        ]) {
            const res = makeResponse();
            server._routeHttpPost('/api/v1/unregister/batch', body, res);
            assert(res.status === 400, `${label} must be rejected with 400.`);
            assert(res.body.code === ERROR_CODES.VALIDATION_FAILED, `${label} must use VALIDATION_FAILED.`);
        }

        // A batch whose every entry is malformed is still a per-ENTRY failure,
        // exactly as it is for registration: a 200 with count 0 and the
        // rejections enumerated, so the host can see what to fix. Reserving 400
        // for an unusable envelope is what makes that distinction meaningful.
        const allBad = makeResponse();
        server._routeHttpPost('/api/v1/unregister/batch', { agent_ids: ['   ', null] }, allBad);
        assert(allBad.status === 200, 'an all-malformed batch is a per-entry failure, not an envelope one.');
        assert(allBad.body.count === 0, 'an all-malformed batch must remove nothing.');
        assert(allBad.body.rejected.length === 2, 'every malformed entry must still be enumerated.');
        assert(allBad.body.rejected[0].index === 0, 'each rejection must carry its entry index.');

        // Trauma zones: independent world state, so a malformed zone is skipped
        // with its index while its valid siblings still apply. A settlement with
        // forty authored positions must not lose all of them to one typo.
        const trauma = makeResponse();
        server._routeHttpPost('/api/v1/trauma/batch', {
            zones: [
                { x: 10, y: 0, z: 0, intensity: 0.9, radius: 120, lifetimeTicks: 900 },
                { x: 20, y: 0 },
                { x: 'not-a-number', y: 0 },
                { x: 30, y: 0, intensity: 5 },
                { x: 40, y: 0, radius: -1 },
                { x: 50, y: 0, lifetimeTicks: 1.5 },
                { x: 60, y: 0 },
                { x: 70, y: 0 }
            ]
        }, trauma);
        assert(trauma.status === 200, 'batch trauma authoring must return 200.');
        assert(trauma.body.type === MESSAGE_TYPES.TRAUMA_ZONE_BATCH_RESPONSE, 'batch trauma must use its own response type.');
        assert(trauma.body.count === 4, 'every valid zone in a partially-malformed batch must still be authored.');
        assert(trauma.body.rejected.length === 4, 'each malformed zone must be reported.');
        assert(trauma.body.rejected[0].index === 2, 'a rejected zone must carry its index for host correction.');
        assert(trauma.body.zone_ids.length === 4, 'each authored zone must come back with its id.');
        assert(new Set(trauma.body.zone_ids).size === 4, 'authored zones must be distinct, not one id reused.');

        for (const [label, body] of [
            ['missing zones array', {}],
            ['non-array zones', { zones: 'nope' }],
            ['empty zones', { zones: [] }],
            ['over-limit zones', { zones: Array.from({ length: 513 }, () => ({ x: 1, y: 1 })) }]
        ]) {
            const res = makeResponse();
            server._routeHttpPost('/api/v1/trauma/batch', body, res);
            assert(res.status === 400, `${label} must be rejected with 400.`);
            assert(res.body.code === ERROR_CODES.VALIDATION_FAILED, `${label} must use VALIDATION_FAILED.`);
        }

        const allBadZones = makeResponse();
        server._routeHttpPost('/api/v1/trauma/batch', { zones: [{ y: 1 }, null, { x: 1 }] }, allBadZones);
        assert(allBadZones.status === 200, 'all-malformed zones are per-entry failures, not an envelope one.');
        assert(allBadZones.body.count === 0, 'no zone may be authored from an all-malformed batch.');
        assert(allBadZones.body.rejected.length === 3, 'each malformed zone must be enumerated.');

        // The binary wire carries unregister-batch and trauma-batch too, so a
        // WebSocket-only client is never forced back to one round trip per item.
        const wire = makeWs();
        server._handleWsMessage(wire, { type: MESSAGE_TYPES.TRAUMA_ZONE_BATCH, zones: [{ x: 1, y: 1 }, { x: 2, y: 2 }], message_id: 'wire-trauma' });
        assert(latest(wire).count === 2, 'the binary wire must author every zone in a batch.');
        assert(latest(wire).message_id === 'wire-trauma', 'the binary wire trauma batch must preserve the correlation id.');
        server._handleWsMessage(wire, { type: MESSAGE_TYPES.REGISTER_AGENT, agent_id: 'wire_agent' });
        assert(server.simulation.agents.has('wire_agent'), 'setup: the wire agent must register.');
        server._handleWsMessage(wire, { type: MESSAGE_TYPES.UNREGISTER_AGENT_BATCH, agent_ids: ['wire_agent', 'gone'], message_id: 'wire-unreg' });
        const wireUnreg = latest(wire);
        assert(wireUnreg.type === MESSAGE_TYPES.UNREGISTER_AGENT_BATCH_RESPONSE, 'the binary wire must answer unregister-batch with its own type.');
        assert(wireUnreg.count === 1, 'the binary wire unregister batch must remove the registered id.');
        assert(wireUnreg.not_found.length === 1, 'the binary wire unregister batch must report the missing id.');
        assert(wireUnreg.message_id === 'wire-unreg', 'the binary wire unregister batch must preserve the correlation id.');
        console.log('  * batch teardown and batch trauma authoring: PASS');
    }

    console.log('\n--- Session ownership and reconnect arbitration ---');
    {
        const server = new FearServer({ seed: 4242, sessionStalenessMs: 40 });
        const pop = (path, body) => {
            const res = makeResponse();
            server._routeHttpPost(path, body, res);
            return res;
        };

        // An anonymous caller records no ownership at all, which is exactly why
        // every host that shipped before sessions existed still behaves the same.
        const anon1 = pop('/api/v1/register', { agent_id: 'anon' });
        const anon2 = pop('/api/v1/register', { agent_id: 'anon' });
        assert(anon1.status === 200 && anon2.status === 200, 'anonymous re-registration must keep succeeding.');
        assert(anon1.body.claim === CLAIM_OUTCOMES.GRANTED && anon2.body.claim === CLAIM_OUTCOMES.GRANTED,
            'anonymous registration must always be granted.');
        assert(server.claims.active === false, 'anonymous callers must not create ownership records.');

        const a = pop('/api/v1/register/batch', { session_id: 'hostA', agents: [{ agent_id: 'npc_1' }, { agent_id: 'npc_2' }] });
        assert(a.body.count === 2, 'a session batch must register both agents.');
        assert(a.body.claims.every((c) => c.claim === CLAIM_OUTCOMES.GRANTED), 'unclaimed agents must be granted.');
        assert(server.claims.ownerOf('npc_1') === 'hostA', 'ownership must be recorded against the claiming session.');
        // A brand-new session is issued a credential, once. Without it the host
        // has only a name, and a name cannot prove anything.
        const hostAToken = a.body.session_token;
        assert(typeof hostAToken === 'string' && hostAToken.length === 64,
            'establishing a session must issue a 256-bit token.');
        assert(a.body.claim === CLAIM_OUTCOMES.GRANTED, 'a fresh session must be reported as a fresh grant.');
        assert(server.claims.summary().sessions.find((x) => x.session_id === 'hostA').has_token === true,
            'the session must be recorded as tokenized.');
        assert(!JSON.stringify(server.claims.summary()).includes(hostAToken),
            'the ownership summary must never expose the token itself.');

        // THE RECONNECT CASE: a matching token IS the identity, so a host coming
        // back does not have to win an argument - it does not even need to be
        // inside any liveness window.
        const again = pop('/api/v1/register/batch', {
            session_id: 'hostA', session_token: hostAToken, agents: [{ agent_id: 'npc_1' }]
        });
        assert(again.body.count === 1, 'a session must be able to re-claim its own agent with its token.');
        assert(again.body.claims[0].claim === CLAIM_OUTCOMES.GRANTED, 're-claiming an owned agent must be granted, not adopted.');
        assert(again.body.refused.length === 0, 'a session must never be refused its own agent.');
        assert(again.body.session_token === undefined || again.body.session_token === null,
            'a proven re-claim must not re-issue a token.');

        // THE GUESSING ATTACK, CLOSED: knowing a session's NAME is not enough to
        // act as it while it is live. This is the whole reason tokens exist.
        const nameOnly = pop('/api/v1/register/batch', { session_id: 'hostA', agents: [{ agent_id: 'npc_1' }] });
        assert(nameOnly.body.count === 0, 'a name-only claim must not register an agent a live session owns.');
        assert(nameOnly.body.refused[0].reason.includes('REQUIRES_TAKEOVER'),
            'a name-only claim against a live session must be refused with the takeover hint.');

        // A WRONG token is a distinct, reported failure rather than a silent
        // fall-through to name-only handling.
        const wrongToken = pop('/api/v1/register/batch', {
            session_id: 'hostA', session_token: 'f'.repeat(64), agents: [{ agent_id: 'npc_1' }]
        });
        assert(wrongToken.body.count === 0, 'a mismatched token must not register anything.');
        assert(wrongToken.body.refused[0].reason === CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH,
            'a mismatched token must be reported as a token mismatch.');
        assert(server.claims.summary().token_mismatches === 1, 'token mismatches must be counted.');

        // A rival that is not the owner must NOT get the agent, and nothing may
        // be mutated: no trait merge, no ownership change, no shadow copy.
        server.simulation.agents.get('npc_1').traits.fear = 0.42;
        const rival = pop('/api/v1/register/batch', {
            session_id: 'hostB',
            agents: [{ agent_id: 'npc_1', traits: { fear: 0.99 } }]
        });
        assert(rival.body.count === 0, 'a rival session must not register an agent a live session owns.');
        assert(rival.body.refused.length === 1, 'the refusal must be reported per entry.');
        assert(rival.body.refused[0].reason.includes('REFUSED_OWNED_BY_LIVE_SESSION'), 'the refusal must name the reason.');
        assert(rival.body.refused[0].owner_session_id === 'hostA', 'the refusal must name the current owner.');
        assert(server.simulation.agents.get('npc_1').traits.fear === 0.42,
            'a refused claim must not merge traits into the live agent.');
        assert(server.claims.ownerOf('npc_1') === 'hostA', 'a refused claim must not transfer ownership.');

        // The singular route refuses the same way, with a status a host can act on.
        const rivalSingle = pop('/api/v1/register', { agent_id: 'npc_1', session_id: 'hostB', traits: { fear: 0.99 } });
        assert(rivalSingle.status === 409, 'a refused singular claim must return 409, not 200 with a lie.');
        assert(rivalSingle.body.code === 'OWNED_BY_LIVE_SESSION', 'a refused singular claim must name the cause.');
        assert(server.simulation.agents.get('npc_1').traits.fear === 0.42, 'a refused singular claim must not mutate the agent either.');

        // Explicit takeover is the deliberate host-migration path.
        const takeover = pop('/api/v1/register/batch', {
            session_id: 'hostB',
            claim: 'takeover',
            agents: [{ agent_id: 'npc_1' }]
        });
        assert(takeover.body.count === 1, 'takeover must register the agent.');
        assert(takeover.body.claims[0].claim === CLAIM_OUTCOMES.TAKEN_OVER, 'takeover must be reported as such.');
        assert(server.claims.ownerOf('npc_1') === 'hostB', 'takeover must transfer ownership.');
        assert(server.simulation.agents.size === 3, 'takeover must not duplicate the agent.');

        // A dead owner's agents are adoptable by whoever asks - this is how a
        // restart that lost its in-memory session list gets its crowd back.
        const abandoned = new FearServer({ seed: 4242, sessionStalenessMs: 20 });
        const abandonedPop = (path, body) => {
            const res = makeResponse();
            abandoned._routeHttpPost(path, body, res);
            return res;
        };
        abandonedPop('/api/v1/register/batch', { session_id: 'oldHost', agents: [{ agent_id: 'orphan' }] });
        assert(abandoned.claims.ownerOf('orphan') === 'oldHost', 'setup: the old host must own the agent.');
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert(abandoned.claims.isLive('oldHost') === false, 'a session past its staleness window must not read as live.');
        const adopted = abandonedPop('/api/v1/register/batch', { session_id: 'newHost', agents: [{ agent_id: 'orphan' }] });
        assert(adopted.body.count === 1, 'a dead owner must not block a new host from adopting its agents.');
        assert(adopted.body.claims[0].claim === CLAIM_OUTCOMES.ADOPTED, 'adoption must be reported distinctly from a fresh claim.');
        assert(abandoned.claims.ownerOf('orphan') === 'newHost', 'adoption must transfer ownership.');
        assert(abandoned.simulation.agents.size === 1, 'adoption must not duplicate the agent.');
        assert(abandoned.simulation.agents.get('orphan') !== undefined, 'the adopted agent state must be preserved.');

        // Taking over a NAME must retire the incumbent's token. Otherwise a
        // displaced host could walk back in with the credential it was told to
        // stop using, and the takeover would mean nothing.
        const hostCToken = pop('/api/v1/register/batch', { session_id: 'hostC', agents: [{ agent_id: 'npc_3' }] }).body.session_token;
        const nameTakeover = pop('/api/v1/register/batch', {
            session_id: 'hostC', claim: 'takeover', agents: [{ agent_id: 'npc_4' }]
        });
        assert(nameTakeover.body.claim === CLAIM_OUTCOMES.TAKEN_OVER, 'taking over a live name must report a takeover.');
        const rotatedToken = nameTakeover.body.session_token;
        assert(typeof rotatedToken === 'string' && rotatedToken !== hostCToken,
            'taking over a name must issue a NEW token, not carry the incumbent\'s.');
        assert(server.claims.ownerOf('npc_3') === 'hostC', 'the taken-over session must keep its other agents.');
        const staleIncumbent = pop('/api/v1/register/batch', {
            session_id: 'hostC', session_token: hostCToken, agents: [{ agent_id: 'npc_3' }]
        });
        assert(staleIncumbent.body.count === 0, 'a retired token must not register anything.');
        assert(staleIncumbent.body.refused[0].reason === CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH,
            'a retired token must be reported as a mismatch.');
        const newIncumbent = pop('/api/v1/register/batch', {
            session_id: 'hostC', session_token: rotatedToken, agents: [{ agent_id: 'npc_3' }]
        });
        assert(newIncumbent.body.count === 1, 'the newly issued token must work.');

        // A reset that clears agents destroys every crowd on the server, so a
        // caller with no standing must not be able to do it while a host is live.
        const strangerReset = makeResponse();
        server._routeHttpPost('/api/v1/reset', { clear_agents: true }, strangerReset);
        assert(strangerReset.status === 409, 'a reset that clears a live session\'s agents must be refused.');
        assert(strangerReset.body.blocked_by.includes('hostC'),
            'a refused reset must name the session that is blocking it.');
        assert(server.claims.ownerOf('npc_4') === 'hostC', 'a refused reset must mutate nothing.');

        // Ownership must not outlive the agents it describes.
        const resetRes = makeResponse();
        server._routeHttpPost('/api/v1/reset', {
            clear_agents: true, session_id: 'hostC', session_token: rotatedToken
        }, resetRes);
        assert(resetRes.status === 200, 'the owning session must be able to clear its own world.');
        assert(server.claims.active === false, 'clearing agents must clear the ownership records with them.');
        const afterReset = pop('/api/v1/register/batch', { session_id: 'hostC', agents: [{ agent_id: 'npc_1' }] });
        assert(afterReset.body.count === 1, 'a fresh session must be able to claim an id freed by a reset.');
        assert(afterReset.body.claims[0].claim === CLAIM_OUTCOMES.GRANTED, 'a post-reset claim must be a fresh grant.');

        // Adoption rotates the token too, so the host that lost its session
        // cannot be shadowed by whoever held the previous credential.
        const adoptedHostToken = pop('/api/v1/register/batch', { session_id: 'rotHost', agents: [{ agent_id: 'rot_1' }] }).body.session_token;
        const rotServer = new FearServer({ seed: 4242, sessionStalenessMs: 1 });
        const rotPop = (path, body) => {
            const res = makeResponse();
            rotServer._routeHttpPost(path, body, res);
            return res;
        };
        const rotFirst = rotPop('/api/v1/register/batch', { session_id: 'rotHost', agents: [{ agent_id: 'rot_1' }] });
        await new Promise((resolve) => setTimeout(resolve, 25));
        const rotAdopt = rotPop('/api/v1/register/batch', { session_id: 'rotHost', agents: [{ agent_id: 'rot_1' }] });
        assert(rotAdopt.body.claim === CLAIM_OUTCOMES.ADOPTED, 're-claiming a dead name must report an adoption.');
        assert(rotAdopt.body.session_token !== rotFirst.body.session_token,
            'adoption must issue a NEW token, retiring the previous one.');
        const rotStale = rotPop('/api/v1/register/batch', {
            session_id: 'rotHost', session_token: rotFirst.body.session_token, agents: [{ agent_id: 'rot_1' }]
        });
        assert(rotStale.body.refused[0].reason === CLAIM_OUTCOMES.REFUSED_TOKEN_MISMATCH,
            'the retired token must be refused after an adoption.');
        assert(adoptedHostToken.length === 64, 'setup: tokens are 256-bit hex.');

        const summary = server.claims.summary();
        assert(summary.session_count >= 1, 'the ownership summary must list sessions.');
        assert(summary.takeovers >= 1, 'the summary must count takeovers.');
        assert(summary.refusals >= 2, 'the summary must count refusals.');
        console.log('  * session ownership and reconnect arbitration: PASS');
    }

    console.log('\n--- Destructive verbs are ownership-gated ---');
    {
        const gateServer = new FearServer({ seed: 4242, sessionStalenessMs: 30000 });
        const gatePost = (path, body) => {
            const res = makeResponse();
            gateServer._routeHttpPost(path, body, res);
            return res;
        };
        const mine = gatePost('/api/v1/register/batch', {
            session_id: 'owner', agents: [{ agent_id: 'owned_1' }, { agent_id: 'owned_2' }]
        }).body;
        assert(mine.count === 2, 'setup: the owning session registers its crowd.');
        const ownerToken = mine.session_token;

        // 1. A rival that never named a session used to be able to unregister
        //    anything. It may not touch a live session's agents.
        const rivalSingle = gatePost('/api/v1/unregister', { agent_id: 'owned_1' });
        assert(rivalSingle.status === 409, 'a stranger must not unregister a live session\'s agent.');
        assert(rivalSingle.body.owner_session_id === 'owner', 'the refusal must name the owner.');
        assert(rivalSingle.body.code === TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER, 'the refusal must be reported as a not-owner teardown.');
        assert(Number.isFinite(rivalSingle.body.retry_after_ms),
            'the refusal must carry a retry countdown when the blocker is not holding a socket.');
        assert(gateServer.simulation.agents.has('owned_1'), 'a refused teardown must leave the agent registered.');

        // 2. A rival that knows the NAME but not the token is still a rival.
        const rivalNamed = gatePost('/api/v1/unregister', { agent_id: 'owned_1', session_id: 'owner' });
        assert(rivalNamed.status === 409, 'naming the owner without the token must not authorize teardown.');
        assert(gateServer.claims.ownerOf('owned_1') === 'owner', 'a refused teardown must not release ownership.');

        // 3. Batch teardown reports the refusal per id and applies the rest.
        const mixed = gatePost('/api/v1/unregister/batch', {
            agent_ids: ['owned_1', 'owned_2', 'never_registered']
        });
        assert(mixed.body.count === 0, 'a stranger must not remove any owned agent in a batch.');
        assert(mixed.body.refused.length === 2, 'each refused id must be reported individually.');
        assert(mixed.body.refused.every((r) => r.owner_session_id === 'owner'), 'each refusal must name the owner.');
        assert(mixed.body.not_found.length === 1, 'an unowned id stays a terminal NOT_FOUND.');
        assert(gateServer.simulation.agents.size === 2, 'a refused batch must mutate nothing.');

        // 4. The same gate applies on the WebSocket wire: the transport must not
        //    decide who may destroy agent state.
        const gateWs = makeWs();
        gateServer._handleWsMessage(gateWs, { type: MESSAGE_TYPES.UNREGISTER_AGENT, agent_id: 'owned_1' });
        assert(latest(gateWs).status === 'REFUSED', 'the WebSocket unregister must be gated identically.');
        gateServer._handleWsMessage(gateWs, {
            type: MESSAGE_TYPES.UNREGISTER_AGENT_BATCH, agent_ids: ['owned_1', 'owned_2']
        });
        assert(latest(gateWs).refused.length === 2, 'the WebSocket batch unregister must report refusals per id.');
        assert(gateServer.simulation.agents.size === 2, 'a refused WebSocket batch must mutate nothing.');

        // 5. The owner, proving itself, may retire its own crowd.
        const mine2 = gatePost('/api/v1/unregister/batch', {
            agent_ids: ['owned_1', 'owned_2'], session_id: 'owner', session_token: ownerToken
        });
        assert(mine2.status === 200 && mine2.body.count === 2, 'the owning session must be able to retire its crowd.');
        assert(mine2.body.refused.length === 0, 'the owner must not be refused its own agents.');
        assert(gateServer.simulation.agents.size === 0, 'the owner\'s teardown must actually remove them.');

        // 6. An agent whose owner is gone is cleanup, not an attack: it is
        //    removed, and the release is reported distinctly.
        const abandoned = gatePost('/api/v1/register', { agent_id: 'abandoned_1', session_id: 'ghost' }).body;
        assert(typeof abandoned.session_token === 'string', 'setup: the ghost session gets a token.');
        const ghostServer = new FearServer({ seed: 4242, sessionStalenessMs: 1 });
        const ghostPost = (path, body) => {
            const res = makeResponse();
            ghostServer._routeHttpPost(path, body, res);
            return res;
        };
        ghostPost('/api/v1/register', { agent_id: 'abandoned_1', session_id: 'ghost' });
        await new Promise((resolve) => setTimeout(resolve, 25));
        const cleaned = ghostPost('/api/v1/unregister', { agent_id: 'abandoned_1' });
        assert(cleaned.status === 200, 'an agent whose owner is no longer live must be removable.');
        assert(cleaned.body.release === TEARDOWN_OUTCOMES.RELEASED_OWNER_STALE,
            'cleanup of a dead owner must be reported as a stale release, not a plain one.');
        assert(ghostServer.simulation.agents.size === 0, 'the stale release must actually remove the agent.');
        const gateSummary = ghostServer.claims.summary();
        assert(gateSummary.stale_owner_releases === 1, 'stale releases must be counted.');
        console.log('  * destructive verbs are ownership-gated: PASS');
    }

    console.log('\n--- Credential lifetime: rotation, expiry, revocation ---');
    {
        const credServer = new FearServer({ seed: 4242, sessionStalenessMs: 30000 });
        const credPost = (path, body) => {
            const res = makeResponse();
            credServer._routeHttpPost(path, body, res);
            return res;
        };
        const first = credPost('/api/v1/register', { agent_id: 'cred_1', session_id: 'credHost' }).body;
        const originalToken = first.session_token;
        assert(!first.token_rotated, 'establishing a session is not a rotation.');

        // 1. An explicit rotation retires the previous credential immediately.
        const rotated = credPost('/api/v1/register', {
            agent_id: 'cred_2', session_id: 'credHost', session_token: originalToken, rotate_token: true
        }).body;
        assert(rotated.token_rotated === true, 'a requested rotation must report itself.');
        assert(typeof rotated.session_token === 'string' && rotated.session_token !== originalToken,
            'a rotation must issue a different credential.');
        const withOld = credPost('/api/v1/register', {
            agent_id: 'cred_3', session_id: 'credHost', session_token: originalToken
        });
        assert(withOld.status === 409 && withOld.body.code === 'SESSION_TOKEN_MISMATCH',
            'the retired credential must stop working immediately.');
        const withNew = credPost('/api/v1/register', {
            agent_id: 'cred_3', session_id: 'credHost', session_token: rotated.session_token
        });
        assert(withNew.body.status === 'REGISTERED', 'the rotated credential must work.');

        // 2. Rotation must not be reachable without the credential it replaces.
        const stolenRotate = credPost('/api/v1/register', {
            agent_id: 'cred_4', session_id: 'credHost', session_token: 'not-the-token', rotate_token: true
        });
        assert(stolenRotate.status === 409, 'a wrong token must be refused even when a rotation is requested.');
        const stillValid = credPost('/api/v1/register', {
            agent_id: 'cred_4', session_id: 'credHost', session_token: rotated.session_token
        });
        assert(stillValid.body.status === 'REGISTERED',
            'a failed rotation attempt must leave the real credential working.');

        // 3. Expiry rotates rather than locks out. A host back after a long
        //    absence recovers instead of deadlocking against its own session.
        const expiring = new FearServer({ seed: 4242, sessionStalenessMs: 1, sessionTokenTtlMs: 1 });
        const expPost = (path, body) => {
            const res = makeResponse();
            expiring._routeHttpPost(path, body, res);
            return res;
        };
        const staleToken = expPost('/api/v1/register', { agent_id: 'exp_1', session_id: 'expHost' }).body.session_token;
        await new Promise((resolve) => setTimeout(resolve, 25));
        const afterTtl = expPost('/api/v1/register', {
            agent_id: 'exp_2', session_id: 'expHost', session_token: staleToken
        });
        assert(afterTtl.body.status === 'REGISTERED', 'an expired credential must not lock its own host out.');
        assert(afterTtl.body.token_expired === true, 'the expiry must be reported to the host.');
        assert(typeof afterTtl.body.session_token === 'string' && afterTtl.body.session_token !== staleToken,
            'an expired credential must be replaced in the same response.');
        assert(expiring.claims.summary().expired_credentials === 1, 'expired credentials must be counted.');

        // 4. Revocation ends a session on the host's own instruction, and only
        //    with the credential.
        const revServer = new FearServer({ seed: 4242, sessionStalenessMs: 30000 });
        const revPost = (path, body) => {
            const res = makeResponse();
            revServer._routeHttpPost(path, body, res);
            return res;
        };
        const revToken = revPost('/api/v1/register/batch', {
            session_id: 'revHost', agents: [{ agent_id: 'rev_1' }, { agent_id: 'rev_2' }]
        }).body.session_token;
        const wrongRevoke = revPost('/api/v1/session/revoke', { session_id: 'revHost', session_token: 'nope' });
        assert(wrongRevoke.status === 403, 'revocation without the credential must be refused.');
        assert(revServer.claims.ownerOf('rev_1') === 'revHost', 'a refused revocation must change nothing.');
        const missing = revPost('/api/v1/session/revoke', { session_id: 'no_such_host', session_token: revToken });
        assert(missing.status === 404, 'revoking an unknown session must be a 404, not a silent success.');
        assert(revPost('/api/v1/session/revoke', { session_id: 'revHost' }).status === 400,
            'a revocation with no credential must not even be a well-formed request.');
        const revoked = revPost('/api/v1/session/revoke', { session_id: 'revHost', session_token: revToken });
        assert(revoked.status === 200 && revoked.body.status === 'REVOKED', 'a proven revocation must succeed.');
        assert(revoked.body.released_count === 2, 'revocation must name the agents it released.');
        assert(revServer.claims.active === false, 'revocation must end ownership.');
        assert(revServer.simulation.agents.size === 2,
            'released agents stay REGISTERED: ownership ended, the host\'s crowd did not disappear.');
        const afterRevoke = revPost('/api/v1/register', { agent_id: 'rev_3', session_id: 'revHost' });
        assert(afterRevoke.body.claim === CLAIM_OUTCOMES.GRANTED,
            'a revoked name must be free for a fresh claim, not locked out.');
        assert(revServer.claims.summary().revocations === 1, 'revocations must be counted.');
        console.log('  * credential lifetime and revocation: PASS');
    }

    console.log('\n--- Refusal drill-down ---');
    {
        const drillServer = new FearServer({ seed: 4242, sessionStalenessMs: 30000 });
        const drillPost = (path, body) => {
            const res = makeResponse();
            drillServer._routeHttpPost(path, body, res);
            return res;
        };
        drillPost('/api/v1/register/batch', { session_id: 'holder', agents: [{ agent_id: 'contested' }] });
        drillPost('/api/v1/register', { agent_id: 'contested', session_id: 'challenger' });
        drillPost('/api/v1/unregister', { agent_id: 'contested' });
        const drill = drillServer.claims.summary();
        assert(drill.recent_refusals.length === 2, 'both a refused claim and a refused teardown must be explained.');
        const claimRecord = drill.recent_refusals.find((r) => r.verb === 'claim_agent');
        assert(claimRecord && claimRecord.agent_id === 'contested', 'a refused claim must name the agent.');
        assert(claimRecord.attempted_session_id === 'challenger', 'a refused claim must name who asked.');
        assert(claimRecord.blocked_by === 'holder', 'a refused claim must name the session that blocked it.');
        assert(Number.isFinite(claimRecord.retry_after_ms) && claimRecord.retry_after_ms <= 30000,
            'a refusal must say how long until the block lifts.');
        assert(drill.refusals_by_reason[CLAIM_OUTCOMES.REFUSED_OWNED_BY_LIVE_SESSION_REQUIRES_TAKEOVER] === 1,
            'refusals must be tallied by reason.');
        assert(drill.refusals_by_reason[TEARDOWN_OUTCOMES.REFUSED_NOT_OWNER] === 1,
            'teardown refusals must be tallied separately from claim refusals.');
        // Bounded, so a hostile client cannot turn the explanation into a leak.
        for (let i = 0; i < 60; i++) {
            drillPost('/api/v1/register', { agent_id: 'contested', session_id: `flood_${i}` });
        }
        assert(drillServer.claims.summary().recent_refusals.length <= 25,
            'the refusal log must be bounded regardless of how many are produced.');
        console.log('  * refusal drill-down: PASS');
    }

    console.log('\n--- Ownership across a middleware restart ---');
    {
        const post = (srv, path, body) => {
            const res = makeResponse();
            srv._routeHttpPost(path, body, res);
            return res;
        };

        // A live session, an agent with real fear state, then a save.
        const before = new FearServer({ seed: 4242, sessionStalenessMs: 5000 });
        const reg = post(before, '/api/v1/register/batch', {
            session_id: 'session-restart',
            agents: [
                { agent_id: 'r_1', traits: { fear: 0.4 } },
                { agent_id: 'r_2' },
                { agent_id: 'r_3' }
            ]
        });
        const token = reg.body.session_token;
        assert(typeof token === 'string' && token.length === 64, 'setup: the session must be issued a token.');
        post(before, '/api/v1/tick', {
            dt: 0.0166,
            observations: [{ agent_id: 'r_1', threats: [{ type: 'PREDATOR', distance: 3, intensity: 0.9 }] }]
        });
        const fearBefore = before.simulation.agents.get('r_1').currentFear;
        const snapshot = post(before, '/api/v1/save', {}).body.snapshot;

        assert(Array.isArray(snapshot.sessions) && snapshot.sessions.length === 1,
            'a snapshot must carry the ownership records.');
        assert(typeof snapshot.sessions[0].token_hash === 'string' && snapshot.sessions[0].token_hash.length === 64,
            'the snapshot must carry a token HASH.');
        // The decisive property: a snapshot is not a credential store.
        assert(!JSON.stringify(snapshot).includes(token),
            'a snapshot must never contain a plaintext session token.');
        assert(snapshot.sessions[0].agent_ids.sort().join(',') === 'r_1,r_2,r_3',
            'the snapshot must record which agents each session owns.');

        // A brand-new server stands in for a middleware restart: same process,
        // no in-memory continuity whatsoever.
        const after = new FearServer({ seed: 4242, sessionStalenessMs: 5000 });
        assert(after.claims.active === false, 'a fresh server must start with no ownership.');
        const loaded = post(after, '/api/v1/load', { snapshot });
        assert(loaded.status === 200, 'loading the snapshot must succeed.');
        assert(loaded.body.ownership.present === true && loaded.body.ownership.restored === 1,
            'the load must report the ownership it restored.');
        assert(loaded.body.ownership.agents === 3, 'every owned agent must be attributed after reload.');
        assert(after.claims.ownerOf('r_1') === 'session-restart', 'ownership must survive the restart.');
        assert(after.simulation.agents.size === 3, 'the reload must restore the agents themselves.');
        assert(Math.abs(after.simulation.agents.get('r_1').currentFear - fearBefore) < 1e-9,
            'affective state must survive the restart alongside ownership.');

        // A restored session must NOT read as live on the strength of a
        // timestamp taken in the previous process, or it would refuse the very
        // host it belongs to.
        const restoredView = after.claims.summary().sessions.find((x) => x.session_id === 'session-restart');
        assert(restoredView.live === false, 'a restored session must not read as live before it reconnects.');
        assert(restoredView.observed_this_process === false, 'a restored session must be marked unobserved.');
        assert(restoredView.has_token === true, 'the restored session must still be tokenized.');

        // Rule 1 across a restart: the host that kept its token is recognised
        // immediately and unconditionally. This is the whole point of persisting
        // ownership - a restart is not a reason to lose the crowd.
        const reclaim = post(after, '/api/v1/register/batch', {
            session_id: 'session-restart', session_token: token,
            agents: [{ agent_id: 'r_1' }, { agent_id: 'r_2' }]
        });
        assert(reclaim.body.count === 2, 'a token must be recognised after a restart.');
        assert(reclaim.body.claim === CLAIM_OUTCOMES.GRANTED, 'a post-restart token claim must be a plain grant.');
        assert(reclaim.body.refused.length === 0, 'a post-restart token claim must not be refused.');
        assert(after.simulation.agents.size === 3, 're-claiming after a restart must not duplicate agents.');

        // Rule 3 across a restart: a host that LOST its token falls back to
        // adoption, which works because a restored session is never live.
        const afterLost = new FearServer({ seed: 4242, sessionStalenessMs: 5000 });
        post(afterLost, '/api/v1/load', { snapshot });
        const adoptedAfterRestart = post(afterLost, '/api/v1/register/batch', {
            session_id: 'session-restart', agents: [{ agent_id: 'r_1' }]
        });
        assert(adoptedAfterRestart.body.count === 1, 'a tokenless host must recover its crowd after a restart.');
        assert(adoptedAfterRestart.body.claim === CLAIM_OUTCOMES.ADOPTED,
            'the tokenless post-restart path must be reported as an adoption.');
        assert(typeof adoptedAfterRestart.body.session_token === 'string',
            'an adoption must issue a replacement token.');
        assert(afterLost.claims.summary().adoptions >= 1, 'the adoption must be counted.');

        // Backward compatibility: every snapshot written before ownership was
        // persisted has no `sessions` field and must load exactly as it used to.
        const legacySnapshot = { ...snapshot };
        delete legacySnapshot.sessions;
        const afterLegacy = new FearServer({ seed: 4242 });
        const legacyLoad = post(afterLegacy, '/api/v1/load', { snapshot: legacySnapshot });
        assert(legacyLoad.status === 200, 'a snapshot without ownership must still load.');
        assert(legacyLoad.body.ownership.present === false, 'the load must report that no ownership was present.');
        assert(afterLegacy.simulation.agents.size === 3, 'a legacy snapshot must restore its agents.');
        assert(afterLegacy.claims.active === false, 'a legacy snapshot must leave ownership inactive.');

        // Ownership recorded for an agent the snapshot did NOT restore would
        // refuse a later host its own id, so it is filtered out.
        const trimmed = {
            ...snapshot,
            sessions: [{ ...snapshot.sessions[0], agent_ids: ['r_1', 'ghost_agent'] }]
        };
        const afterTrimmed = new FearServer({ seed: 4242, sessionStalenessMs: 5000 });
        post(afterTrimmed, '/api/v1/load', { snapshot: trimmed });
        assert(afterTrimmed.claims.ownerOf('ghost_agent') === null,
            'ownership for an agent the snapshot did not restore must be dropped.');
        assert(afterTrimmed.claims.ownerOf('r_1') === 'session-restart',
            'ownership for an agent that WAS restored must be kept.');
        const ghostClaim = post(afterTrimmed, '/api/v1/register/batch', {
            session_id: 'other', agents: [{ agent_id: 'ghost_agent' }]
        });
        assert(ghostClaim.body.count === 1, 'a dropped ownership record must not block a fresh claim.');

        // A load replaces the world, so it must replace ownership too: keeping
        // the previous owner map would describe agents that no longer exist.
        const ownerBeforeLoad = after.claims.ownerOf('r_1');
        assert(ownerBeforeLoad === 'session-restart', 'setup: the loaded server owns r_1.');
        const otherSnapshot = { ...snapshot, sessions: [{ session_id: 'replacement', token_hash: null, agent_ids: ['r_2'] }] };
        post(after, '/api/v1/load', { snapshot: otherSnapshot });
        assert(after.claims.ownerOf('r_1') === null, 'a load must clear ownership the new snapshot does not describe.');
        assert(after.claims.ownerOf('r_2') === 'replacement', 'a load must install the ownership it does describe.');
        console.log('  * ownership across a middleware restart: PASS');
    }

    console.log('\n============================================================');
    console.log('SUCCESS: Fear Server lifecycle and protocol verification passed.');
    console.log('============================================================\n');
}

main().catch((error) => {
    console.error('VERIFICATION FAILURE:', error);
    process.exit(1);
});
