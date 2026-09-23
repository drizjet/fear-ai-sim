import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

// RESP-EVENT-GRAPH-AUDIT-001 — one pass validates the whole event graph: unique ids,
// contiguous seq mirroring eventSeq, resolvable parents, ordered parentage (seq + tick).
// Mutants pinned: parent-seq ordering check removed.

const mixedWorld = () => {
    const society = new SocietyCore({ seed: 21 });
    society.routes = new RouteNetwork([{ id: 'road', travelTime: 2 }]);
    society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 20 } }));
    society.addMarket('city', new Market({ prices: { grain: 9 }, stock: { grain: 0 } }));
    society.addSettlement('town', { population: 1000, resources: 50 });
    const rumor = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 4, confidence: .9 });
    society.tick({ actions: [
        { kind: 'ROUTE_OBSERVATION', actorId: 'observer', routeId: 'road', observation: { perceivedDanger: .5, confidence: 1 } },
        { kind: 'DECISION', actorId: 'observer', context: { actorId: 'observer' }, actions: [{ id: 'rest', considerations: [{ name: 'calm', value: 1 }] }] },
        { kind: 'RUMOR_QUEUE', rumor, recipient: { id: 'buyer', delay: 0 }, delay: 0 },
        { kind: 'RUMOR_DELIVER', recipients: [{ id: 'buyer', delay: 0 }] },
    ] });
    society.tick({ actions: [
        { kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', minimumPrice: 1, routes: society.routes.edges, actorId: 'observer' },
        { kind: 'MORALE_UPDATE', actorId: 'observer', victories: 10 },
        { kind: 'ADVISORY_VALIDATION', proposal: { action: 'greet' }, actor: { id: 'observer', type: 'SCOUT' }, target: { id: 'buyer', type: 'TRADER' }, context: { trust: .6 } },
    ] });
    return society;
};

describe('RESP-EVENT-GRAPH-AUDIT-001: whole-history event graph audit', () => {
    it('passes on a healthy mixed world', () => {
        const society = mixedWorld();
        const report = society.auditEventGraph();
        expect(report.violations).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.checked).toBe(society.events.length);
        expect(report.eventSeq).toBe(society.events.length);
        expect(report.roots).toBeGreaterThanOrEqual(2);
        expect(society.events.filter(event => event.parentId == null).every(event => event.type === 'TURN')).toBe(true);
    });

    it('passes on an empty world and on a deserialized world', () => {
        expect(new SocietyCore().auditEventGraph()).toMatchObject({ ok: true, checked: 0, roots: 0 });
        const society = mixedWorld();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const report = restored.auditEventGraph();
        expect(report.ok).toBe(true);
        expect(report.checked).toBe(society.events.length);
    });

    it('detects a dangling parent', () => {
        const society = mixedWorld();
        society.events.push({ id: 'evt-forged', seq: society.eventSeq + 1, tick: society.time, type: 'FORGED', parentId: 'evt-ghost' });
        society.eventSeq += 1;
        const report = society.auditEventGraph();
        expect(report.ok).toBe(false);
        expect(report.violations.map(violation => violation.kind)).toContain('DANGLING_PARENT');
    });

    it('detects parentage order violations and tick regressions', () => {
        const society = mixedWorld();
        const [root] = society.events;
        const rootTick = root.tick;
        const last = society.events.at(-1);

        root.parentId = last.id; // parent with a LATER seq
        expect(society.auditEventGraph().violations.map(violation => violation.kind)).toContain('PARENT_SEQ_ORDER');

        root.parentId = null; // restore parentage
        const child = society.events[1];
        root.tick = child.tick + 5; // parent tick after the child
        expect(society.auditEventGraph().violations.map(violation => violation.kind)).toContain('PARENT_TICK_ORDER');

        root.tick = rootTick; // restore
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('detects duplicate ids and eventSeq mirror drift, restoring to clean', () => {
        const society = mixedWorld();
        society.events.push({ ...society.events[0], parentId: null });
        society.eventSeq += 1;
        const report = society.auditEventGraph();
        expect(report.ok).toBe(false);
        expect(report.violations.map(violation => violation.kind)).toContain('DUPLICATE_ID');

        society.events.pop();
        society.eventSeq -= 1;
        society.eventSeq += 1; // mirror drift only: counter ahead of history
        expect(society.auditEventGraph().violations.map(violation => violation.kind)).toContain('SEQ_MIRROR');

        society.eventSeq -= 1; // restore
        expect(society.auditEventGraph().ok).toBe(true);
    });
});
