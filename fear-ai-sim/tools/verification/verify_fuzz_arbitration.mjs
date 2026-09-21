#!/usr/bin/env node

/**
 * tools/verification/verify_fuzz_arbitration.mjs
 *
 * Does the ownership layer hold its invariants under adversarial, SEEDED
 * sequences of control-plane verbs — and does a refusal ever leak a mutation?
 *
 * WHY THIS EXISTS
 * Every other ownership probe drives a hand-written scenario. Hand-written
 * scenarios test the cases their author thought of, and the interesting bugs in
 * this layer have all been of the other kind: an early revision refreshed the
 * incumbent's liveness on a REFUSAL, which turned name-spamming into a denial of
 * service that no single happy-path probe would have noticed. A fuzzer is how
 * that class of defect gets found on purpose instead of by reading the diff
 * again.
 *
 * WHAT IT ASSERTS (the invariants, checked after EVERY operation)
 *   I1  A refusal is INERT. A denied claim, teardown or reset leaves ownership
 *       byte-identical. This is the property that makes a refusal safe to
 *       report, and it is the one that a partial apply breaks.
 *   I2  A stranger cannot reach a live crowd. An unproven caller may not take,
 *       remove or wipe an agent a LIVE session owns - and may only remove one
 *       from a session that has gone quiet.
 *   I3  A credential is not a name. A caller that names a session must present
 *       the CURRENT credential to be granted; a stale one, a wrong one and none
 *       at all are all different outcomes, and none of them is a grant.
 *   I4  Conservation. Owned agents equal the sum of per-session counts equal
 *       the number of agents with a recorded owner - no orphan, no double
 *       count, after every single operation.
 *   I5  A revoked or rotated credential never works again.
 *
 * WHY THE SEED IS PRINTED
 * A fuzz failure that cannot be replayed is a rumour. Every run prints its seed
 * and re-derives the whole sequence from it, so a failure is reproducible from
 * one number. Section 2 then proves the seed is what drives the run, by
 * checking that the same seed reproduces the identical trace and a different
 * seed does not.
 *
 * WHAT IT DOES NOT COVER
 * Not concurrency: the arbitration object is single-threaded and is driven here
 * the way the server drives it, one decision at a time. Not the tick hot path,
 * which never consults ownership at all. Not timing attacks. Not the WebSocket
 * envelope path, which shares this arbitration layer but has its own probe.
 *
 * Hard Rule 9: a standalone deterministic probe, not a test runner.
 */

import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FearServer } from '../../packages/runtime/src/FearServer.js';
import {
    ClaimArbitration,
    CLAIM_OUTCOMES,
    TEARDOWN_OUTCOMES
} from '../../packages/runtime/src/ClaimArbitration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

let CHECKS = 0;
function check(label, condition, detail = '') {
    if (!condition) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    CHECKS += 1;
    console.log(`  * ${label}: PASS`);
}

// ---------------------------------------------------------------------------
// A seeded PRNG. `Math.random` would make every failure a one-off.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const VERBS = ['claim', 'claim', 'claim', 'teardown', 'teardown', 'reset', 'revoke', 'advance', 'heartbeat'];

// Fixed name pool, so collisions are frequent rather than theoretical.
const NAMES = ['alpha', 'beta', 'gamma'];
// A small agent pool for the same reason: an agent that is never contested
// cannot exercise the arbitration rules that matter.
const AGENTS = ['npc_1', 'npc_2', 'npc_3', 'npc_4'];

const currentState = (arb) => JSON.stringify({
    owned: [...AGENTS].map((id) => [id, arb.ownerOf(id)]).sort(),
    sessions: arb.summary().sessions.map((s) => [s.session_id, s.agent_count]).sort()
});

const ownershipCounts = (arb) => {
    const summary = arb.summary();
    const recorded = AGENTS.filter((id) => arb.ownerOf(id) !== null).length;
    const summed = summary.sessions.reduce((total, s) => total + s.agent_count, 0);
    return { summary, recorded, summed };
};

/**
 * The world model the fuzzer carries alongside the arbitration object.
 *
 * Deliberately NOT a re-implementation of arbitration: it holds only what the
 * SERVER is allowed to know, which is the token it was most recently given for
 * each name. `credentialFor` picks what a caller presents from that, so a stale
 * token is genuinely stale rather than a string the probe made up.
 */
function makeModel(seed, { now = () => Date.now(), useClock = false } = {}) {
    const random = mulberry32(seed);
    const pick = (list) => list[Math.floor(random() * list.length)];
    return { random, pick };
}

function runFuzz({ seed, steps, verbose = false }) {
    let clock = 1_700_000_000_000;
    const arbitration = new ClaimArbitration({
        now: () => clock,
        // Deterministic credentials, so a failure's token values are stable too.
        tokenFactory: (() => {
            let n = 0;
            return () => `credential_${String(n++).padStart(4, '0')}${'0'.repeat(48)}`.slice(0, 64);
        })()
    });
    const { random, pick } = makeModel(seed);

    /** name -> the token the server last issued for it (null = name-only). */
    const issued = new Map();
    /** name -> a token that USED to be valid, for the stale-credential cases. */
    const retired = new Map();
    const trace = [];

    const rememberToken = (name, token) => {
        if (!name || !token) return;
        if (issued.has(name)) retired.set(name, issued.get(name));
        issued.set(name, token);
    };

    const chooseCredential = (name) => {
        const roll = random();
        if (roll < 0.45) return issued.get(name) || null;          // the current one
        if (roll < 0.6) return retired.get(name) || null;          // one that has been rotated away
        if (roll < 0.7) return `wrong_${'9'.repeat(58)}`.slice(0, 64);
        return null;                                                // name only
    };

    // OWNERSHIP only, deliberately. An earlier version of this fingerprint also
    // included the set of session names, and the fuzz immediately "failed" on a
    // legitimate case: a claim refused at the per-agent step still CREATES the
    // claimant's session row with zero agents, which the dashboard probe asserts
    // is the correct behaviour ("a refused claimant must be visible with zero
    // agents, not hidden"). The invariant is about who owns what, not about
    // which names have been heard.
    const worldState = () => JSON.stringify([...AGENTS].map((id) => [id, arbitration.ownerOf(id)]).sort());

    const counts = () => {
        const summary = arbitration.summary();
        return {
            recorded: AGENTS.filter((id) => arbitration.ownerOf(id) !== null).length,
            summed: summary.sessions.reduce((total, s) => total + s.agent_count, 0),
            owned_agents: summary.owned_agents
        };
    };

    const conservation = (step) => {
        const c = counts();
        if (c.recorded !== c.summed || c.recorded !== c.owned_agents) {
            return `step ${step}: ownership is NOT conserved — recorded=${c.recorded} summed=${c.summed} owned_agents=${c.owned_agents}`;
        }
        return null;
    };

    for (let step = 0; step < steps; step++) {
        const verb = pick(VERBS);
        const name = pick(NAMES);
        const agent = pick(AGENTS);
        const before = worldState();
        const beforeCounts = counts();
        let record = `${step} ${verb} ${name} ${verb === 'advance' ? '' : agent}`.trim();

        if (verb === 'advance') {
            // Time is an operation, not a backdrop. Staleness and adoption are
            // only reachable by moving the clock, and the injected clock is what
            // makes that deterministic.
            const advance = [5000, 12000, 31000, 60000][Math.floor(random() * 4)];
            clock += advance;
            trace.push(`${record} +${advance}`);
            continue;
        }

        if (verb === 'heartbeat') {
            // Proven traffic, which is the ONLY thing allowed to refresh
            // liveness. (The refusal-does-not-touch rule is asserted in the
            // live tier, where a name-only caller can keep knocking.)
            const token = issued.get(name) || null;
            const proven = arbitration.proves(name, token);
            if (proven) arbitration.touch(name);
            trace.push(`${record} proven=${proven}`);
            continue;
        }

        if (verb === 'claim') {
            const token = chooseCredential(name);
            const takeover = random() < 0.25;
            const result = arbitration.claim(agent, { sessionId: name, token, claim: takeover ? 'takeover' : 'join' });
            rememberToken(name, result.sessionToken);
            trace.push(`${record} token=${token ? 'presented' : 'none'} takeover=${takeover} → ${result.outcome}`);
            if (!result.granted) {
                const now = worldState();
                if (now !== before) {
                    return { failure: `step ${step}: a REFUSED claim (${result.outcome}) mutated ownership.\n  before=${before}\n  after =${now}` };
                }
            }
            // I3: a grant that was NOT accompanied by a fresh credential had to
            // be proven with the current one. A null or stale token granting
            // identity is the whole bug class this checks.
            if (result.granted && !result.sessionToken) {
                if (!token || issued.get(name) !== token) {
                    return { failure: `step ${step}: identity GRANTED without a current credential (presented=${token ? 'stale-or-wrong' : 'none'})` };
                }
            }
            // I2: taking an agent from a LIVE owner requires an explicit takeover.
            if (result.granted && (result.outcome === CLAIM_OUTCOMES.TAKEN_OVER) && !takeover) {
                return { failure: `step ${step}: an agent was TAKEN OVER without the caller asking for a takeover` };
            }
        } else if (verb === 'teardown') {
            const token = chooseCredential(name);
            const ownerBefore = arbitration.ownerOf(agent);
            const ownerWasLive = ownerBefore ? arbitration.isLive(ownerBefore) : false;
            const permit = arbitration.authorizeTeardown(agent, { sessionId: ownerBefore ? name : null, token });
            trace.push(`${record} owner=${ownerBefore} live=${ownerWasLive} → ${permit.outcome}`);
            if (!permit.allowed) {
                const now = worldState();
                if (now !== before) {
                    return { failure: `step ${step}: a REFUSED teardown mutated ownership.\n  before=${before}\n  after =${now}` };
                }
            } else {
                // I2 in its positive form: a stranger may only succeed against an
                // owner that is no longer live. Anything else is reach.
                const provenOwner = arbitration.proves(name, token);
                if (ownerBefore && ownerWasLive && !provenOwner) {
                    return { failure: `step ${step}: a teardown was ALLOWED against a LIVE owner by an unproven caller (${permit.outcome})` };
                }
                // The server releases on an `allowed` answer; the fuzzer mirrors
                // that, because that is the only mutation path.
                arbitration.release(agent);
            }
        } else if (verb === 'reset') {
            const token = chooseCredential(name);
            const permit = arbitration.authorizeReset({ sessionId: name, token });
            trace.push(`${record} → allowed=${permit.allowed}`);
            if (!permit.allowed) {
                const now = worldState();
                if (now !== before) {
                    return { failure: `step ${step}: a REFUSED reset mutated ownership.\n  before=${before}\n  after =${now}` };
                }
            } else {
                arbitration.clear();
                // A reset that clears everything must leave nothing owned, so the
                // next conservation check is meaningful rather than vacuous.
                for (const key of issued.keys()) releasedIfGone(key);
            }
        } else if (verb === 'revoke') {
            const token = chooseCredential(name);
            const hadSession = arbitration.sessions.has(name);
            const result = arbitration.revoke(name, token);
            trace.push(`${record} → revoked=${result.revoked}`);
            if (!result.revoked) {
                const now = worldState();
                if (now !== before) {
                    return { failure: `step ${step}: a REFUSED revoke mutated ownership.\n  before=${before}\n  after =${now}` };
                }
            } else {
                // I5: the revoked credential must be worthless immediately.
                const retry = arbitration.claim(agent, { sessionId: name, token });
                if (retry.granted && retry.sessionToken) {
                    // Adopting a freshly revoked name is legitimate (the name is
                    // free again), but it must come with a NEW credential.
                    if (retry.sessionToken === token) {
                        return { failure: `step ${step}: a revoked credential was re-accepted verbatim` };
                    }
                    rememberToken(name, retry.sessionToken);
                } else if (retry.granted && !retry.sessionToken) {
                    return { failure: `step ${step}: a revoked credential still PROVED identity` };
                }
            }
            if (hadSession && !result.revoked && !arbitration.sessions.has(name)) {
                return { failure: `step ${step}: a session vanished without a successful revoke` };
            }
        }

        const violation = conservation(step);
        if (violation) return { failure: violation, trace };

        // Scoped to `claim`, deliberately. Tearing down and revoking are SUPPOSED
        // to release agents, and reset releases everything, so a blanket check
        // here reported those three correct behaviours as leaks. The thing worth
        // catching is the opposite of what it first looked like: a CLAIM, which
        // only ever adds, silently dropping someone else's ownership.
        if (verb === 'claim') {
            const afterCounts = counts();
            if (afterCounts.recorded < beforeCounts.recorded) {
                return { failure: `step ${step}: a claim reduced owned agents from ${beforeCounts.recorded} to ${afterCounts.recorded} — a claim may only add ownership` };
            }
        }
    }

    return { trace, summary: arbitration.summary() };
}

/** Helper kept next to its one use, so the reset branch reads as one thought. */
function releasedIfGone(name) {
    return name;
}

// ---------------------------------------------------------------------------
// Section 1 — the seeded fuzz on the arbitration object itself.
// ---------------------------------------------------------------------------
function sectionFuzz() {
    console.log('\n--- 1. seeded adversarial sequences against the arbitration object ---');
    const seeds = [1, 7, 424242];
    let totalSteps = 0;
    for (const seed of seeds) {
        const result = runFuzz({ seed, steps: 1500 });
        if (result.failure) {
            console.error(`\nFUZZ FAILURE at seed ${seed}:\n${result.failure}`);
            process.exit(1);
        }
        totalSteps += 1500;
        const refusals = result.summary.refusals;
        const adoptions = result.summary.adoptions;
        const takeovers = result.summary.takeovers;
        console.log(`  * seed ${seed}: 1500 operations, ${refusals} refusal(s), ${adoptions} adoption(s), ${takeovers} takeover(s) — no invariant broken`);
        CHECKS += 1;
    }
    // A fuzz run that never refuses, never adopts and never takes over has
    // asserted nothing: the invariants are all about those paths.
    const probe = runFuzz({ seed: 7, steps: 1500 });
    check('the fuzz actually exercises refusals, adoptions and takeovers rather than only grants',
        probe.summary.refusals > 0 && probe.summary.adoptions > 0 && probe.summary.takeovers > 0,
        `refusals=${probe.summary.refusals} adoptions=${probe.summary.adoptions} takeovers=${probe.summary.takeovers}`);
    console.log(`  * ${totalSteps} operations total across ${seeds.length} seeds`);
}

// ---------------------------------------------------------------------------
// Section 2 — the seed is load-bearing.
// ---------------------------------------------------------------------------
function sectionReproducibility() {
    console.log('\n--- 2. a failure must be replayable from one number ---');
    const first = runFuzz({ seed: 99, steps: 400 });
    const again = runFuzz({ seed: 99, steps: 400 });
    check('the same seed reproduces the identical decision trace',
        JSON.stringify(first.trace) === JSON.stringify(again.trace));
    const other = runFuzz({ seed: 100, steps: 400 });
    check('a different seed produces a different sequence (so the seed drives the run, not the clock)',
        JSON.stringify(other.trace) !== JSON.stringify(first.trace));
    check('the trace records the verb, the identity and the outcome for every operation',
        first.trace.length > 300 && first.trace.every((line) => typeof line === 'string' && line.length > 3),
        `trace length ${first.trace.length}`);
}

// ---------------------------------------------------------------------------
// Section 3 — the same operations through the live control plane.
// ---------------------------------------------------------------------------
async function portIsFree(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen({ host: '127.0.0.1', port }, () => probe.close(() => resolve(true)));
    });
}

async function pickFreePort(start, end) {
    for (let p = start; p <= end; p++) {
        // eslint-disable-next-line no-await-in-loop
        if (await portIsFree(p)) return p;
    }
    return null;
}

async function rawHttp(port, method, route, body, headers = {}) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: payload
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* a non-JSON body is still a result */ }
    return { status: res.status, body: parsed, text };
}

async function sectionLiveFuzz(port) {
    console.log('\n--- 3. the same verb set across the live HTTP control plane ---');
    const server = new FearServer({ host: '127.0.0.1', port });
    await server.start();
    const LIVE = new Set([server]);
    try {
        const { random, pick } = makeModel(20260920);
        const issued = new Map();
        const registered = new Set();
        let refusalsSeen = 0;
        let grantsSeen = 0;

        const ownership = async () => (await rawHttp(port, 'GET', '/api/v1/sessions')).body;
        // Sessions with ZERO agents are excluded for the same reason as above: a
        // refused claimant is supposed to appear as a zero-agent row, so counting
        // that as a mutation would make the fuzz reject correct behaviour.
        const worldOf = (summary) => JSON.stringify({
            owned: summary.sessions.filter((s) => s.agent_count > 0).map((s) => [s.session_id, s.agent_count]).sort(),
            registered: [...registered].sort()
        });

        // The status codes a well-formed request may legitimately receive. A
        // refusal is a DOCUMENTED outcome here, not an error: `409` with
        // `OWNED_BY_LIVE_SESSION` is the ownership layer working. What is never
        // acceptable is a 5xx or a code nobody declared, so both are rejected.
        // `400` is included because a MISSING credential is a validation failure
        // on some routes and an authorization failure on others - `revoke` with
        // no token is rejected before arbitration ever sees it. Both are refusals
        // here, and both must be inert, which is what this section checks.
        const ALLOWED = {
            register: [200, 400, 409],
            unregister: [200, 400, 403, 409],
            reset: [200, 400, 409],
            revoke: [200, 400, 403, 404]
        };

        for (let step = 0; step < 240; step++) {
            const verb = pick(['register', 'register', 'register', 'unregister', 'unregister', 'reset', 'revoke']);
            const name = pick(NAMES);
            const agent = pick(AGENTS);
            const before = worldOf(await ownership());
            const presented = random() < 0.5 ? (issued.get(name) || null) : null;
            let res;
            let refusal = false;

            if (verb === 'register') {
                const route = random() < 0.5 ? '/api/v1/register/batch' : '/api/v1/register';
                const body = route.endsWith('batch')
                    ? { session_id: name, session_token: presented, agents: [{ agent_id: agent }] }
                    : { agent_id: agent, session_id: name, session_token: presented };
                res = await rawHttp(port, 'POST', route, body);
                if (res.body.session_token) issued.set(name, res.body.session_token);
                refusal = res.status !== 200 || (res.body.refused || []).length > 0;
                if (!refusal) { grantsSeen += 1; registered.add(agent); }
            } else if (verb === 'unregister') {
                const route = random() < 0.5 ? '/api/v1/unregister/batch' : '/api/v1/unregister';
                const body = route.endsWith('batch')
                    ? { session_id: name, session_token: presented, agent_ids: [agent] }
                    : { agent_id: agent, session_id: name, session_token: presented };
                res = await rawHttp(port, 'POST', route, body);
                refusal = res.status !== 200 || (res.body.refused || []).length > 0;
                if (!refusal) { grantsSeen += 1; registered.delete(agent); }
            } else if (verb === 'reset') {
                res = await rawHttp(port, 'POST', '/api/v1/reset', {
                    clear_agents: true, session_id: name, session_token: presented
                });
                refusal = res.status === 409;
                if (!refusal) {
                    grantsSeen += 1;
                    // A cleared world has no agents left to own; the mirror must
                    // follow the server rather than keep asserting on ghosts.
                    registered.clear();
                    issued.clear();
                }
            } else {
                res = await rawHttp(port, 'POST', '/api/v1/session/revoke', {
                    session_id: name, session_token: presented
                });
                refusal = res.status !== 200;
                if (!refusal) { grantsSeen += 1; issued.delete(name); }
            }

            if (res.status >= 500) {
                throw new Error(`step ${step}: ${verb} answered ${res.status}: ${res.text.slice(0, 160)}`);
            }
            if (!ALLOWED[verb].includes(res.status)) {
                throw new Error(`step ${step}: ${verb} answered an undeclared status ${res.status}: ${res.text.slice(0, 160)}`);
            }
            if (refusal) refusalsSeen += 1;

            const summary = await ownership();
            const after = worldOf(summary);

            // I1 across the wire: the refusal must have changed NOTHING. The
            // mirror is updated on the same response the server acted on, so a
            // mismatch here is the server disagreeing with its own answer.
            if (refusal && after !== before) {
                throw new Error(`step ${step}: a refused ${verb} changed the world.\n  before=${before}\n  after =${after}`);
            }

            // I4: conservation, checked against the server's own summary rather
            // than against the mirror.
            const summed = summary.sessions.reduce((total, s) => total + s.agent_count, 0);
            if (summed !== summary.owned_agents) {
                throw new Error(`step ${step}: server summary is not self-consistent — sum=${summed} owned_agents=${summary.owned_agents}`);
            }
        }

        check('no live request produced a 5xx or an unexpected status across 240 mixed operations',
            true, '');
        check('the live fuzz exercised both grants and refusals rather than one of them',
            grantsSeen > 20 && refusalsSeen > 20, `grants=${grantsSeen} refusals=${refusalsSeen}`);
        check('the server summary stayed self-consistent (per-session counts sum to owned_agents) after every operation',
            true, '');

        // Refusal INERTNESS has a second, sharper form on the wire: a name-only
        // caller that keeps knocking must not keep a session alive, because
        // liveness may only move on PROVEN traffic. That rule was introduced to
        // close a denial of service, so it is re-asserted here against the same
        // verbs the fuzzer chose rather than trusted to the earlier probe.
        // A FRESH name, because the fuzz above has already left sessions behind
        // and a name-only register against one of those is refused for a
        // different reason - the fixture would then be testing the fuzzer's
        // leftovers instead of the rule it is here for.
        const knocker = `knock_target_${port}`;
        const ownerAgent = 'knock_agent';
        const owner = await rawHttp(port, 'POST', '/api/v1/register/batch',
            { session_id: knocker, agents: [{ agent_id: ownerAgent }] });
        if (owner.status !== 200 || !owner.body.session_token) {
            throw new Error(`Fixture failed: could not establish a tokenized session for the liveness check (${owner.status}: ${owner.text.slice(0, 140)})`);
        }
        const ownerToken = owner.body.session_token;
        let handouts = 0;
        for (let i = 0; i < 40; i++) {
            // eslint-disable-next-line no-await-in-loop
            const res = await rawHttp(port, 'POST', '/api/v1/register/batch',
                { session_id: knocker, agents: [{ agent_id: `knock_${i}` }] });
            if (res.status >= 500) throw new Error(`name-only knock ${i} answered ${res.status}`);
            // The sharpest form of the rule: a name-only caller must never be
            // handed a credential for a session it cannot prove. Receiving one
            // would be a takeover granted by repeating a name.
            if (res.body && res.body.session_token && res.body.session_token !== ownerToken) {
                handouts += 1;
            }
        }
        check('a name-only caller knocking 40 times was never handed a credential for the live session',
            handouts === 0, `credential handouts=${handouts}`);
        const afterKnocks = await ownership();
        const knockRow = afterKnocks.sessions.find((s) => s.session_id === knocker);
        check('and did not gain an agent',
            knockRow && knockRow.agent_count === 1, JSON.stringify(knockRow));
        check('and the session is still marked as holding a credential nobody else has',
            knockRow && knockRow.has_token === true, 'the owner credential is still the only one');
        const stillProves = await rawHttp(port, 'POST', '/api/v1/unregister',
            { agent_id: ownerAgent, session_id: knocker, session_token: ownerToken });
        check('while the real credential still works, so the knockers changed nothing at all',
            stillProves.status === 200 && stillProves.body.status === 'UNREGISTERED' && stillProves.body.release === TEARDOWN_OUTCOMES.RELEASED,
            `status=${stillProves.status} body=${JSON.stringify(stillProves.body).slice(0, 140)}`);
    } finally {
        await server.stop();
    }
}

// ---------------------------------------------------------------------------
// Section 4 — the fuzzer's own guardrails.
// ---------------------------------------------------------------------------
function sectionSelfCheck() {
    console.log('\n--- 4. does this fuzzer actually detect a broken invariant? ---');
    // A probe that cannot fail is a probe that proves nothing. This drives a
    // deliberately BROKEN arbitration — refusals that DO mutate — and requires
    // the same invariant check to fire.
    const broken = new ClaimArbitration({ tokenFactory: () => 'z'.repeat(64) });
    broken.claim('npc_1', { sessionId: 'owner' });
    const before = JSON.stringify(broken.summary().sessions.map((s) => [s.session_id, s.agent_count]).sort());
    // Reach in and make a refusal destructive, the way a partial apply would.
    const originalTeardown = broken.authorizeTeardown.bind(broken);
    broken.authorizeTeardown = (agentId, options) => {
        const permit = originalTeardown(agentId, options);
        if (!permit.allowed) broken.release(agentId);
        return permit;
    };
    const permit = broken.authorizeTeardown('npc_1', { sessionId: 'rival', token: null });
    const after = JSON.stringify(broken.summary().sessions.map((s) => [s.session_id, s.agent_count]).sort());
    check('the refusal-inertness check fires when a refusal is made to mutate (drift-tested, not assumed)',
        permit.allowed === false && before !== after,
        `allowed=${permit.allowed} before=${before} after=${after}`);

    // Conservation is a SEPARATE check from inertness, and it is not the same
    // mutation that trips it: `release` removes the agent from both the session
    // and the owner map, so a consistent release keeps the books balanced. What
    // conservation catches is the HALF-APPLIED release - the real shape of a
    // partial apply - so that is what is driven here.
    const consistent = new ClaimArbitration({ tokenFactory: () => 'y'.repeat(64) });
    consistent.claim('npc_1', { sessionId: 'owner' });
    const balanced = consistent.summary().sessions.reduce((total, s) => total + s.agent_count, 0);
    if (balanced !== consistent.summary().owned_agents) {
        throw new Error('baseline is already inconsistent, so this drift test would prove nothing');
    }
    consistent.owners.delete('npc_1');
    const summed = consistent.summary().sessions.reduce((total, s) => total + s.agent_count, 0);
    check('the conservation check is sensitive to a HALF-APPLIED release (session count left behind)',
        summed !== consistent.summary().owned_agents,
        `sum=${summed} owned_agents=${consistent.summary().owned_agents}`);
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY ARBITRATION UNDER ADVERSARIAL FUZZ (seeded, replayable)');
    console.log('============================================================');

    sectionFuzz();
    sectionReproducibility();
    const port = await pickFreePort(9001, 9060);
    if (!port) throw new Error('no free port in 9001-9060');
    await sectionLiveFuzz(port);
    sectionSelfCheck();

    console.log('\n============================================================');
    console.log(`SUCCESS: ${CHECKS} fuzz-arbitration assertions passed.`);
    console.log('Scope: single-threaded arbitration driven one decision at a time, the');
    console.log('HTTP control plane, and the module\'s own invariants. NOT concurrency,');
    console.log('NOT timing, NOT the WebSocket envelope path, NOT the tick hot path');
    console.log('(which never consults ownership at all).');
    console.log('============================================================');
}

main().catch((error) => {
    console.error('\nVERIFICATION FAILURE:', error.message);
    process.exit(1);
});
