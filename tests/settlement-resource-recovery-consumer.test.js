import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('RESP-SETTLEMENT-RESOURCE-RECOVERY-CONSUMER-001', () => {
    it('consumes settlement resources and replenishes recovery budget', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { resources: 10, resourceCapacity: 20, recoveryBudget: 0 });
        society.tick({ actions: [{ kind: 'SETTLEMENT_RESOURCE_CONSUMPTION', settlement: 'town', quantity: 4, recoveryRate: .5 }] });
        expect(society.settlements.get('town')).toMatchObject({ resources: 6, recoveryBudget: 2 });
        expect(society.events.at(-1).parentId).toBe(society.events[0].id);
    });

    it('cannot consume more than available resources', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { resources: 2, recoveryBudget: 1 });
        society.tick({ actions: [{ kind: 'SETTLEMENT_RESOURCE_CONSUMPTION', settlement: 'town', quantity: 10, recoveryRate: 1 }] });
        expect(society.settlements.get('town')).toMatchObject({ resources: 0, recoveryBudget: 3 });
    });

    it('persists the consumer state across fresh deserialize', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { resources: 8, recoveryBudget: 1 });
        society.tick({ actions: [{ kind: 'SETTLEMENT_RESOURCE_CONSUMPTION', settlement: 'town', quantity: 3 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('mutation control leaves recovery unchanged when no resources exist', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { resources: 0, recoveryBudget: 1 });
        society.tick({ actions: [{ kind: 'SETTLEMENT_RESOURCE_CONSUMPTION', settlement: 'town', quantity: 10 }] });
        expect(society.settlements.get('town')).toMatchObject({ resources: 0, recoveryBudget: 1 });
    });
});
