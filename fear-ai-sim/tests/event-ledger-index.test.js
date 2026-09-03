import { describe, expect, test } from '@jest/globals';
import {
    appendWorldEvent,
    createClosedWorldScenario,
    findLatestWorldEvent,
    getWorldEvents,
    loadWorld,
    saveWorld,
} from '../closed-world.js';

describe('incremental event-ledger index', () => {
    test('indexes canonical events and keeps exact-tick/range results in ledger order', () => {
        const world = createClosedWorldScenario();
        const first = appendWorldEvent(world, { type: 'TEST_EVENT', tick: 2, label: 'first' }, []);
        const second = appendWorldEvent(world, { type: 'OTHER_EVENT', tick: 1, label: 'second' }, []);
        const third = appendWorldEvent(world, { type: 'TEST_EVENT', tick: 1, label: 'third' }, []);

        expect(getWorldEvents(world, { type: 'TEST_EVENT' })).toEqual([first, third]);
        expect(getWorldEvents(world, { type: 'TEST_EVENT', tick: 1 })).toEqual([third]);
        expect(getWorldEvents(world, { types: ['TEST_EVENT', 'OTHER_EVENT'], minTick: 1, maxTick: 2 }))
            .toEqual([first, second, third]);
        expect(findLatestWorldEvent(world, event => event.label !== 'first', 'TEST_EVENT')).toBe(third);
    });

    test('catches legacy direct pushes without requiring producers to adopt the helper', () => {
        const world = createClosedWorldScenario();
        const first = appendWorldEvent(world, { type: 'TEST_EVENT', tick: 1, label: 'indexed' }, []);
        const legacy = { type: 'TEST_EVENT', tick: 2, label: 'legacy' };
        world.events.push(legacy);

        expect(getWorldEvents(world, { type: 'TEST_EVENT', tick: 2 })).toEqual([legacy]);
        expect(legacy.eventId).toMatch(/^WORLD-EVENT-\d+$/);
        expect(findLatestWorldEvent(world, () => true, 'TEST_EVENT')).toBe(legacy);
        expect(first.eventId).not.toBe(legacy.eventId);
    });

    test('does not add index state to the serialized world', () => {
        const world = createClosedWorldScenario();
        appendWorldEvent(world, { type: 'TEST_EVENT', tick: 1 }, []);
        const loaded = loadWorld(saveWorld(world));

        expect(saveWorld(loaded)).toBe(saveWorld(world));
        expect(Object.keys(world)).not.toContain('closedWorldEventLedgerState');
        expect(Object.keys(loaded)).not.toContain('closedWorldEventLedgerState');
        expect(getWorldEvents(loaded, { type: 'TEST_EVENT' })).toHaveLength(1);
    });
});
