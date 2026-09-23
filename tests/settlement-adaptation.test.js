import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-SETTLEMENT-ADAPTATION-001', () => {
    const setup = () => {
        const society = new SocietyCore();
        society.addSettlement('town', { recoveryBudget: 10 });
        society.addInfrastructure('bridge', { condition: 0 });
        society.addMarket('town-market', new Market({ prices: { grain: 8 }, stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', available: false }]);
        return society;
    };

    it('converts bounded stress and budget into recovery and route restoration', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'town-market', routeId: 'road', investment: 10 }] });
        const event = society.events.at(-1);
        expect(event).toMatchObject({ type: 'SETTLEMENT_ADAPTATION', investment: 10, condition: .5, adaptation: .5, recoveryBudget: 0 });
        expect(society.infrastructure.get('bridge').condition).toBe(.5);
        expect(society.routes.edges[0].available).toBe(true);
        expect(event.parentId).toBe(society.events[0].id);
    });

    it('does not create material or exceed bounded adaptation when budget is empty', () => {
        const society = setup();
        society.settlements.get('town').recoveryBudget = 0;
        const before = society.markets.get('town-market').balanceSheet();
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'town-market', routeId: 'road', investment: 10 }] });
        expect(society.settlements.get('town').adaptation).toBe(0);
        expect(society.infrastructure.get('bridge').condition).toBe(0);
        expect(society.markets.get('town-market').balanceSheet()).toEqual(before);
    });

    it('persists adaptation and infrastructure state across fresh deserialize', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'town-market', routeId: 'road', investment: 4 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
        expect(restored.settlements.get('town').adaptation).toBe(.2);
    });

    it('mutation control proves recovery depends on the stress-funded investment', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'SETTLEMENT_ADAPTATION', settlement: 'town', infrastructure: 'bridge', market: 'town-market', routeId: 'road', investment: 0 }] });
        expect(society.infrastructure.get('bridge').condition).toBe(0);
        expect(society.routes.edges[0].available).toBe(false);
        expect(society.events.at(-1).investment).toBe(0);
    });
});
