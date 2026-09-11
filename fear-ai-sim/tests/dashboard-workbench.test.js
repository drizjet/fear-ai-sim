import { describe, it, expect } from '@jest/globals';
import { DesignerDashboardServer } from '../packages/runtime/src/DesignerDashboardServer.js';

// NEXT-122: workbench page endpoints (CCI-28 frontier 6). Handlers are
// invoked directly (no socket bind) so these tests stay green where the
// sandbox denies loopback binds (the pre-existing dashboard EACCES class).
describe('NEXT-122: dashboard workbench pages', () => {
    const server = new DesignerDashboardServer();
    const callHandler = (fn, body) => new Promise((resolve, reject) => {
        const res = {
            writeHead() {},
            end(data) {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error(`non-JSON response: ${String(data).slice(0, 160)}`));
                }
            }
        };
        try {
            fn.call(server, body, res);
        } catch (err) {
            reject(err);
        }
    });
    const callGet = (fn) => new Promise((resolve, reject) => {
        const res = {
            writeHead() {},
            end(data) {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error(`non-JSON response: ${String(data).slice(0, 160)}`));
                }
            }
        };
        try {
            fn.call(server, res);
        } catch (err) {
            reject(err);
        }
    });

    it('1. Memory explorer ranks ambush recall first', async () => {
        const data = await callHandler(server._handleMemory, { ticks: 2 });
        expect(data.topRecall).toBe('SURVIVED_AMBUSH');
        expect(data.evaluated).toBeGreaterThanOrEqual(4);
        expect(data.ranked[0].score).toBeGreaterThan(data.ranked[data.ranked.length - 1].score);
    });

    it('2. Relationship graph proves directed asymmetry', async () => {
        const data = await callHandler(server._handleRelationships, {});
        expect(data.asymmetric).toBe(true);
        expect(data.guardToCaptain.trust).toBeGreaterThan(data.captainToGuard.trust);
        expect(data.captainToGuard.grievance).toBeGreaterThan(data.guardToCaptain.grievance);
    });

    it('3. Causal graph traces mobilization to the monster attack', async () => {
        const data = await callHandler(server._handleCausal, {});
        expect(data.nodes).toBe(4);
        expect(data.rootIds).toContain('monster_attack');
        expect(typeof data.narrative).toBe('string');
    });

    it('4. Trade map shows live observation-driven reroute', async () => {
        const data = await callGet(server._handleTradeMap);
        expect(data.roads['road-a'].source).toBe('observation');
        expect(data.roads['road-a'].perceivedDanger).toBeGreaterThan(0.5);
        expect(data.selectedRoute).not.toBe('road-a');
    });

    it('5. Performance reports per-subsystem timings', async () => {
        const data = await callGet(server._handlePerformance);
        expect(data.agents).toBe(200);
        expect(data.affectMsPerAgent).toBeGreaterThanOrEqual(0);
        expect(data.ciaMsPerDecision).toBeGreaterThanOrEqual(0);
        expect(data.arbitrationMsPerDecision).toBeGreaterThanOrEqual(0);
    });

    it('6. Served HTML contains all ten workbench tabs', async () => {
        const html = await new Promise((resolve) => {
            server._serveDashboardHtml({ writeHead() {}, end: (h) => resolve(h) });
        });
        for (const tab of ['explain-tab', 'personas-tab', 'factions-tab', 'lod-tab', 'replay-tab',
            'memory-tab', 'relations-tab', 'causal-tab', 'trade-tab', 'perf-tab']) {
            expect(html).toContain(`id="${tab}"`);
        }
    });
});
