// tests/planted-defect-runtime.test.js
//
// EVID-2026-08-29-MUTATION-VERIFICATION (Guardian V3 §3 Movement B)
//
// Proves the runtime tests can detect the double-ticking defect
// (manual tickClosedWorld after runClosedWorldStep). The planted
// defect is a real runClosedWorldStep that invokes the canonical
// reducer twice per tick. The test must go RED under the
// planted defect.
//
// This test does NOT modify production code. It uses a
// temporary subclass of Simulation with a planted defect.

import { describe, it, expect } from '@jest/globals';
import { Simulation } from '../simulation.js';
import { tickClosedWorld } from '../closed-world.js';
import { tickMerchant } from '../canonical-trade-system.js';

function makeMockCanvas() {
    return {
        width: 800, height: 600,
        getContext: () => ({ getContext: () => null, fillRect: () => {}, clearRect: () => {}, drawImage: () => {}, save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, fill: () => {}, stroke: () => {}, arc: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }) }),
        parentElement: { appendChild: () => {}, removeChild: () => {} },
        addEventListener: () => {}, removeEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    };
}

describe('planted defect: double ticking (Guardian V3 §3)', () => {

    it('MERCHANT_ROUTE_DECISION fires exactly once per tick under the production path', () => {
        // Contract: TRADE.RUNTIME.NO_DOUBLE_EXECUTION
        // Expected: exactly one MERCHANT_ROUTE_DECISION per tick.
        // Planted defect: the simulation runs the canonical
        // reducer twice per runClosedWorldStep call. The test
        // must detect this by counting events per tick.
        //
        // Note: `runClosedWorldStep` returns a snapshot of ALL
        // events accumulated so far. We must count only the
        // events with the current tick, not accumulate across
        // snapshots.
        const sim = new Simulation(makeMockCanvas(), { initialPopulation: 0 });
        sim.configureClosedWorld();
        const step1 = sim.runClosedWorldStep({ perceivedDanger: 0.5 });
        const step1Decisions = step1.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION' && e.tick === step1.tick);
        // Production path: exactly one per tick.
        expect(step1Decisions.length).toBe(1);
    });

    it('tickHistory has exactly N entries after N runClosedWorldStep calls', () => {
        const sim = new Simulation(makeMockCanvas(), { initialPopulation: 0 });
        sim.configureClosedWorld();
        for (let i = 0; i < 5; i++) {
            sim.runClosedWorldStep({ perceivedDanger: 0.5 });
        }
        // Production path: exactly 5 entries.
        expect(sim.closedWorld.tickHistory).toHaveLength(5);
    });

    it('planted defect simulation fires MERCHANT_ROUTE_DECISION twice per tick', () => {
        // Build a planted-defect subclass that re-invokes
        // tickMerchant a second time, simulating the
        // "double ticking" defect the V3 §C2 names.
        // The planted defect must be detected: under it,
        // the production path produces 2+ route decisions
        // per tick instead of 1.
        class PlantedDefectSim extends Simulation {
            runClosedWorldStep(options) {
                // Planted defect: invoke tickMerchant BEFORE
                // the canonical step, with the same tick the
                // canonical step will use. This simulates the
                // old double-call (once in step 2.5, once
                // in step 7.5). Both calls land in the same
                // event log snapshot for the same tick.
                this.closedWorldTick = (this.closedWorldTick || 0);
                if (this.closedWorld.merchants?.[0]) {
                    tickMerchant(this.closedWorld, this.closedWorld.merchants[0].id, {
                        tick: this.closedWorldTick + 1,
                        rng: (() => { let s = (this.closedWorldTick * 0x9E3779B9) >>> 0; return () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296; })()
                    });
                }
                const result = super.runClosedWorldStep(options);
                return result;
            }
        }
        const sim = new PlantedDefectSim(makeMockCanvas(), { initialPopulation: 0 });
        sim.configureClosedWorld();
        const step1 = sim.runClosedWorldStep({ perceivedDanger: 0.5 });
        const step1Decisions = step1.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION' && e.tick === step1.tick);
        // The planted defect: 2+ decisions per tick.
        expect(step1Decisions.length).toBeGreaterThan(1);
    });
});
