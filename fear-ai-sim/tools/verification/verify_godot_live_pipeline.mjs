#!/usr/bin/env node

/**
 * tools/verification/verify_godot_live_pipeline.mjs
 *
 * WIRING probe for the Godot showcase's LIVE-SERVER appraisal path.
 *
 * Why this exists separately from `run_showcase_live_conformance.gd`: the
 * in-engine suite proves the live path WORKS on the day it runs. This probe
 * proves the path is still there at all, at source level, for every change that
 * does not happen to launch Godot. A live path is easy to rot into dead code -
 * an unused mode branch, a station that quietly writes fear state itself, an
 * observer that never registers - and none of that shows up as a failure
 * anywhere else. Every assertion below corresponds to a defect that was
 * actually present in this repository before the live path was built:
 *
 *   1. The client never registered agents. The server drops observations for
 *      unknown agents, so a "live" client produced no advisories at all.
 *   2. A control request that could not start was dropped instead of retried,
 *      silently leaving agents unregistered.
 *   3. `_init()` builds the fear component before a station can assign
 *      `agent_name`, so syncing identity only at creation left every showcase
 *      agent sharing the placeholder id "agent" - all 28 registered as ONE
 *      server-side agent and received each other's advisories.
 *   4. The live path read the band and intent from server state but never
 *      `raw_fear`, so the host's fear value stayed pinned at 0 in live mode.
 *   5. Stations wrote fear straight into the component, which in live mode
 *      means the host overriding the affect model it asked for.
 *   6. Registration went out one agent per HTTP round trip, so a large host
 *      spent seconds of dead time registering before its first advisory. The
 *      client now uses the server's batch routes for registration, teardown and
 *      trauma authoring, keeping the singular requests as the fallback for
 *      older servers and for the tail a batch did not confirm.
 *   7. The host had no identity, so the server could not tell a reconnecting
 *      host from a rival claiming the same crowd, and a rejected control entry
 *      could vanish silently. The client now carries a stable session id and
 *      reports refusals and rejections instead of swallowing them.
 *
 * Scope: this is a source-level wiring tripwire. It does not execute GDScript,
 * does not prove server behaviour, and makes no rendering or host-game claim.
 * In-engine execution is `npm run godot:evidence`.
 *
 * Hard Rule 9 compliant: standalone deterministic probe, no test runner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

const SHOWCASE_CLIENT = 'tests/godot_project/addons/fear_ai/fear_ai_client.gd';
const PACKAGED_CLIENT = 'packages/adapters/godot/fear_ai_client.gd';
const SHOWCASE_AGENT = 'tests/godot_project/addons/fear_ai/fear_agent.gd';
const PACKAGED_AGENT = 'packages/adapters/godot/fear_agent.gd';
const SHOWCASE_HOST = 'tests/godot_project/showcase_agent.gd';
const STATION_CONTROLLER = 'tests/godot_project/station_controller.gd';
const LIVE_SUITE = 'tests/godot_project/run_showcase_live_conformance.gd';
const EVIDENCE_RUNNER = 'tools/run-godot-inengine-evidence.mjs';

function read(rel) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) throw new Error(`Missing required source: ${rel}`);
    return fs.readFileSync(p, 'utf8');
}

/**
 * Strip GDScript comments, so a source-level guard tests CODE rather than prose.
 * Needed because a comment that documents a trap necessarily contains the trap's
 * text, and a guard that reads comments fires on its own explanation.
 * Trailing comments are cut only when the `#` is outside a double-quoted string,
 * which is what keeps a `#` inside a literal from swallowing real code.
 */
function codeOnly(src) {
    return src.split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .map((line) => {
            let quoted = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') quoted = !quoted;
                else if (ch === '#' && !quoted) return line.slice(0, i);
            }
            return line;
        })
        .join('\n');
}

/**
 * The body of one GDScript function: from its `func` line to the next one.
 *
 * Why not a character window: a fixed `[\s\S]{0,N}` window is a tripwire that
 * measures its own tolerance. When the function grows for an unrelated reason the
 * check fails, and the repair that suggests itself is to increase N - after which
 * the check no longer asserts what it was written to assert. Body slicing has no N
 * to increase.
 */
function gdFunctionBody(source, name) {
    const start = source.indexOf(`func ${name}(`);
    if (start < 0) return '';
    const rest = source.slice(start + 1);
    const next = rest.search(/\nfunc /);
    return next < 0 ? rest : rest.slice(0, next + 1);
}

let PASS = 0;
function check(label, condition, detail = '') {
    if (!condition) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    PASS++;
    console.log(`  * ${label}: PASS`);
}

function main() {
    console.log('============================================================');
    console.log('VERIFY GODOT LIVE-SERVER APPRAISAL PIPELINE (source wiring)');
    console.log('============================================================');

    // ---------------------------------------------------------------------
    console.log('\n--- 1. Client control plane (both copies) ---');
    for (const rel of [SHOWCASE_CLIENT, PACKAGED_CLIENT]) {
        const src = read(rel);
        check(`${rel} resolves its port from FEAR_AI_PORT`, src.includes('FEAR_AI_PORT'));
        check(`${rel} exposes a serialized registration queue`,
            src.includes('func ensure_registered(')
            && src.includes('_registration_queue')
            && src.includes('_registered_agents'));
        check(`${rel} has a separate control HTTPRequest`, src.includes('_control_request'));
        check(`${rel} can author a server trauma zone`,
            src.includes('func add_trauma_zone(') && src.includes('/api/v1/trauma'));
        check(`${rel} can reset the server session`,
            src.includes('func reset_server(') && src.includes('/api/v1/reset'));
        check(`${rel} counts observations it had to drop for unregistered agents`,
            src.includes('dropped_unregistered_observations'));
        check(`${rel} counts registration failures instead of failing silently`,
            src.includes('registration_failures'));
        // Batch registration is what keeps a large host from spending one HTTP
        // round trip per agent. A regression here is invisible in a small
        // showcase and painful on a real crowd, so it is pinned at source level.
        check(`${rel} registers agents through the batch route`,
            src.includes('/api/v1/register/batch')
            && src.includes('{ "agents": payloads }')
            && src.includes('mini(_registration_queue.size(), BATCH_REGISTRATION_LIMIT)'));
        check(`${rel} keeps the individual route as fallback and for unconfirmed tails`,
            src.includes('/api/v1/register" %') && src.includes('_requeue_registrations('));
        check(`${rel} disables batching on a 404 instead of retrying a route that is not there`,
            src.includes('response_code == 404')
            && src.includes('batch_registration_unsupported = true')
            && src.includes('_batch_registration_supported = false'));
        check(`${rel} caps a batch at the server limit`,
            /const BATCH_REGISTRATION_LIMIT: int = 512/.test(src));
        check(`${rel} counts batched and individual registration requests`,
            src.includes('batched_registration_requests')
            && src.includes('individual_registration_requests'));
        check(`${rel} increments its individual-request counter where it dispatches`,
            src.includes('individual_registration_requests += 1'));
        check(`${rel} marks only server-CONFIRMED ids as registered`,
            /if confirmed\.has\(id\)/.test(src)
            && src.includes('_requeue_registrations(unconfirmed)'));
        // Ownership: a host with no session id cannot be told apart from a rival
        // claiming the same crowd, so the identity must be carried on every
        // registration AND be stable for the process rather than per socket.
        check(`${rel} carries a stable session identity on registrations`,
            src.includes('var session_id: String = ""')
            && src.includes('payload["session_id"] = session_id')
            && src.includes('batch_body["session_id"] = session_id'),
            'session_id must travel with both the singular and batch registrations');
        check(`${rel} assigns its session id once, not per connection`,
            /if session_id\.is_empty\(\):\n\s*session_id = "godot_/.test(src),
            'a per-socket id would make the host a stranger on every reconnect');
        check(`${rel} names the session on the handshake so liveness starts early`,
            /_send_handshake[\s\S]{0,400}session_id/.test(src));
        check(`${rel} defaults to never displacing a live owner`,
            /var claim_mode: String = "join"/.test(src));
        // A NAME is not a credential. The token the server issues is, and the
        // client must both store it and send it back on every later claim.
        check(`${rel} stores the server-issued session token`,
            src.includes('var session_token: String = ""')
            && src.includes('func _adopt_session_token(')
            && src.includes('session_established.emit(true)'),
            'without the token the host can only claim by name and will be refused');
        check(`${rel} echoes the token on singular and batch registrations`,
            src.includes('payload["session_token"] = session_token')
            && src.includes('batch_body["session_token"] = session_token'));
        check(`${rel} names the token on the handshake so proven identity binds early`,
            src.includes('func _send_handshake(')
            && src.includes('handshake["session_token"] = session_token'),
            'a socket must be able to bind to a proven session, not only to a name');
        // A PARSE guard, pinned to the exact trap that was hit and verified
        // against the engine: a parenthesis-less builtin call whose argument is
        // a member access, e.g. `typeof single.get("x")`, inside a compound `if`.
        // Godot 4.6 fails the whole script with a message that points at the
        // line rather than the cause, so it is worth a dedicated tripwire.
        // (`is ... and ...` is NOT the problem: three instances of that form
        // compile fine in this same file, which is why the guard targets the
        // call form instead.)
        check(`${rel} uses no parenthesis-less builtin call in a condition`,
            !/\btypeof\s+[A-Za-z_$]/.test(codeOnly(src)),
            'write typeof(x) with parentheses, or split the condition into steps');
        check(`${rel} distinguishes a refused claim from a failed one`,
            src.includes('refused_claims') && src.includes('_refusal_for(refused, id)'),
            'a refusal must be reported once, not requeued into a retry loop');
        check(`${rel} does not requeue a claim a live session refused`,
            /elif _refusal_for\(refused, id\) != "":/.test(src));

        // CREDENTIAL PERSISTENCE. The token model is worth nothing to a host if
        // the host cannot keep the token: a restarted process must come back as
        // the same session rather than adopt its own crowd. The store, the save
        // at issue time and the load before the first claim are what make that
        // true, and each has been broken at least once during development.
        check(`${rel} can persist its session identity`,
            src.includes('@export var persist_session')
            && src.includes('@export var session_store_path')
            && src.includes('func load_session(') && src.includes('func save_session(')
            && src.includes('func clear_session('),
            'the credential has to outlive the process for a restart to be a reconnect');
        check(`${rel} loads the store BEFORE generating a fallback name`,
            /func _ready\(\)[\s\S]{0,600}?if persist_session:\n\t\tload_session\(\)[\s\S]{0,400}?if session_id\.is_empty\(\):/.test(src),
            'a generated name would overwrite the stored identity');
        // Sliced, not windowed. This check originally matched
        // `/func _adopt_session_token[\s\S]{0,900}?if persist_session.../` and it
        // FAILED the moment the function legitimately grew - the signing-key
        // report now lands at the top of it - which is a tripwire measuring its
        // own tolerance rather than the code. The tempting repair is to widen the
        // number until it passes; reading the real function body has no number.
        const adoptBody = gdFunctionBody(src, '_adopt_session_token');
        check(`${rel} writes the credential the moment the server issues one`,
            adoptBody.length > 0
            && /var changed := value != session_token/.test(adoptBody)
            && /if persist_session and changed:\n\t\tsave_session\(\)/.test(adoptBody),
            'saving only at shutdown loses the token to exactly the crash it is for');
        check(`${rel} counts rotations and expiries of its credential`,
            src.includes('session_token_rotations') && src.includes('session_token_expiries'),
            'a credential replaced for a reason the host did not ask for must not be discovered by failing later');
        check(`${rel} records how the server received it (GRANTED vs ADOPTED)`,
            src.includes('var last_claim_outcome: String = ""')
            && src.includes('claims_adopted += 1'),
            'an adoption after a restart means the host came back as a stranger');
        // Teardown is ownership-gated on the server, so the credential has to
        // travel with it. Shipping only the NAME here locked an honest host out
        // of retiring its own crowd - found by running the real client.
        check(`${rel} sends its credential with the teardown, not only the name`,
            src.includes('ubody["session_token"] = session_token')
            && src.includes('unreg_payload["session_token"] = session_token'),
            'a name-only teardown is refused as a stranger\'s request');
        check(`${rel} counts and reports teardown refusals`,
            src.includes('unregistration_refusals')
            && src.includes('unregister_refused_not_owner'),
            'an id the host believes it retired while the server holds it has nothing to debug');
        // A reset is gated too, so it carries identity AND is not believed until
        // the server confirms it: clearing the local view on send made a refused
        // reset look applied.
        check(`${rel} sends its identity with a reset`,
            /func reset_server[\s\S]{0,700}?payload\["session_id"\] = session_id/.test(src));
        check(`${rel} clears its local agent view only on a CONFIRMED reset`,
            src.includes('_reset_pending_clear')
            && /response_code == 200:[\s\S]{0,300}?if _reset_pending_clear:/.test(src),
            'clearing on send makes a refused reset look applied');
        check(`${rel} reports a refused reset instead of swallowing it`,
            src.includes('reset_refusals += 1') && src.includes('reset refused'),
            'a host that asked for a clean world and did not get one must know why');

        // Batched teardown and batched trauma authoring.
        check(`${rel} unregisters through the batch route`,
            src.includes('/api/v1/unregister/batch') && src.includes('func ensure_unregistered('));
        check(`${rel} authors trauma zones through the batch route`,
            src.includes('/api/v1/trauma/batch') && src.includes('_trauma_queue'),
            'zones must be queued and flushed as a set, not sent one per request');
        check(`${rel} counts batch, individual and refused control requests`,
            src.includes('batched_unregistration_requests')
            && src.includes('batched_trauma_requests')
            && src.includes('individual_unregistration_requests'));
        check(`${rel} reports rejected teardown ids instead of dropping them silently`,
            src.includes('unregistration_rejections')
            && src.includes('agent_registration_failed.emit(rid, "unregister_rejected")'),
            'an unregister that silently does nothing leaves an agent live while the host believes it is gone');
        check(`${rel} counts rejected trauma zones so partial application is visible`,
            src.includes('trauma_zones_rejected'));
        check(`${rel} degrades to singular control requests on a 404`,
            src.includes('func _drain_to_legacy_control_queue()')
            && src.includes('batch_control_unsupported = true'),
            'a pre-batch server must still get the work, one item at a time');
        check(`${rel} keeps the sent batch in flight so a failure requeues exactly it`,
            src.includes('"zones": zones') && src.includes('func _requeue_trauma('),
            'reconstruction from a count would drop or duplicate zones');
        // The requeue is the fix for a real silent-drop defect: the queue head is
        // only popped AFTER HTTPRequest accepts the request.
        const pumpStart = src.indexOf('func _pump_control_plane()');
        const pumpBody = src.slice(pumpStart, src.indexOf('\nfunc ', pumpStart + 10));
        check(`${rel} retries a control request it could not start (no silent drop)`,
            pumpBody.indexOf('_registration_queue[0]') !== -1
            && pumpBody.indexOf('_registration_queue.pop_front()') > pumpBody.indexOf('if err != OK')
            && pumpBody.indexOf('_control_queue[0]') !== -1,
            'control requests must be popped only after request() succeeds');
    }

    // ---------------------------------------------------------------------
    console.log('\n--- 2. Appraisal-source router ---');
    const showcaseAgentSrc = read(SHOWCASE_AGENT);
    check('FearAgent declares an explicit appraisal source enum',
        /enum AppraisalSource\s*\{/.test(showcaseAgentSrc)
        && showcaseAgentSrc.includes('LOCAL_FALLBACK')
        && showcaseAgentSrc.includes('LIVE_SERVER'));
    check('FearAgent defaults to the offline fallback (no surprise live traffic)',
        /var appraisal_source: int = AppraisalSource\.LOCAL_FALLBACK/.test(showcaseAgentSrc));
    check('`appraise()` is the single routed entry point',
        showcaseAgentSrc.includes('func appraise(')
        && showcaseAgentSrc.includes('_submit_live_appraisal('));
    {
        // Live mode must return before any local evaluation. If it ever falls
        // through, the run silently becomes fallback evidence.
        const start = showcaseAgentSrc.indexOf('func appraise(');
        const body = showcaseAgentSrc.slice(start, showcaseAgentSrc.indexOf('\nfunc ', start + 10));
        const liveIdx = body.indexOf('_submit_live_appraisal(');
        const returnIdx = body.indexOf('return', liveIdx);
        const localIdx = body.indexOf('evaluate_local(');
        check('Live mode returns before reaching the local evaluator',
            liveIdx !== -1 && returnIdx !== -1 && localIdx !== -1 && returnIdx < localIdx,
            'a live appraisal must never fall through to the fallback');
    }
    check('Live mode records an unavailable session instead of falling back silently',
        showcaseAgentSrc.includes('live_unavailable = true')
        && !/if client == null:\s*\n\s*evaluate_local/.test(showcaseAgentSrc));
    check('Local-only channels are recorded, not swallowed, in live mode',
        showcaseAgentSrc.includes('live_ignored_local_channels')
        && showcaseAgentSrc.includes('_note_live_ignored('));
    check('The client is resolved lazily so an early build cannot strand an agent',
        showcaseAgentSrc.includes('func _resolve_client()'));

    // ---------------------------------------------------------------------
    console.log('\n--- 3. Server state is applied in full ---');
    {
        const start = showcaseAgentSrc.indexOf('func _on_state_received(');
        const body = showcaseAgentSrc.slice(start, showcaseAgentSrc.indexOf('\nfunc ', start + 10));
        check('The applied advisory includes raw fear, not just band and intent',
            body.includes('raw_fear') && body.includes('affective_state'),
            'reading only the band left the host fear value pinned at 0 in live mode');
        check('Local self-application is not counted as a live application',
            body.includes('_applying_local_state') && showcaseAgentSrc.includes('_applying_local_state = true'));
    }

    // ---------------------------------------------------------------------
    console.log('\n--- 4. Host agent routes through the router ---');
    const hostSrc = read(SHOWCASE_HOST);
    check('ShowcaseAgent appraises through the router, never the evaluator directly',
        hostSrc.includes('fear_component.appraise(') && !hostSrc.includes('.evaluate_local('));
    check('ShowcaseAgent can publish host-authored perception for one frame',
        hostSrc.includes('func set_perceived_stimuli(')
        && hostSrc.includes('_has_perceived_stimuli_override'));
    check('The perception override is consumed, so it cannot go stale',
        /_has_perceived_stimuli_override = false/.test(hostSrc));
    check('ShowcaseAgent exposes a live-mode query and a source setter',
        hostSrc.includes('func is_live()') && hostSrc.includes('func set_appraisal_source('));
    {
        // Defect 3: identity/traits/source must be synced on every call, not
        // only when the component is first constructed.
        const start = hostSrc.indexOf('func _init_fear_component()');
        const body = hostSrc.slice(start, hostSrc.indexOf('\nfunc ', start + 10));
        const addIdx = body.indexOf('add_child(fear_component)');
        const idIdx = body.indexOf('fear_component.agent_id = agent_name');
        const srcIdx = body.indexOf('fear_component.set_appraisal_source(');
        check('Identity, traits, and source are synced AFTER the component is created',
            addIdx !== -1 && idIdx > addIdx && srcIdx > addIdx,
            'syncing only inside the null check left every agent sharing the id "agent"');
        check('Identity is derived from the agent name when one is set',
            body.includes('if not agent_name.is_empty():'));
    }

    // ---------------------------------------------------------------------
    console.log('\n--- 5. Stations publish world state, not fear state ---');
    const controllerSrc = read(STATION_CONTROLLER);
    check('The station controller no longer evaluates the fallback directly',
        !controllerSrc.includes('.evaluate_local('),
        'stations must publish perception and let the appraisal source decide');
    check('The controller can switch every station agent to live mode',
        controllerSrc.includes('func configure_appraisal_source(')
        && controllerSrc.includes('func is_live()')
        && controllerSrc.includes('func _all_agents()'));
    check('Newly created station agents inherit the configured source',
        /ag\.appraisal_source = appraisal_source/.test(controllerSrc));
    check('Station 3 seeds live panic through the protocol, not by writing fear',
        controllerSrc.includes('S3_LIVE_SEED_TICKS')
        && /if is_live\(\):\s*\n\s*# The server owns fear state/.test(controllerSrc)
        && controllerSrc.includes('agitator_terror'));
    check('Station 3 still keeps its local-mode seed for the offline demo',
        controllerSrc.includes('current_fear_band = "PANIC"'));
    check('Station 4 does not subtract fear itself in live mode',
        /if not is_live\(\):\s*\n\s*soldier\.fear_component\.current_raw_fear/.test(controllerSrc));
    check('Station 5 does not overwrite the server vector in live mode',
        /if not is_live\(\):\s*\n\s*var repel_dir/.test(controllerSrc));
    check('Stations 1 and 4 publish their own perception at the showcase scene scale',
        controllerSrc.includes('predator_stalker') && controllerSrc.includes('platoon_threat'),
        'the component default threat radius is far below this scene scale');

    // ---------------------------------------------------------------------
    console.log('\n--- 6. Packaged adapter registers too ---');
    const packagedAgentSrc = read(PACKAGED_AGENT);
    check('The transport-only packaged agent registers before it reports',
        packagedAgentSrc.includes('ensure_registered(')
        && packagedAgentSrc.includes('_trait_payload()'));
    check('The packaged agent says plainly that it has no fallback',
        /TRANSPORT-ONLY variant/.test(packagedAgentSrc));

    // ---------------------------------------------------------------------
    console.log('\n--- 7. The live suite is real and wired ---');
    const liveSrc = read(LIVE_SUITE);
    check('Live suite drives the real station controller',
        liveSrc.includes('STATION_CONTROLLER.new()')
        && liveSrc.includes('configure_appraisal_source('));
    check('Live suite configures LIVE_SERVER before the stations are built',
        liveSrc.indexOf('configure_appraisal_source(') < liveSrc.indexOf('add_child(controller)'));
    check('Live suite asserts the fallback was never used anywhere',
        liveSrc.includes('local_evaluations == 0') || liveSrc.includes('total_local == 0'));
    check('Live suite asserts no observation was dropped for an unregistered agent',
        liveSrc.includes('dropped_unregistered_observations'));
    check('Live suite asserts registration was actually batched',
        liveSrc.includes('batched_registration_requests')
        && liveSrc.includes('batch_registration_unsupported'));
    check('Live suite asserts batch round trips stayed below the agent count',
        /batch_calls \+ individual_calls < agents\.size\(\)/.test(liveSrc));
    check('Live suite counts individual registrations as evidence, not assumption',
        liveSrc.includes('individual_registration_requests'));
    check('Live suite asserts the host carries a stable session identity',
        liveSrc.includes('not client.session_id.is_empty()'));
    check('Live suite asserts the server issued a token, not just a name',
        liveSrc.includes('client.session_token_issued')
        && liveSrc.includes('not client.session_token.is_empty()'),
        'a name is a label; the token is the credential');
    check('Live suite asserts trauma authoring was batched, not one request per zone',
        liveSrc.includes('client.batched_trauma_requests'));
    check('Live suite authors MORE than one zone per batch',
        liveSrc.includes('add_trauma_zones([')
        && /trauma_zones_added >= 3/.test(liveSrc),
        'a batch of one would not prove the route carries a set');
    check('Live suite asserts batch teardown used no individual requests',
        liveSrc.includes('individual_unregistration_requests == 0'));
    check('Live suite asserts no claim was refused by a rival session',
        liveSrc.includes('refused_claims == 0'));
    check('Live suite asserts the legacy control fallback was not needed',
        liveSrc.includes('batch_control_unsupported'),
        'silent degradation to singular requests would look like success');
    check('Live suite would fail rather than pass without a live session',
        liveSrc.includes('no live session, so no live evidence'));
    check('Live suite has a watchdog so a script error cannot hang the evidence run',
        liveSrc.includes('WATCHDOG_PHYSICS_FRAMES'));
    check('Live suite names the port-collision symptom explicitly',
        liveSrc.includes('A non-FearServer process may be holding port'));

    const runnerSrc = read(EVIDENCE_RUNNER);
    check('The evidence runner executes the live suite against a server',
        runnerSrc.includes("run_showcase_live_conformance.gd")
        && /run_showcase_live_conformance\.gd[\s\S]{0,120}needsServer:\s*true/.test(runnerSrc));
    check('The evidence runner skips rather than passes without a Godot binary',
        runnerSrc.includes('SKIPPED'));

    console.log('\n============================================================');
    console.log(`SUCCESS: All ${PASS} Godot live-pipeline wiring assertions PASSED.`);
    console.log('Scope: source-level wiring only. Execution evidence is `npm run godot:evidence`');
    console.log('(headless). No server-semantics, rendering, or host-game claim.');
    console.log('============================================================\n');
}

main();
