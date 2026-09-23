import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('persistent migration process', () => {
    it('moves population through an in-transit journey and arrives exactly once', () => {
        const society = new SocietyCore();
        society.addSettlement('north', { population: 10, capacity: 10 });
        society.addSettlement('south', { population: 2, capacity: 10 });
        society.tick({ actions: [{ kind: 'MIGRATION_BEGIN', id: 'journey-1', from: 'north', to: 'south', population: 4 }] });
        expect(society.settlements.get('north').population).toBe(6);
        expect(society.settlements.get('south').population).toBe(2);
        expect(society.migrationJourneys.get('journey-1').status).toBe('IN_TRANSIT');
        society.tick({ actions: [{ kind: 'MIGRATION_SETTLE', id: 'journey-1', outcome: 'ARRIVED' }] });
        expect(society.settlements.get('north').population + society.settlements.get('south').population).toBe(12);
        expect(society.settlements.get('south').population).toBe(6);
        expect(() => society.settleMigration('journey-1')).toThrow(/already settled/);
        const begin = society.events.find(event => event.type === 'MIGRATION_BEGIN');
        const settle = society.events.find(event => event.type === 'MIGRATION_SETTLE');
        expect(begin.parentId).toBe(society.events.find(event => event.type === 'TURN').id);
        expect(settle.parentId).toBe(society.events.find(event => event.type === 'TURN' && event.tick === settle.tick).id);
    });

    it('rejects over-capacity and over-source migrations without changing population', () => {
        const society = new SocietyCore();
        society.addSettlement('a', { population: 2, capacity: 2 });
        society.addSettlement('b', { population: 10, capacity: 10 });
        expect(society.beginMigration({ id: 'too-many', from: 'a', to: 'b', population: 3 })).toBeNull();
        expect(society.beginMigration({ id: 'too-full', from: 'a', to: 'b', population: 1 })).toBeNull();
        expect(society.settlements.get('a').population).toBe(2);
        expect(society.settlements.get('b').population).toBe(10);
    });

    it('restores an in-transit journey across save/load', () => {
        const society = new SocietyCore();
        society.addSettlement('a', { population: 5, capacity: 5 });
        society.addSettlement('b', { population: 0, capacity: 5 });
        society.beginMigration({ id: 'journey-save', from: 'a', to: 'b', population: 2 });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.migrationJourneys.get('journey-save').status).toBe('IN_TRANSIT');
        restored.settleMigration('journey-save', 'ARRIVED');
        expect(restored.settlements.get('a').population + restored.settlements.get('b').population).toBe(5);
    });
});
