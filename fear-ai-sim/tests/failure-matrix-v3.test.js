/**
 * @file failure-matrix-v3.test.js
 *
 * Sections CXXXVII-CXL + CCXX:
 * New chunk engines registered as degradable resilience modules.
 * Simultaneous faults must degrade to fallbacks without touching core.
 */

import { SubsystemResilienceHarness } from '../packages/core/index.js';
import {
    InformationPropagationEngine, AnticipatoryFearEngine,
    RetaliationModel, CharacterIdentityArchitecture
} from '../packages/core/index.js';

function wiredHarness() {
    const h = new SubsystemResilienceHarness();
    const net = new InformationPropagationEngine({}, 11);
    net.registerAgent('elder', 0.8);
    net.registerAgent('scout', 0.5);
    net.addListenEdge('scout', 'elder');
    const dread = new AnticipatoryFearEngine();
    const retaliation = new RetaliationModel();
    const arch = new CharacterIdentityArchitecture();
    arch.registerCharacter('guard', { neuroticism: 0.3, resilience: 0.8 });
    // Core: identity decision (critical path, never injected).
    h.registerModule('core', (ctx) => arch.tick('guard', {}, ctx.situation || {}).tendencies.stand,
        { version: '1.0.0', critical: true, fallback: 0.5 });
    // Optional chunk modules with neutral fallbacks.
    h.registerModule('rumor', () => {
        net.injectRumor('ROAD_AMBUSH', 'Ambush ahead', 'elder', { confidence: 0.8 });
        net.advanceTick();
        return net.heldBy('scout').length > 0 ? 0.1 : 0;
    }, { version: '1.0.0', fallback: 0 });
    h.registerModule('dread', () => {
        dread.absorb('ROAD', 'north_road', { confidence: 0.7, observed: false, threatLevel: 0.7 });
        return dread.dreadOf('ROAD', 'north_road') * 0.1;
    }, { version: '1.0.0', fallback: 0 });
    h.registerModule('retaliation', () => {
        retaliation.provoke('a', 'b', 'RAID');
        return retaliation.recommend('a', 'b').level * 0.1;
    }, { version: '1.0.0', fallback: 0 });
    return h;
}

describe('Sections CXXXVII-CXL + CCXX: Failure Matrix V3', () => {
    test('1. All optional modules healthy: contributions flow', () => {
        const h = wiredHarness();
        const res = h.tick({ situation: { fear: 0.4, perceivedDanger: 0.4 } });
        expect(res.coreAlive).toBe(true);
        expect(res.perModule.every((m) => m.status === 'OK')).toBe(true);
        expect(res.advisoryIntent.type).toBeDefined();
    });

    test('2. Simultaneous rumor plus dread plus retaliation failure degrades gracefully', () => {
        const h = wiredHarness();
        h.injectFailure('rumor', new Error('RUMOR_NET_PARTITION'));
        h.injectFailure('dread', new Error('DREAD_ORACLE_DOWN'));
        h.injectFailure('retaliation', new Error('GRIEVANCE_LEDGER_CORRUPT'));
        const res = h.tick({ situation: { fear: 0.4, perceivedDanger: 0.4 } });
        expect(res.coreAlive).toBe(true);
        expect(res.degraded).toBe(true);
        expect(res.failedModules.sort()).toEqual(['dread', 'retaliation', 'rumor']);
        expect(res.advisoryIntent).not.toBe(null);
    });

    test('3. Killing rumor mid-decision keeps core advisory alive (CCXX)', () => {
        const h = wiredHarness();
        const before = h.tick({ situation: { fear: 0.6, perceivedDanger: 0.6 } });
        h.injectFailure('rumor', new Error('RUMOR_MODULE_KILLED_DURING_FACTION_DECISION'));
        const during = h.tick({ situation: { fear: 0.6, perceivedDanger: 0.6 } });
        expect(during.coreAlive).toBe(true);
        expect(during.contributions.core).toBe(before.contributions.core);
        expect(during.advisoryIntent.type).toBe(before.advisoryIntent.type);
        h.clearFailure('rumor');
        const after = h.tick({ situation: { fear: 0.6, perceivedDanger: 0.6 } });
        expect(after.perModule.find((m) => m.name === 'rumor').status).toBe('OK');
    });

    test('4. Disabled modules use fallbacks without evaluation', () => {
        const h = wiredHarness();
        h.setEnabled('dread', false);
        const res = h.tick({});
        const dread = res.perModule.find((m) => m.name === 'dread');
        expect(dread.status).toBe('SKIPPED');
        expect(dread.fallbackUsed).toBe(true);
        expect(res.coreAlive).toBe(true);
    });

    test('5. Core injection refused; unknown modules rejected', () => {
        const h = wiredHarness();
        expect(() => h.injectFailure('core', new Error('X'))).toThrow(/critical core/i);
        expect(() => h.injectFailure('ghost', new Error('X'))).toThrow(/Unknown module/);
        expect(h.auditImmutability().isClean).toBe(true);
    });
});
