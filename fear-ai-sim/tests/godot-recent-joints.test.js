import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    ContagionGraph,
    GoalArbitrationEngine,
    GOAL_TYPES,
    CollectiveCourageHarness,
    SuccessionEngine,
    BlockadeEngine,
    EconomicFeedbackSystem,
    ScarcityPressureHarness,
    COMMODITY_TYPES,
    InformationPropagationEngine,
    AnticipatoryFearEngine,
    SecurityDilemmaHarness,
} from '../packages/core/index.js';
import {
    ProtocolValidator,
    BinaryWireProtocol,
} from '../packages/protocol/index.js';

// NEXT-155 through NEXT-161 Godot station coverage (post-25 audit candidate 22).
//
// Integration surface (measured, not assumed): the Godot station is
// packages/adapters/godot/ (fear_ai_client.gd + fear_agent.gd + fear_types.gd),
// speaking the canonical JSON protocol and Binary Wire Protocol v2 through the
// Fear AI middleware server. The .gd client forwards position / threat /
// health / energy observations only. The NEXT-155..161 opt-in fields
// (trustGain, calmTrustGain, memoryLoad, identityWeight, traumaLoad, peer
// trust) are server-side JS computations the adapter serializes as payload
// fields — they are NOT binary wire slots.
//
// Measured wire behavior pinned below:
//   - JSON transport (JSON.stringify, the adapter's real JSON encode path)
//     carries every opt-in field bit-exactly.
//   - ProtocolValidator.validateObservation sanitizes observations to a fixed
//     allowlist and DROPS all six opt-in fields.
//   - BinaryWireProtocol v2 records are fixed 32-byte slots and DROP all six
//     opt-in fields by design (health/energy quantized u16, clamped).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GODOT_DIR = path.join(__dirname, '..', 'packages', 'adapters', 'godot');

const OPT_IN_OBS = {
    agent_id: 'agent_7',
    x: 1.5,
    y: -2.25,
    z: 0,
    trust: 0.7,
    trustGain: 0.6,
    calmTrustGain: 0.6,
    traumaLoad: 0.5,
    memoryLoad: 0.25,
    identityWeight: 1,
};

const FOCAL = { id: 'focal', x: 0, y: 0, traits: { extraversion: 0.5, neuroticism: 0.5 } };
const panicker = (id, trust) => ({
    id, x: 10, y: 0, isPanicking: true,
    ...(trust === undefined ? {} : { trust }),
});

function arbitrateWinner(fear, ctx) {
    const arb = new GoalArbitrationEngine();
    arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.5 });
    arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
    return arb.arbitrate('g', { fear }, ctx || {}).winningGoal;
}

describe('Godot station surface: NEXT-155..161 joints ride the real adapter paths', () => {
    it('1. Godot adapter exists at packages/adapters/godot with client, agent, types', () => {
        for (const f of ['fear_ai_client.gd', 'fear_agent.gd', 'fear_types.gd']) {
            expect(fs.existsSync(path.join(GODOT_DIR, f))).toBe(true);
        }
        const client = fs.readFileSync(path.join(GODOT_DIR, 'fear_ai_client.gd'), 'utf8');
        // The .gd binary encoder forwards exactly the v2 slot set.
        expect(client).toMatch('threat_distance');
        expect(client).toMatch('RECORD_SIZE_BYTES');
    });

    it('2. JSON encode path carries every opt-in field bit-exactly', () => {
        const payload = { type: 'BATCH_TICK_REQUEST', dt: 0.016, observations: [OPT_IN_OBS] };
        const back = JSON.parse(JSON.stringify(payload)).observations[0];
        expect(back.trust).toBe(0.7);
        expect(back.trustGain).toBe(0.6);
        expect(back.calmTrustGain).toBe(0.6);
        expect(back.traumaLoad).toBe(0.5);
        expect(back.memoryLoad).toBe(0.25);
        expect(back.identityWeight).toBe(1);
        expect(back.x).toBe(1.5);
    });

    it('3. MEASURED GAP: server-side validator sanitizer drops all six opt-in fields', () => {
        const v = ProtocolValidator.validateObservation(OPT_IN_OBS);
        expect(v.valid).toBe(true);
        expect(Object.keys(v.value).sort()).toEqual(
            ['agent_id', 'energy', 'health', 'inSafeHaven', 'obstacleAhead',
                'obstaclePresent', 'sounds', 'threats', 'velocity', 'x', 'y', 'z'].sort()
        );
        for (const field of ['trust', 'trustGain', 'calmTrustGain', 'traumaLoad', 'memoryLoad', 'identityWeight']) {
            expect(v.value[field]).toBe(undefined);
        }
        // Wire-carried fields survive the same sanitizer untouched.
        expect(v.value.x).toBe(1.5);
        expect(v.value.agent_id).toBe('agent_7');
    });

    it('4. MEASURED GAP: binary wire v2 drops opt-in fields by design (fixed 32-byte slots)', () => {
        const buf = BinaryWireProtocol.encodeObservationBatch(7, [{
            entityId: 7,
            position: { x: 1.5, y: -2.25, z: 0 },
            threatDistance: 4,
            threatIntensity: 0.9,
            health: 0.8,
            energy: 0.5,
            trust: 0.7,
            traumaLoad: 0.5,
            memoryLoad: 0.25,
            identityWeight: 1,
            trustGain: 0.6,
            calmTrustGain: 0.6,
        }]);
        const dec = BinaryWireProtocol.decodeObservationBatch(buf);
        expect(dec.tick).toBe(7);
        const rec = dec.records[0];
        for (const field of ['trust', 'trustGain', 'calmTrustGain', 'traumaLoad', 'memoryLoad', 'identityWeight']) {
            expect(rec[field]).toBe(undefined);
        }
        // Carried slots decode exactly: position float32, health u16.
        expect(rec.position.x).toBe(1.5);
        expect(rec.health).toBe(0.8);
        expect(rec.energy).toBe(0.5);
        expect(rec.threatDistance).toBe(4);
    });

    it('5. Binary wire clamps health/energy instead of corrupting (measured)', () => {
        const dec = BinaryWireProtocol.decodeObservationBatch(
            BinaryWireProtocol.encodeObservationBatch(1, [{ entityId: 2, health: 5, energy: -3 }])
        );
        expect(dec.records[0].health).toBe(1);
        expect(dec.records[0].energy).toBe(0);
    });

    it('6. Cross-runtime parity: JSON-round-tripped context arbitrates the identical winner', () => {
        // Server-side equivalent of the Godot round trip: the context the
        // station forwards as JSON fields reaches arbitration bit-identical.
        const ctx = { traumaLoad: 0.5, memoryLoad: 0.25, identityWeight: 0 };
        const direct = arbitrateWinner(0.516, ctx);
        const viaWire = arbitrateWinner(0.516, JSON.parse(JSON.stringify(ctx)));
        expect(direct).toBe(GOAL_TYPES.HOLD_POST);
        expect(viaWire).toBe(direct);
    });

    it('7. Binary-path fallback equals the legacy default (context cannot travel in v2 slots)', () => {
        // What the server arbitrates when the station uses the binary wire:
        // no trauma/memory context arrives, so the winner is the legacy one.
        expect(arbitrateWinner(0.516, {})).toBe(GOAL_TYPES.HOLD_POST);
        expect(arbitrateWinner(0.516, { traumaLoad: 0.5 })).toBe(arbitrateWinner(0.516, {}));
    });

    it('8. Malformed adapter payloads degrade safely, never throw into the sim', () => {
        // Batch tick: bad dt falls back, non-array observations empty out,
        // observations without agent_id are dropped individually. Always valid.
        expect(ProtocolValidator.validateBatchTick(
            { type: 'BATCH_TICK_REQUEST', dt: -5, observations: 'nope' }).value
        ).toEqual({ type: 'BATCH_TICK_REQUEST', dt: 0.0166, observations: [] });
        const mixed = ProtocolValidator.validateBatchTick({
            type: 'BATCH_TICK_REQUEST',
            observations: [{ agent_id: 'ok', x: 1 }, { x: 2 }, null],
        });
        expect(mixed.valid).toBe(true);
        expect(mixed.value.observations.map((o) => o.agent_id)).toEqual(['ok']);
        expect(ProtocolValidator.validateObservation({ x: 1 }).valid).toBe(false);
        expect(ProtocolValidator.validateIncomingMessage(null).valid).toBe(false);
        // Truncated binary frames throw a safe typed error, not silent corruption.
        expect(() => BinaryWireProtocol.decodeObservationBatch(new ArrayBuffer(5))).toThrow(/Invalid binary wire frame/);
        // Malformed peer trust reads as neutral inside the joint itself.
        const c = new ContagionGraph({ trustGain: 0.6 });
        const neutral = c.evaluateContagion(FOCAL, [panicker('p', 0)]).contagionFear;
        for (const bad of [NaN, Infinity, 'high', null]) {
            expect(c.evaluateContagion(FOCAL, [panicker('p', bad)]).contagionFear).toBe(neutral);
        }
    });
});

describe('Godot station exact replay: NEXT-155..161 pinned numbers', () => {
    it('NEXT-155 peer-trust contagion replays exactly (neutral 0.261, x1.3 / x0.7)', () => {
        const run = () => {
            const c = new ContagionGraph({ trustGain: 0.6 });
            return {
                neutral: c.evaluateContagion(FOCAL, [panicker('p', 0)]).contagionFear,
                trusted: c.evaluateContagion(FOCAL, [panicker('p', 1)]).contagionFear,
                distrusted: c.evaluateContagion(FOCAL, [panicker('p', -1)]).contagionFear,
            };
        };
        const a = run();
        expect(run()).toEqual(a);
        expect(a.neutral).toBe(0.261);
        expect(a.trusted).toBeCloseTo(a.neutral * 1.3, 10);
        expect(a.distrusted).toBeCloseTo(a.neutral * 0.7, 10);
        // Calm-trust gain mirrors the same ratios on the leader path.
        const calm = (trust) => ({ id: 'L', x: 10, y: 0, fearBand: 'CALM', leadership: 0.8, trust });
        const cc = new ContagionGraph({ calmTrustGain: 0.6 });
        const n = cc.evaluateContagion(FOCAL, [calm(0)]).leaderCalm;
        expect(n).toBe(0.2688);
        expect(cc.evaluateContagion(FOCAL, [calm(1)]).leaderCalm).toBeCloseTo(n * 1.3, 10);
        expect(cc.evaluateContagion(FOCAL, [calm(-1)]).leaderCalm).toBeCloseTo(n * 0.7, 10);
    });

    it('NEXT-156 crossover ladder replays exactly (0.45/load-0 flips once at 0.7)', () => {
        const sweep = (dutyP, load) => {
            const arb = new GoalArbitrationEngine();
            arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: dutyP });
            arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
            const seq = [];
            for (let f = 0; f <= 1.0001; f += 0.05) {
                seq.push(arb.arbitrate('g', { fear: f }, { traumaLoad: load }).winningGoal);
            }
            const firstS = seq.indexOf(GOAL_TYPES.SURVIVE);
            return {
                flips: seq.slice(1).filter((w, i) => w !== seq[i]).length,
                firstS: firstS < 0 ? Infinity : Math.round(firstS * 0.05 * 100) / 100,
                seq,
            };
        };
        const a = sweep(0.45, 0);
        const b = sweep(0.3, 1);
        expect(sweep(0.45, 0).seq).toEqual(a.seq);
        expect(a.flips).toBe(1);
        expect(a.firstS).toBe(0.7);
        expect(b.flips).toBe(1);
        expect(b.firstS).toBe(0.05);
    });

    it('NEXT-157 courage joint replays exactly (holds, finalFear 0.516, 7/7 duty)', () => {
        const joint = () => {
            const h = new CollectiveCourageHarness();
            const rep = h.runSequence({ members: 8, casualtyOrder: ['member_0'], leaderPresent: true, baseFear: 0.45 });
            const arb = new GoalArbitrationEngine();
            let duty = 0;
            for (let m = 0; m < rep.survivors; m++) {
                const id = 'sq' + m;
                arb.registerGoal(id, { type: GOAL_TYPES.HOLD_POST, priority: 0.5 });
                arb.registerGoal(id, { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
                if (arb.arbitrate(id, { fear: rep.finalFear }).winningGoal === GOAL_TYPES.HOLD_POST) duty++;
            }
            return { holdsDuty: rep.holdsDuty, finalFear: rep.finalFear, survivors: rep.survivors, duty };
        };
        const a = joint();
        expect(joint()).toEqual(a);
        expect(a.holdsDuty).toBe(true);
        expect(a.finalFear).toBe(0.516);
        expect(a.survivors).toBe(7);
        expect(a.duty).toBe(7);
    });

    it('NEXT-158 succession identity replays exactly (legacy 0.02/0/0.085, rally 0.155/0.0675)', () => {
        const run = () => {
            const e = new SuccessionEngine();
            const base = (cands, extra = {}) => ({
                factionId: 'f1', cause: 'NATURAL_DEATH', archetype: 'DEFAULT', candidates: cands, ...extra,
            });
            const HEIR = { id: 'heir', legitimacy: 0.7, competence: 0.7, popularity: 0.7, continuity: 0.7 };
            return {
                legacy: e.resolve(base([HEIR])),
                hi: e.resolve(base([{ ...HEIR, traits: { leadership: 0.95 } }], { identityWeight: 1 })),
            };
        };
        const a = run();
        expect(run().hi).toEqual(a.hi);
        expect(a.legacy.cohesionDelta).toBe(0.02);
        expect(a.legacy.moraleDelta).toBeCloseTo(0, 10);
        expect(a.legacy.splinterRisk).toBe(0.085);
        expect(a.hi.successorId).toBe('heir');
        expect(a.hi.cohesionDelta).toBe(0.155);
        expect(a.hi.moraleDelta).toBe(0.0675);
        expect(a.hi.splinterRisk).toBeLessThan(a.legacy.splinterRisk);
    });

    it('NEXT-159 blockade morale chain replays exactly (STABLE vs CRITICAL, unrest 0.0833)', () => {
        const FOOD = COMMODITY_TYPES.FOOD;
        const siege = (blockaded) => {
            const eng = new BlockadeEngine();
            const econ = new EconomicFeedbackSystem();
            const sc = new ScarcityPressureHarness();
            econ.registerSettlementMarket('producer', { population: 10, production: { food: 50 } });
            econ.registerSettlementMarket('city', { population: 50, production: { food: 0 } });
            const id = blockaded ? eng.declare('attacker', 'city', ['corridor_1'], { commitment: 1.0 }) : null;
            for (let t = 0; t < 60; t++) {
                const allowed = blockaded ? (eng.throttleTable()['corridor_1'] ?? 1) : 1;
                econ.recordTradeTransaction('producer', 'city', FOOD, 3.0 * allowed);
                econ.tick(1);
                eng.advanceTick(1);
                if (blockaded) eng.recommit(id, 1.0);
            }
            return { pressure: sc.score(econ, 'city'), advisory: id ? eng.assess(id).advisory : null };
        };
        const open = siege(false);
        const held = siege(true);
        expect(siege(true).pressure).toEqual(held.pressure);
        expect(open.pressure.advisory).toBe('STABLE');
        expect(open.pressure.unrestMorale).toBe(1);
        expect(held.pressure.advisory).toBe('CRITICAL_MIGRATE_OR_AID');
        expect(held.pressure.unrestMorale).toBeCloseTo(0.0833, 4);
        expect(held.advisory).toBe('STRANGLEHOLD');
    });

    it('NEXT-160 dilemma verdicts replay exactly (hearsay dread 0.6855, SPIRAL peak 0.8714)', () => {
        const climate = () => {
            const net = new InformationPropagationEngine({}, 2026);
            net.registerAgent('alarmist', 0.8);
            net.registerAgent('east', 0.5);
            net.addListenEdge('east', 'alarmist');
            const fear = new AnticipatoryFearEngine({}, { neuroticism: 0.5, resilience: 0.5 });
            const rumorId = net.injectRumor('APPROACHING_ARMY', 'Army marching', 'alarmist', { confidence: 0.85 });
            for (let t = 0; t < 6; t++) {
                net.advanceTick();
                for (const held of net.heldBy('east')) {
                    if (held.rumorId === rumorId) {
                        fear.absorb('FACTION', 'invading_army', { confidence: held.confidence, observed: false, threatLevel: 0.9 });
                    }
                }
                fear.advanceTick();
            }
            return fear.dreadOf('FACTION', 'invading_army');
        };
        const dread = climate();
        expect(climate()).toBe(dread);
        expect(dread).toBe(0.6855);
        const dil = new SecurityDilemmaHarness();
        const cfg = {
            fearA: 0.4 + dread * 0.5, fearB: 0.4 + dread * 0.5,
            misperceptionA: 0.4 + dread * 0.3, misperceptionB: 0.4 + dread * 0.3,
        };
        const out = dil.run(cfg);
        expect(dil.run(cfg)).toEqual(out);
        expect(out.verdict).toBe('SPIRAL');
        expect(out.peakA).toBe(0.8714);
        const quiet = dil.run({ fearA: 0.4, fearB: 0.4, misperceptionA: 0.4, misperceptionB: 0.4 });
        expect(quiet.verdict).toBe('STABLE_DETERRENCE');
    });

    it('NEXT-161 no-flap bound replays exactly (360 cells, at most one flip)', () => {
        const duties = [
            GOAL_TYPES.HOLD_POST, GOAL_TYPES.PROTECT_ALLY, GOAL_TYPES.AID_VICTIM,
            GOAL_TYPES.ESCORT_CARAVAN, GOAL_TYPES.REACH_SAFETY,
        ];
        let cells = 0;
        let maxFlips = 0;
        for (const duty of duties) {
            for (const dp of [0.2, 0.45, 0.6, 0.8]) {
                for (const load of [0, 0.5, 1]) {
                    for (const bond of [0, 0.5, 1]) {
                        for (const iw of [false, true]) {
                            const arb = new GoalArbitrationEngine();
                            arb.registerGoal('g', { type: duty, priority: dp });
                            arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
                            const ctx = {
                                traumaLoad: load,
                                allyBond: bond,
                                allyBondWeight: bond > 0 ? 1 : 0,
                                identityWeight: iw ? 1 : 0,
                                identityTendencies: iw
                                    ? { flee: 0.9, stand: 0.1, help: 0.1, rally: 0.1 }
                                    : undefined,
                            };
                            const seq = [];
                            for (let f = 0; f <= 1.0001; f += 0.05) {
                                seq.push(arb.arbitrate('g', { fear: f }, ctx).winningGoal);
                            }
                            const flips = seq.slice(1).filter((w, i) => w !== seq[i]).length;
                            maxFlips = Math.max(maxFlips, flips);
                            expect(flips).toBeLessThanOrEqual(1);
                            cells++;
                        }
                    }
                }
            }
        }
        expect(cells).toBe(360);
        expect(maxFlips).toBeLessThanOrEqual(1);
    });
});
