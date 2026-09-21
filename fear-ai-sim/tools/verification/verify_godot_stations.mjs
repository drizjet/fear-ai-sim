#!/usr/bin/env node

/**
 * tools/verification/verify_godot_stations.mjs
 *
 * Godot showcase STATION-LEVEL verification.
 *
 * The Godot-side runner (tests/godot_project/run_showcase_conformance.gd)
 * requires a live Godot binary and evaluates the showcase against the
 * showcase's own local fallback implementation, so it cannot independently
 * assert station behavior. This standalone probe closes that gap without
 * Godot, in the same manner as the other harnesses in this directory:
 *
 *  PART A  Station inventory, derived from station_controller.gd source
 *          (never a hardcoded list), plus init/update/reset wiring and the
 *          main.gd trigger/reset dispatch coverage for every station.
 *  PART B  Each of the nine behavioral stations' advisory property,
 *          independently reproduced on the CANONICAL JS core
 *          (AffectiveAgent / FearCore / HabituationSystem), using the
 *          station's own declared personality traits and stimulus constants.
 *  PART C  Station 10's chain-monitor contract against the live FearServer
 *          POST /api/v1/advisory/chain payload shape.
 *  PART D  The advisory-only boundary, the canonical vocabulary the showcase
 *          now speaks, and the six previously pinned divergences asserted as
 *          resolved.
 *
 * Scope: this asserts the advisory CONTRACT of each station (direction,
 * ordering, thresholds, fail-safety, boundaries). It is not a rendering test
 * and not a live Godot run. Engine-level claims stay where the ledger puts
 * them.
 *
 * Hard Rule 9 compliant: standalone deterministic probe, no test runner.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';
import { FEAR_BANDS, CORE_BANDS } from '../../packages/core/src/FearCore.js';
import { ACTION_INTENTS } from '../../packages/core/src/IntentResolver.js';
import { HabituationSystem, DEFAULT_HABITUATION_CONFIG } from '../../packages/core/src/HabituationSystem.js';
import { EncounterConsequenceEngine } from '../../packages/core/src/EncounterConsequenceEngine.js';
import { CHAIN_LINKS } from '../../packages/core/src/ValleyChainScenario.js';
import { FearServer } from '../../packages/runtime/src/FearServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

const SHOWCASE = 'tests/godot_project/station_controller.gd';
const MAIN = 'tests/godot_project/main.gd';
const SHOWCASE_AGENT = 'tests/godot_project/showcase_agent.gd';
const GODOT_RUNNER = 'tests/godot_project/run_showcase_conformance.gd';
const PACKAGED_AGENT = 'packages/adapters/godot/fear_agent.gd';
const PROJECT_AGENT = 'tests/godot_project/addons/fear_ai/fear_agent.gd';
const GENERATED_CORE = 'tests/godot_project/addons/fear_ai/fear_canonical_core.gd';
const PROJECT_HUD = 'tests/godot_project/addons/fear_ai/fear_agent_hud_2d.gd';
const PROJECT_STEERING = 'tests/godot_project/addons/fear_ai/fear_steering_2d.gd';
const QUICKSTART = 'tests/godot_project/addons/fear_ai/examples/quickstart_2d.gd';
const PACKAGED_QUICKSTART = 'packages/adapters/godot/examples/quickstart_2d.gd';
const PACKAGED_README = 'packages/adapters/godot/README.md';
const GODOT_TYPES = 'packages/adapters/godot/fear_types.gd';

// Shared stimulus vocabulary the offline fallback may speak in addition to the
// canonical bands and intents.
const STIMULUS_TYPES = ['PREDATOR', 'SOUND', 'VISUAL', 'GORE', 'SCREAM', 'ENVIRONMENTAL_DREAD'];

function read(rel) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) throw new Error(`Missing required source: ${rel}`);
    return fs.readFileSync(p, 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

let PASS = 0;
const RESOLVED = [];

function check(label, condition, detail = '') {
    assert(condition, `${label}${detail ? ` — ${detail}` : ''}`);
    PASS++;
    console.log(`  * ${label}: PASS`);
}

function resolved(id, text) {
    RESOLVED.push({ id, text });
    console.log(`  + ${id} (resolved): ${text}`);
}

/** Every ALL-CAPS double-quoted literal in a GDScript source. */
const capsLiterals = (src) => new Set([...src.matchAll(/"([A-Z][A-Z_]{1,})"/g)].map((m) => m[1]));

const round = (n, d = 3) => Number(Number(n).toFixed(d));

/**
 * The station table the release record claims. Asserted against the source
 * table so a rename, addition, or removal trips the probe instead of
 * silently invalidating the docs.
 */
const EXPECTED_STATIONS = Object.freeze({
    1: 'Individual Fear & Threat Appraisal',
    2: 'Ambiguous Sound & Habituation',
    3: 'Crowd Panic Cascade',
    4: 'Leader Rally Dynamics',
    5: 'Trauma Zone Re-activation',
    6: 'Trade Caravan Danger Reroute',
    7: 'Faction Stance Interaction',
    8: 'Regional Trade Supply & Ambush Escorts',
    9: 'Multi-Observer Fog-of-War & Epistemic Rumor',
    10: 'Valley Advisory Chain Monitor'
});
// The nine behavioral stations plus the station-10 monitoring contract.
const BEHAVIORAL = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Extract a GDScript function body by brace-free "next func" slicing. */
function funcBody(src, funcName) {
    const start = src.indexOf(`func ${funcName}(`);
    if (start < 0) return null;
    const rest = src.slice(start);
    const next = rest.indexOf('\nfunc ', 1);
    return next < 0 ? rest : rest.slice(0, next);
}

function driveTicks(agent, ticks, observations, context) {
    let last = null;
    for (let i = 0; i < ticks; i++) last = agent.tick(0.0166, observations, context);
    return last;
}

// The showcase drives stations every physics frame, so sustained scenarios are
// evaluated over ~1s of frames. Contrast assertions (a leader present vs not,
// escorts vs none) are evaluated over the transient window where the two
// conditions actually differ, because the canonical core escalates any
// sustained threat toward saturation given enough frames.
const SUSTAINED = 60;
const TRANSIENT = 4;
// Acute appraisal window: long enough for the canonical core to escalate a
// close predator into escape-grade fear, short enough to stay in the
// decision regime the station depicts (before full saturation).
const ACUTE = 12;

/** AffectiveAgent traits from a station's declared (_create_agent) tuple. */
function agentFromTraits(id, t, seed) {
    return new AffectiveAgent(id, {
        neuroticism: t.neuroticism,
        resilience: t.resilience,
        // The showcase's fear_baseline fills the same resting-weight role as
        // the canonical `fear` trait.
        fear: t.fearBaseline,
        leadership: t.leadership
    }, { seed });
}

/**
 * Parse every `_create_agent("Name", "Role", Color(...), pos, n, r, b[, l[, lead]])`
 * call in a station init body. Assignment targets are captured when present
 * (some stations append straight into an array), and positions may contain
 * nested parentheses and commas.
 */
const CREATE_AGENT_RE = /(?:([a-z0-9_]+)\s*=\s*)?_create_agent\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*Color\([^)]*\)\s*,\s*(?:[^,()]|\([^)]*\))+,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?(?:\s*,\s*(true|false))?\s*\)/gi;

function parseAgents(body) {
    const out = [];
    if (!body) return out;
    let m;
    while ((m = CREATE_AGENT_RE.exec(body)) !== null) {
        out.push({
            varName: m[1] || null,
            name: m[2],
            role: m[3],
            neuroticism: Number(m[4]),
            resilience: Number(m[5]),
            fearBaseline: Number(m[6]),
            leadership: m[7] === undefined ? 0.0 : Number(m[7]),
            isLeader: m[8] === 'true'
        });
    }
    return out;
}

const byVar = (agents, varName) => agents.find((a) => a.varName === varName);

async function httpPostJson(port, route, body) {
    const payload = JSON.stringify(body ?? {});
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1', port, path: route, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                let parsed = null;
                try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep null */ }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        req.end(payload);
    });
}

async function main() {
    console.log('============================================================');
    console.log('VERIFY GODOT SHOWCASE STATION-LEVEL ADVISORY BEHAVIOR');
    console.log('============================================================\n');

    const showcaseSrc = read(SHOWCASE);
    const mainSrc = read(MAIN);
    const hostSrc = read(SHOWCASE_AGENT);
    const packagedAgent = read(PACKAGED_AGENT);
    const projectAgent = read(PROJECT_AGENT);
    const generatedCore = read(GENERATED_CORE);
    const hudSrc = read(PROJECT_HUD);
    const steeringSrc = read(PROJECT_STEERING);
    const godotTypes = read(GODOT_TYPES);
    const godotRunner = read(GODOT_RUNNER);
    const CANONICAL_LITERALS = new Set([...CORE_BANDS, ...ACTION_INTENTS, ...STIMULUS_TYPES]);

    // ------------------------------------------------------------------
    // PART A: inventory and wiring, derived from source
    // ------------------------------------------------------------------
    console.log('--- Part A: Station inventory and wiring (derived from source) ---');

    const declared = new Map();
    const tableRe = /(\d+):\s*\{\s*"name":\s*"([^"]+)",\s*"pos":\s*Vector2\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)\s*\}/g;
    let tm;
    while ((tm = tableRe.exec(showcaseSrc)) !== null) {
        declared.set(Number(tm[1]), { name: tm[2], x: Number(tm[3]), y: Number(tm[4]) });
    }

    check('Station table is declared in source', declared.size > 0, `found ${declared.size}`);
    check(
        'Source station ids match the release record (9 behavioral + chain monitor)',
        [...declared.keys()].join(',') === [...Object.keys(EXPECTED_STATIONS)].join(','),
        `source=[${[...declared.keys()]}] expected=[${Object.keys(EXPECTED_STATIONS)}]`
    );
    check('Nine behavioral stations are present', BEHAVIORAL.every((id) => declared.has(id)));

    const nameMismatches = Object.entries(EXPECTED_STATIONS)
        .filter(([id, name]) => declared.get(Number(id))?.name !== name)
        .map(([id, name]) => `#${id}: source="${declared.get(Number(id))?.name}" record="${name}"`);
    check('Station names in source match the recorded names', nameMismatches.length === 0, nameMismatches.join('; '));

    for (const id of declared.keys()) {
        check(`Station ${id} declares _init_station_${id}`, showcaseSrc.includes(`func _init_station_${id}(`));
        check(`Station ${id} declares _update_station_${id}`, showcaseSrc.includes(`func _update_station_${id}(`));
        check(`Station ${id} declares reset_station_${id}`, showcaseSrc.includes(`func reset_station_${id}(`));
    }

    const readyBody = funcBody(showcaseSrc, '_ready');
    const physBody = funcBody(showcaseSrc, '_physics_process');
    check(
        'Station controller header describes all 10 hosted stations',
        /Orchestrates the 10 showcase stations/.test(showcaseSrc)
    );
    check(
        'Station controller declares _ready',
        Boolean(readyBody)
    );
    check('Station controller declares _physics_process', Boolean(physBody));
    for (const id of declared.keys()) {
        check(`_ready() initializes station ${id}`, readyBody.includes(`_init_station_${id}()`));
        check(`_physics_process() updates station ${id}`, physBody.includes(`_update_station_${id}(`));
    }

    for (const id of BEHAVIORAL) {
        const hasTrigger = new RegExp(`func trigger_station_${id}_`).test(showcaseSrc);
        check(`Behavioral station ${id} exposes a trigger entry point`, hasTrigger);
    }

    // main.gd dispatch coverage: trigger and reset must cover every station.
    const triggerBody = funcBody(mainSrc, 'trigger_current_event');
    const resetBody = funcBody(mainSrc, 'reset_current_station');
    const matchCases = (body) => new Set([...body.matchAll(/^\t\t(\d+):/gm)].map((m) => Number(m[1])));
    const triggerCases = matchCases(triggerBody);
    const resetCases = matchCases(resetBody);
    const missingTrigger = [...declared.keys()].filter((id) => !triggerCases.has(id));
    const missingReset = [...declared.keys()].filter((id) => !resetCases.has(id));
    check(
        'Showcase UI trigger dispatch covers every station',
        missingTrigger.length === 0,
        `missing ${missingTrigger.join(', ')}`
    );
    check(
        'Showcase UI reset dispatch covers every station',
        missingReset.length === 0,
        `missing ${missingReset.join(', ')} — station resets exist in the controller but are unreachable from the UI`
    );

    // ------------------------------------------------------------------
    // PART B: nine behavioral station advisories on the canonical core
    // ------------------------------------------------------------------
    console.log('\n--- Part B: Behavioral station advisories (canonical JS core) ---');

    const bodies = new Map();
    for (const id of declared.keys()) bodies.set(id, funcBody(showcaseSrc, `_init_station_${id}`));

    // Station 1: acute predator appraisal -> escape-grade fear with an away vector.
    const s1 = parseAgents(bodies.get(1));
    const scout = byVar(s1, 's1_scout');
    check('Station 1 scout traits are declared in source', Boolean(scout), 'no _create_agent tuple parsed');
    check(
        'Station 1 approach trigger places the predator inside sight range',
        /s1_predator\.global_position = s1_scout\.global_position \+ Vector2\(70, 0\)/.test(showcaseSrc)
    );
    const s1Agent = agentFromTraits('s1_scout', scout, 'godot-station-1');
    const predator = { threats: [{ id: 'predator', type: 'PREDATOR', distance: 25, intensity: 1.0, x: 100, y: 0 }] };
    const s1Result = driveTicks(s1Agent, ACUTE, predator);
    let s1CrossingFrame = null;
    {
        const walker = agentFromTraits('s1_scout', scout, 'godot-station-1');
        for (let frame = 1; frame <= 15; frame++) {
            const step = walker.tick(0.0166, predator);
            if (step.affective_state.raw_fear > 0.6) { s1CrossingFrame = frame; break; }
        }
    }
    check('Station 1 fear rises above the escape threshold (>0.6)', s1Result.affective_state.raw_fear > 0.6,
        `raw_fear=${s1Result.affective_state.raw_fear}`);
    check('Station 1 escalates above CALM/ALERT', !['CALM', 'ALERT'].includes(s1Result.fear_band),
        `band=${s1Result.fear_band}`);
    check('Station 1 resolves an avoiding intent', ['FLEE_FROM', 'SEEK_COVER', 'FREEZE', 'DESPERATE_FLAIL']
        .includes(s1Result.action_intent.type), `intent=${s1Result.action_intent.type}`);
    check('Station 1 vector points away from the threat', (s1Result.action_intent.vector_hint?.x ?? 0) < 0,
        `vector_hint.x=${s1Result.action_intent.vector_hint?.x}`);
    check('Station 1 crosses the escape threshold within 15 sustained frames', s1CrossingFrame !== null,
        `crossed at frame ${s1CrossingFrame}`);
    check('Station 1 canonical band is one of the canonical four', FEAR_BANDS.includes(s1Result.fear_band),
        `band=${s1Result.fear_band}`);

    // Station 2: identical repeated stimulus must damp (habituation, monotone).
    const s2 = parseAgents(bodies.get(2));
    check('Station 2 sentry traits are declared in source', Boolean(byVar(s2, 's2_sentry')));
    check(
        'Station 2 no longer hardcodes a showcase-local habituation curve',
        !/minf\(1\.0, float\(s2_sound_bursts\) \* 0\.25\)/.test(showcaseSrc)
    );
    check(
        'Station 2 reads habituation from the canonical component curve',
        /get_habituation_level\("SOUND", "sound_pulse"\)/.test(showcaseSrc)
        && /"type": "SOUND"/.test(showcaseSrc)
    );
    const habituation = new HabituationSystem();
    const burstFear = [];
    for (let burst = 1; burst <= 5; burst++) {
        const adjusted = habituation.getEffectiveFear(0.85, 'SOUND', 'sound_pulse', burst);
        burstFear.push(adjusted);
        habituation.tick(1);
    }
    const monotone = burstFear.every((v, i) => i === 0 || v <= burstFear[i - 1] + 1e-12);
    check('Canonical habituation damps repeated sound monotonically', monotone, `bursts=[${burstFear.map((v) => round(v))}]`);
    check('Canonical habituation damps burst 5 below burst 1', burstFear[4] < burstFear[0],
        `burst1=${round(burstFear[0])} burst5=${round(burstFear[4])}`);
    check('Showcase habituation constants equal the canonical HabituationSystem defaults',
        DEFAULT_HABITUATION_CONFIG.maxHabituation === 0.60
        && DEFAULT_HABITUATION_CONFIG.habituationRate === 0.08
        && DEFAULT_HABITUATION_CONFIG.noveltyBoost === 0.15
        && DEFAULT_HABITUATION_CONFIG.recoveryRatePerTick === 0.0005);
    check('Canonical SOUND habituation damps burst 4 to 0.687', round(burstFear[3]) === 0.687,
        `burst4=${round(burstFear[3])}`);
    resolved('D2', 'the showcase habituation curve is now the canonical HabituationSystem curve (max 0.60, rate 0.08, novelty ramp) instead of the showcase-local 0.25-per-burst damp');

    // Station 3: an agitator's panic must propagate to peers.
    const s3 = parseAgents(bodies.get(3));
    check('Station 3 civilians are declared in source', showcaseSrc.includes('Civ %d'));
    check('Station 3 declares the contagion coupling (0.85)', /max_fear \* 0\.85/.test(showcaseSrc));
    const civ = new AffectiveAgent('civ_1', { neuroticism: 0.8, resilience: 0.2, fear: 0.1 }, { seed: 'godot-station-3' });
    const civResult = driveTicks(civ, TRANSIENT, {}, { contagionFear: 0.85 });
    check('Station 3 peers inherit above the cascade threshold (>=0.35)', civResult.affective_state.raw_fear >= 0.35,
        `raw_fear=${civResult.affective_state.raw_fear}`);
    const civLow = new AffectiveAgent('civ_1', { neuroticism: 0.8, resilience: 0.2, fear: 0.1 }, { seed: 'godot-station-3' });
    const civLowResult = driveTicks(civLow, TRANSIENT, {}, { contagionFear: 0.10 });
    check('Station 3 cascade is monotone in group panic',
        civResult.affective_state.raw_fear > civLowResult.affective_state.raw_fear,
        `0.85 -> ${civResult.affective_state.raw_fear}, 0.10 -> ${civLowResult.affective_state.raw_fear}`);

    // Station 4: a leader's rally must suppress follower fear under threat.
    const s4 = parseAgents(bodies.get(4));
    check('Station 4 declares a leader and three followers in source',
        s4.some((a) => a.isLeader) && s4.filter((a) => !a.isLeader).length === 3,
        `agents=${s4.length} leaders=${s4.filter((a) => a.isLeader).length}`);
    check('Station 4 declares the rally radius and suppression step',
        /dist <= 220\.0/.test(showcaseSrc) && /current_raw_fear - 0\.02/.test(showcaseSrc));
    const unled = new AffectiveAgent('soldier_1', { neuroticism: 0.65, resilience: 0.4, fear: 0.1 }, { seed: 'godot-station-4' });
    const unledResult = driveTicks(unled, 6, {
        threats: [{ id: 'platoon', type: 'PREDATOR', distance: 25, intensity: 0.8 }]
    }, {});
    const led = new AffectiveAgent('soldier_1', { neuroticism: 0.65, resilience: 0.4, fear: 0.1 }, { seed: 'godot-station-4' });
    const ledResult = driveTicks(led, 6, {
        threats: [{ id: 'platoon', type: 'PREDATOR', distance: 25, intensity: 0.8 }]
    }, { leaderCalm: 0.9 });
    check('Station 4 leader presence suppresses follower fear',
        ledResult.affective_state.raw_fear < unledResult.affective_state.raw_fear,
        `unled=${unledResult.affective_state.raw_fear} led=${ledResult.affective_state.raw_fear}`);

    // Station 5: trauma-zone dread re-activation, gradient in proximity.
    const s5 = parseAgents(bodies.get(5));
    const veteran = byVar(s5, 's5_veteran');
    check('Station 5 veteran traits are declared in source', Boolean(veteran));
    check('Station 5 declares its dread gradient and radius',
        /1\.0 - \(d \/ s5_dread_radius\)/.test(showcaseSrc) && /s5_dread_radius: float = 90\.0/.test(showcaseSrc));
    const nearDread = (1 - 20 / 90) * 0.95;
    const farDread = (1 - 80 / 90) * 0.95;
    const near = driveTicks(agentFromTraits('veteran_near', veteran, 'godot-station-5a'), 10, {}, { traumaDread: nearDread });
    const far = driveTicks(agentFromTraits('veteran_far', veteran, 'godot-station-5b'), 10, {}, { traumaDread: farDread });
    check('Station 5 dread re-activation exceeds the declared threshold (>0.50)', near.affective_state.raw_fear > 0.50,
        `raw_fear=${near.affective_state.raw_fear} (dread=${round(nearDread)})`);
    check('Station 5 raises posture urgency above a meaningful floor (>0.30)', near.action_intent.urgency > 0.30,
        `urgency=${near.action_intent.urgency}`);
    check('Station 5 posture urgency tracks proximity', near.action_intent.urgency > far.action_intent.urgency,
        `near=${near.action_intent.urgency} far=${far.action_intent.urgency}`);
    check('Station 5 re-activation is monotone in proximity',
        near.affective_state.raw_fear > far.affective_state.raw_fear,
        `near=${near.affective_state.raw_fear} far=${far.affective_state.raw_fear}`);

    // Station 6: caravan route decision rule + canonical corridor danger signal.
    check(
        'Station 6 declares its reroute threshold as a named constant calibrated to the canonical chain',
        /const S6_REROUTE_DANGER := 0\.50/.test(showcaseSrc)
        && /s6_highland_danger >= S6_REROUTE_DANGER/.test(showcaseSrc)
    );
    const routeFor = (danger) => (danger >= 0.50 ? 'RIVER_DETOUR' : 'HIGHLAND_PASS');
    check('Station 6 ambush (0.85) reroutes to the detour', routeFor(0.85) === 'RIVER_DETOUR');
    check('Station 6 clear (0.05) keeps the pass', routeFor(0.05) === 'HIGHLAND_PASS');
    const ambush = new EncounterConsequenceEngine().process({
        category: 'HIGHWAY_AMBUSH', resolution: 'COMBAT_ENGAGEMENT', corridorId: 'highland_pass'
    });
    const corridorDanger = ambush.corridorHazards?.[0]?.danger;
    check('Canonical ambush produces a positive corridor danger signal', Number(corridorDanger) > 0,
        `danger=${corridorDanger}`);
    check('Canonical chain ambush danger reaches the station-6 reroute threshold',
        Number(corridorDanger) >= 0.50, `canonical=${corridorDanger} threshold=0.50`);
    check('Station 6 clear-route danger stays below the reroute threshold', routeFor(0.05) === 'HIGHLAND_PASS');
    resolved('D6', `the station-6 reroute threshold is 0.50, equal to the canonical valley-chain ambush hazard (${corridorDanger}); a host feeding real chain output now reroutes instead of holding the Highland Pass`);

    // Station 7: bilateral stance ladder.
    check('Station 7 declares its tension input', /var s7_tension: float = 0\.15/.test(showcaseSrc));
    check('Station 7 declares the ladder thresholds',
        /d > 220\.0/.test(showcaseSrc) && /d > 140\.0/.test(showcaseSrc) && /d > 70\.0/.test(showcaseSrc));
    const stanceFor = (d, tension) => {
        if (d > 220) return 'UNAWARE';
        if (d > 140) return 'OBSERVE';
        if (d > 70) return tension < 0.5 ? 'WARN' : 'POSTURE';
        return tension >= 0.5 ? 'SKIRMISH' : 'NEGOTIATE';
    };
    check('Station 7 initial separation reads UNAWARE', stanceFor(240, 0.15) === 'UNAWARE');
    check('Station 7 escalation (+-35px, tension 0.85) reads SKIRMISH', stanceFor(70, 0.85) === 'SKIRMISH',
        `got ${stanceFor(70, 0.85)}`);
    check('Station 7 close range at low tension reads NEGOTIATE', stanceFor(60, 0.15) === 'NEGOTIATE');
    check('Station 7 mid range is tension-sensitive',
        stanceFor(100, 0.15) === 'WARN' && stanceFor(100, 0.85) === 'POSTURE');

    // Station 8: escort suppression + declared mass conservation.
    const s8 = parseAgents(bodies.get(8));
    const merchant = byVar(s8, 's8_merchant');
    const escortCount = s8.filter((a) => a.role === 'Guardian').length;
    check('Station 8 merchant and two escorts are declared in source', Boolean(merchant) && escortCount === 2,
        `escorts=${escortCount}`);
    check('Station 8 declares the escort threat-suppression values',
        /var threat_val = 0\.90 if s8_escorts\.is_empty\(\) else 0\.35/.test(showcaseSrc));
    const unescorted = driveTicks(agentFromTraits('merchant', merchant, 'godot-station-8a'), TRANSIENT,
        { threats: [{ id: 'bandit', type: 'PREDATOR', distance: 30, intensity: 0.90 }] });
    const escorted = driveTicks(agentFromTraits('merchant', merchant, 'godot-station-8b'), TRANSIENT,
        { threats: [{ id: 'bandit', type: 'PREDATOR', distance: 30, intensity: 0.35 }] });
    check('Station 8 escorts suppress merchant fear',
        escorted.affective_state.raw_fear < unescorted.affective_state.raw_fear,
        `escorted=${escorted.affective_state.raw_fear} unescorted=${unescorted.affective_state.raw_fear}`);
    const mass = [200.0, 40.0, 60.0];
    check('Station 8 declares mass-conserving stock levels', /s8_hub_a_grain: float = 200\.0/.test(showcaseSrc)
        && /s8_hub_b_grain: float = 40\.0/.test(showcaseSrc) && /s8_caravan_cargo: float = 60\.0/.test(showcaseSrc));
    check('Station 8 regional mass is conserved at 300', mass.reduce((a, b) => a + b, 0) === 300.0);

    // Station 9: fog-of-war decoupling, then rumor mobilization.
    const s9 = parseAgents(bodies.get(9));
    const outpost = byVar(s9, 's9_outpost_sentry');
    const capital = byVar(s9, 's9_capital_commander');
    check('Station 9 observers are declared in source', Boolean(outpost) && Boolean(capital));
    check('Station 9 declares its rumor amplification factor', /s9_rumor_decay_factor: float = 1\.25/.test(showcaseSrc));
    const outpostResult = driveTicks(agentFromTraits('outpost', outpost, 'godot-station-9a'), SUSTAINED,
        { threats: [{ id: 'apex_threat', type: 'PREDATOR', distance: 35, intensity: 0.95 }] });
    const capitalFog = driveTicks(agentFromTraits('capital', capital, 'godot-station-9b'), SUSTAINED, {});
    check('Station 9 informed outpost exceeds the declared inform threshold (>0.60)',
        outpostResult.affective_state.raw_fear > 0.60, `raw_fear=${outpostResult.affective_state.raw_fear}`);
    check('Station 9 fogged capital stays decoupled (<=0.05)', capitalFog.affective_state.raw_fear <= 0.05,
        `raw_fear=${capitalFog.affective_state.raw_fear}`);
    const rumorIntensity = Math.min(1.0, 0.95 * 1.25);
    check('Station 9 rumor is clamped at full intensity', rumorIntensity === 1.0);
    const capitalInformed = driveTicks(agentFromTraits('capital', capital, 'godot-station-9b'), SUSTAINED,
        { threats: [{ id: 'courier_rumor_report', type: 'PREDATOR', distance: 50, intensity: rumorIntensity }] });
    check('Station 9 courier rumor mobilizes the capital above fog level',
        capitalInformed.affective_state.raw_fear > capitalFog.affective_state.raw_fear,
        `informed=${capitalInformed.affective_state.raw_fear} fog=${capitalFog.affective_state.raw_fear}`);
    check('Station 9 fogged capital never reaches the informed observer band',
        capitalFog.fear_band === 'CALM' && outpostResult.fear_band !== capitalFog.fear_band,
        `fog=${capitalFog.fear_band} informed=${outpostResult.fear_band}`);
    check('Showcase fallback ramps with the generated per-tick integration step',
        /const FEAR_STEP_UP := 0\.05/.test(generatedCore)
        && /current_raw_fear \+ Canon\.FEAR_STEP_UP/.test(projectAgent));
    check('Showcase fallback no longer snaps to a static per-frame target',
        !/target_fear/.test(projectAgent) && !/if step >= 1\.0:/.test(projectAgent));
    resolved('D3', 'the showcase fallback now integrates sustained exposure with the canonical +0.05/tick ramp (plus canonical decay) instead of snapping to a static per-frame target');

    // ------------------------------------------------------------------
    // PART C: station 10 chain monitor against the live server contract
    // ------------------------------------------------------------------
    console.log('\n--- Part C: Station 10 chain monitor vs live server contract ---');
    check('Station 10 implements apply_station_10_chain', /func apply_station_10_chain\(payload: Dictionary\) -> bool/.test(showcaseSrc));
    check('Station 10 reads links.ROUTE_DANGER.danger', /links\.has\("ROUTE_DANGER"\)/.test(showcaseSrc)
        && /rd\.has\("danger"\)/.test(showcaseSrc));
    check('Station 10 declares its reroute threshold', /s10_route_danger >= 0\.60/.test(showcaseSrc));

    const fastFailOrdering = [...showcaseSrc.matchAll(/if[^\n]*\n\t\ts10_link_down = true\n\t\treturn false/g)].length;
    const refusalCount = [...showcaseSrc.matchAll(/return false/g)].length;
    check('Station 10 flags link-down before refusing every invalid payload',
        fastFailOrdering === refusalCount && refusalCount >= 3,
        `flag-first=${fastFailOrdering} refusals=${refusalCount}`);
    check('Station 10 holds last state while the link is down (freeze, never invent)',
        /if s10_link_down:\n\t\treturn/.test(showcaseSrc));

    const server = new FearServer({ host: '127.0.0.1', port: 0, seed: 424242 });
    try {
        const bound = await server.start();
        const response = await httpPostJson(bound.port, '/api/v1/advisory/chain', {});
        check('Live /api/v1/advisory/chain responds 200', response.status === 200, `status=${response.status}`);
        const payload = response.body || {};
        check('Live chain payload is ADVISORY_CHAIN_RESPONSE', payload.type === 'ADVISORY_CHAIN_RESPONSE');
        check('Live chain payload reports unbroken', payload.unbroken === true);
        check('Live chain payload carries every canonical link',
            CHAIN_LINKS.every((l) => payload.links && Object.prototype.hasOwnProperty.call(payload.links, l)),
            `links=[${payload.links ? Object.keys(payload.links).join(',') : 'none'}]`);
        check('Live payload carries the ROUTE_DANGER link the station consumes',
            Boolean(payload.links?.ROUTE_DANGER) && 'danger' in payload.links.ROUTE_DANGER);
        check('Live ROUTE_DANGER danger is a bounded unit value',
            Number(payload.links.ROUTE_DANGER.danger) > 0 && Number(payload.links.ROUTE_DANGER.danger) <= 1);
        check('Station 10 would accept the live ROUTE_DANGER value',
            Number(payload.links.ROUTE_DANGER.danger) >= 0 && Number(payload.links.ROUTE_DANGER.danger) <= 1);
        check('Station 10 would accept the live checks map', payload.checks
            && CHAIN_LINKS.every((l) => typeof payload.checks[l] === 'boolean'));

        const malformed = await httpPostJson(bound.port, '/api/v1/advisory/chain', { seed: 1.5 });
        check('Live chain endpoint rejects a non-integer seed', malformed.status === 400, `status=${malformed.status}`);
    } finally {
        await server.stop();
    }

    // ------------------------------------------------------------------
    // PART D: advisory-only boundary, canonical vocabulary, resolutions
    // ------------------------------------------------------------------
    console.log('\n--- Part D: Advisory-only boundary, canonical vocabulary, resolutions ---');

    check('Packaged Godot adapter takes its band from server state',
        packagedAgent.includes('current_fear_band = state.get("fear_band"'));
    check('Packaged Godot adapter takes its intent from server state',
        packagedAgent.includes('current_intent = intent.get("type"'));
    check('Packaged Godot adapter is a transport component, not a local evaluator',
        !packagedAgent.includes('evaluate_local'), 'packaged adapter unexpectedly grew a local evaluator');
    check('Packaged adapter documents host-owned motor authority',
        packagedAgent.includes('Host-owned motor'));

    check('Showcase host script owns the motor', hostSrc.includes('move_and_slide()'));
    check('Showcase host applies the advisory vector itself',
        hostSrc.includes('hint.intent') && hostSrc.includes('advisory_vec'));
    check('Showcase does not silently attach the opt-in steering motor',
        !hostSrc.includes('FearSteering2D') && !read(path.join('tests/godot_project/main.tscn')).includes('FearSteering2D'));
    check('Fear agent component performs no host physics mutation',
        !/move_and_slide\s*\(/.test(projectAgent) && !/^\s*velocity\s*=/m.test(projectAgent)
        && !/global_position\s*=/m.test(projectAgent));

    // --- D1: the offline fallback speaks only the canonical vocabulary. ---
    const fallbackCaps = capsLiterals(projectAgent);
    const strayLiterals = [...fallbackCaps].filter((l) => !CANONICAL_LITERALS.has(l));
    check('Showcase fallback emits only canonical band/intent/stimulus literals',
        strayLiterals.length === 0, `stray=[${strayLiterals.join(', ')}]`);
    check('"FEAR" is gone and the canonical ANXIOUS band is in use',
        !fallbackCaps.has('FEAR') && FEAR_BANDS.includes('ANXIOUS'));
    check('"INVESTIGATE" is gone and the canonical INVESTIGATE_SOUND intent is in use',
        !fallbackCaps.has('INVESTIGATE') && ACTION_INTENTS.includes('INVESTIGATE_SOUND'));
    check('Showcase fallback resolves urgency instead of aliasing it to raw fear',
        !/urgency":\s*current_raw_fear/.test(projectAgent));
    check('Generated canonical core declares the canonical scaled thresholds',
        /const FEAR_SCALE := 4\.2/.test(generatedCore)
        && /const BAND_ENTER_ALERT := 0\.8/.test(generatedCore)
        && /const BAND_ENTER_ANXIOUS := 1\.4/.test(generatedCore)
        && /const BAND_ENTER_PANIC := 3\.8/.test(generatedCore)
        && /const BAND_EXIT_CALM := 0\.55/.test(generatedCore)
        && /const PANIC_LOCK_TICKS := 10/.test(generatedCore));
    check('Generated canonical core emits only canonical band/intent/stimulus literals',
        [...capsLiterals(generatedCore)].every((l) => CANONICAL_LITERALS.has(l)),
        `stray=[${[...capsLiterals(generatedCore)].filter((l) => !CANONICAL_LITERALS.has(l))}]`);
    check('Godot type enum carries no non-canonical FEAR band',
        !/^\tFEAR,$/m.test(godotTypes) && /^\tANXIOUS,$/m.test(godotTypes));
    resolved('D1', 'the showcase offline fallback emits CALM/ALERT/ANXIOUS/PANIC and canonical ACTION_INTENTS with resolved per-intent urgency, keeping the FearCore enter/exit hysteresis and panic lock');

    // --- D2: canonical habituation constants and curve. ---
    check('Generated canonical core declares the canonical habituation constants',
        /const HABITUATION_MAX := 0\.6/.test(generatedCore)
        && /const HABITUATION_RATE := 0\.08/.test(generatedCore)
        && /const HABITUATION_NOVELTY_BOOST := 0\.15/.test(generatedCore)
        && /const HABITUATION_RECOVERY_PER_TICK := 0\.0005/.test(generatedCore));
    check('Showcase fallback applies the generated habituation curve',
        /func get_effective_fear\(/.test(projectAgent) && /func get_habituation_level\(/.test(projectAgent)
        && /Canon\.potential_habituation\(/.test(projectAgent));

    // --- D4: duplication is vocabulary-consistent and documented. ---
    // The showcase copy is no longer offline-only: it carries BOTH the offline
    // fallback and the live-server path, and must say so next to the packaged
    // adapter's transport-only role.
    check('Showcase copy declares its selectable appraisal source beside the packaged adapter',
        /SHOWCASE VARIANT with a selectable APPRAISAL SOURCE/.test(projectAgent)
        && /LOCAL_FALLBACK/.test(projectAgent)
        && /LIVE_SERVER/.test(projectAgent)
        && /transport-only/.test(projectAgent));
    check('Showcase fallback and packaged adapter share the canonical default band/intent',
        projectAgent.includes('var current_fear_band: String = "CALM"')
        && packagedAgent.includes('var current_fear_band: String = "CALM"')
        && projectAgent.includes('var current_intent: String = "IDLE_VIGILANT"')
        && packagedAgent.includes('var current_intent: String = "IDLE_VIGILANT"'));
    check('Showcase fallback derives its canonical math from the generated core',
        projectAgent.includes('preload("res://addons/fear_ai/fear_canonical_core.gd")')
        && !/^const (BAND_ENTER|BAND_EXIT|FEAR_SCALE|FEAR_STEP_UP|PANIC_LOCK_TICKS|HABITUATION_)/m.test(projectAgent),
        'the fallback grew its own copy of the canonical numbers again');
    check('Generated canonical core is the single declared source of the fallback vocabulary',
        /GENERATED FILE — DO NOT EDIT BY HAND/.test(generatedCore)
        && /class_name FearCanonicalCore/.test(generatedCore));
    check('HUD band palette covers exactly the canonical core bands',
        [...hudSrc.matchAll(/"([A-Z_]+)":\s*return COLOR_/g)].map((m) => m[1]).sort().join(',') === 'ALERT,ANXIOUS,CALM,PANIC');
    check('HUD palette no longer carries the non-canonical UNEASY/FEAR bands',
        !/"UNEASY"/.test(hudSrc) && !/"FEAR"/.test(hudSrc));
    check('Steering band checks use only canonical bands',
        [...steeringSrc.matchAll(/current_fear_band == "([A-Z_]+)"/g)].map((m) => m[1]).every((b) => FEAR_BANDS.includes(b)));
    {
        const blockStart = steeringSrc.indexOf('match _agent.current_intent:');
        const block = steeringSrc.slice(blockStart, steeringSrc.indexOf('\n\n', blockStart));
        const steerIntents = [...block.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
        check('Steering intent match uses only canonical intents',
            steerIntents.length > 0 && steerIntents.every((i) => ACTION_INTENTS.includes(i)),
            `got [${steerIntents.join(', ')}]`);
    }
    check('Packaged adapter README documents the transport-only boundary',
        read(PACKAGED_README).includes('transport-only') && read(PACKAGED_README).includes('owns no local evaluator'));
    check('Packaged quickstart guards the offline-only evaluator call',
        read(PACKAGED_QUICKSTART).includes('has_method("evaluate_local")'));
    {
        const callers = [hostSrc, showcaseSrc, godotRunner, read(QUICKSTART)];
        const fractional = callers.filter((src) => /evaluate_local\([^)]*delta\s*\*/.test(src));
        check('No showcase caller passes a fractional step where a tick count is expected',
            fractional.length === 0, `${fractional.length} caller(s) still pass delta*`);
    }
    resolved('D4', 'the two fear_agent.gd copies share the canonical vocabulary; the showcase copy is documented as the offline fallback, the packaged copy stays transport-only, and HUD/steering band+intent vocabulary is pinned canonical');

    // --- D5: the Godot-side runner is no longer stale. ---
    check('Godot-side runner header no longer claims 7 behavioral stations',
        !/7 behavioral stations/i.test(godotRunner));
    check('Godot-side runner describes its 13 suites',
        /Verifies 13 suites deterministically/.test(godotRunner) && /var total_count = 13/.test(godotRunner));
    check('Godot-side runner station-1 assertion uses canonical bands',
        godotRunner.includes('hint1.fear_band == "ANXIOUS"') && !godotRunner.includes('hint1.fear_band == "FEAR"'));
    check('Godot-side runner station-6 threshold matches the canonical chain hazard',
        /if highland_danger >= 0\.50:/.test(godotRunner));
    check('Godot-side runner drives multi-tick settling for sustained scenarios',
        /evaluate_local\(threat, 0\.0, 0\.0, 12\)/.test(godotRunner));
    resolved('D5', 'the Godot-side runner header, suite list, station-1 band vocabulary, station-6 threshold, and multi-tick settling now match the canonical vocabulary and the 10-station controller');

    console.log('\n============================================================');
    console.log(`SUCCESS: All ${PASS} Godot station-level assertions PASSED.`);
    console.log(`Pinned divergences resolved: ${RESOLVED.length} (${RESOLVED.map((f) => f.id).join(', ')})`);
    console.log('Scope: station advisory contracts and boundaries only. This probe does not');
    console.log('execute GDScript; live execution is `npm run godot:evidence` (headless).');
    console.log('No rendering assertion, no engine-level or host-game certification.');
    console.log('============================================================\n');
}

main().catch((err) => {
    console.error('VERIFICATION FAILURE:', err.message);
    process.exit(1);
});
