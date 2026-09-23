import { describe, expect, it } from '@jest/globals';
import { RumorNetwork, SocietyCore } from '../societycore.js';

describe('RESP-EVENT-ID-AUTHORITY-001: monotonic rumor identity', () => {
    it('issues monotonic unique ids instead of array-length template ids', () => {
        const net = new RumorNetwork();
        const r1 = net.publish({ claim: 'a' });
        const r2 = net.publish({ claim: 'b' });
        expect(r1.id).toBe('rumor-1');
        expect(r2.id).toBe('rumor-2');
        expect(new Set(net.rumors.map(r => r.id)).size).toBe(2);
    });

    it('rejects duplicate explicit ids', () => {
        const net = new RumorNetwork();
        net.publish({ id: 'rumor-custom', claim: 'a' });
        expect(() => net.publish({ id: 'rumor-custom', claim: 'b' })).toThrow(/Duplicate rumor id/);
    });

    it('does not let explicit ids advance or collide with the monotonic counter', () => {
        const net = new RumorNetwork();
        net.publish({ id: 'rumor-royal', claim: 'a' }); // explicit: seq stays 0
        const auto = net.publish({ claim: 'b' });       // auto: seq 1 -> rumor-1
        expect(auto.id).toBe('rumor-1');
        net.publish({ claim: 'c' });                    // seq 2 -> rumor-2
        expect(net.seq).toBe(2);
        expect(() => net.publish({ id: 'rumor-1', claim: 'd' })).toThrow(/Duplicate rumor id/);
    });

    it('does not let an explicit id inside the auto namespace poison the counter', () => {
        const net = new RumorNetwork();
        net.publish({ id: 'rumor-1', claim: 'reserved' }); // explicit reservation: seq stays 0
        const auto = net.publish({ claim: 'auto' });       // must skip rumor-1, not throw Duplicate
        expect(auto.id).toBe('rumor-2');
        expect(net.seq).toBe(2);
        const ids = net.rumors.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        // the poisoned-counter mutant (old behavior) throws 'Duplicate rumor id' on the auto publish above.
    });

    it('keeps id sequences monotonic after save/load restore (no template-id collision)', () => {
        const society = new SocietyCore();
        const first = society.rumors.publish({ id: 'rumor-custom', claim: 'a' }); // does not consume seq
        society.rumors.publish({ claim: 'b' }); // seq 1 -> rumor-1
        const clone = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(clone.rumors.seq).toBe(1);
        const next = clone.rumors.publish({ claim: 'c' });
        // Array-length-as-id mutant would emit 'rumor-3' (array length 2 + 1), colliding with the custom id namespace.
        expect(next.id).toBe('rumor-2');
        const ids = clone.rumors.rumors.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});