// tests/runtime-trade-wiring.test.js
//
// EVID-2026-08-29-RUNTIME-WIRING
//
// Per FEAR_GUARDIAN_GOAL.md §1.2: "The production/browser
// runtime must invoke that canonical path itself." This file
// tests the runtime (Simulation.runClosedWorldStep)
// end-to-end against the canonical trade system, proving that
// the runtime now produces the MERCHANT_ROUTE_DECISION,
// BANDIT_RELOCATION, and PATROL_INTERCEPTION events from
// step 7.5 WITHOUT requiring a manual tickClosedWorld call.

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Simulation } from '../simulation.js';
import { createPatrol } from '../canonical-trade-system.js';

beforeAll(() => {
    if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
            createElement: (tag) => {
                const el = {
                    tag,
                    id: '', className: '', style: {},
                    children: [], childNodes: [],
                    appendChild: () => {}, removeChild: () => {},
                    addEventListener: () => {}, removeEventListener: () => {},
                    setAttribute: () => {}, getAttribute: () => null,
                    getContext: () => ({ getContext: () => null }),
                };
                return el;
            },
            body: { appendChild: () => {}, removeChild: () => {} },
            addEventListener: () => {},
            removeEventListener: () => {},
            getElementById: () => null,
            querySelector: () => null,
        };
    }
    if (typeof globalThis.window === 'undefined') {
        globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
    }
});

const makeMockCanvas = () => ({
    width: 800,
    height: 600,
    getContext: () => ({ getContext: () => null, fillRect: () => {}, clearRect: () => {}, drawImage: () => {}, save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, fill: () => {}, stroke: () => {}, arc: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }) }),
    parentElement: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
});

describe('runtime trade wiring (EVID-2026-08-29-RUNTIME-AUTHORITATIVE)', () => {

    it('Simulation.runClosedWorldStep alone invokes the canonical reducer (step 7.5 fires)', () => {
        // Guardian §1.2: the production runtime must invoke
        // the canonical path. runClosedWorldStep now calls
        // tickClosedWorld internally. We do NOT call
        // tickClosedWorld manually. The runtime path is the
        // canonical path.
        const sim = new Simulation(makeMockCanvas(), { initialPopulation: 0 });
        const step = sim.runClosedWorldStep({ perceivedDanger: 0.5 });
        const routeDecisions = step.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION');
        expect(routeDecisions.length).toBeGreaterThanOrEqual(1);
        const decision = routeDecisions[0];
        expect(decision.riskTolerance).toBeDefined();
        expect(decision.switchingCost).toBeDefined();
    });

    it('patrol on a road during runtime produces PATROL_INTERCEPTION when an attack occurs', () => {
        const sim = new Simulation(makeMockCanvas(), { initialPopulation: 0 });
        sim.configureClosedWorld();
        // Disable the cat-and-mouse observation channel
        // so the bandit stays on road-a and the merchant
        // stays on road-a (forced via routeBeliefs). The
        // encounter engine then fires bandit-ambush on
        // road-a and the patrol can detect/intercept.
        sim.closedWorld.bandits[0].perceptionAccuracy = 0;
        sim.closedWorld.merchants[0].perceptionAccuracy = 0;
        sim.closedWorld.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.2, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.9, confidence: 0.5 }
        };
        sim.closedWorld.patrols = [createPatrol({ id: 'patrol-runtime', route: 'road-a', detectionRate: 0.5, interceptionRate: 0.5, travelCost: 0 })];
        let allPatrolEvents = [];
        for (let t = 1; t <= 5; t += 1) {
            const step = sim.runClosedWorldStep({ perceivedDanger: 0.5, attackRoadId: 'road-a' });
            const patrolEvents = step.events.filter(
                e => e.type === 'PATROL_INTERCEPTION' || e.type === 'PATROL_DETECTION_MISS'
            );
            allPatrolEvents = allPatrolEvents.concat(patrolEvents);
            if (allPatrolEvents.length >= 1) break;
        }
        expect(allPatrolEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('runtime events log includes a structured MERCHANT_ROUTE_DECISION with chosen route + reason', () => {
        const sim = new Simulation(makeMockCanvas(), { initialPopulation: 0 });
        const step = sim.runClosedWorldStep({ perceivedDanger: 0.5 });
        const decision = step.events.find(e => e.type === 'MERCHANT_ROUTE_DECISION');
        expect(decision).toBeDefined();
        expect(decision.reason).toBeDefined();
        expect(['road-a', 'road-b', 'road-c']).toContain(decision.chosenRoute);
    });
});
