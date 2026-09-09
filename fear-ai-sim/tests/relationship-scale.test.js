import { RelationshipTensorSystem } from '../packages/core/src/RelationshipTensorSystem.js';

// Section NOW-6: relationship-scale budgets. The tensor is sparse nested
// Maps with a per-agent cap (no N-squared storage); tick() walks stored
// edges only. All assertions deterministic - no wall-clock budgets here
// (timing-sensitive budgets live in the serialized heavy gate by policy).
describe('NOW-6: relationship scale budgets', () => {
    it('Per-agent storage capped under dense demand (no N-squared blowup)', () => {
        const s = new RelationshipTensorSystem();
        const N = 100;
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                if (i !== j) s.getRelationship('a' + i, 'a' + j);
            }
        }
        let total = 0;
        for (const m of s.relationships.values()) {
            expect(m.size).toBeLessThanOrEqual(50);
            total += m.size;
        }
        // Requested ~10k directed edges; stored bounded by cap*N.
        expect(total).toBeLessThanOrEqual(50 * N);
    });

    it('tick() decay reaches every stored edge', () => {
        const s = new RelationshipTensorSystem();
        for (let i = 0; i < 50; i++) {
            const rel = s.getRelationship('hub', 't' + i);
            rel.grievance = 0.5;
        }
        s.tick(100);
        for (let i = 0; i < 50; i++) {
            expect(s.getRelationship('hub', 't' + i).grievance).toBeLessThan(0.5);
        }
    });

    it('purgeAgent removes inbound and outbound edges completely', () => {
        const s = new RelationshipTensorSystem();
        for (let i = 0; i < 20; i++) {
            s.getRelationship('gone', 't' + i);
            s.getRelationship('s' + i, 'gone');
        }
        s.purgeAgent('gone');
        expect(s.relationships.has('gone')).toBe(false);
        for (let i = 0; i < 20; i++) {
            expect(s.hasRelationship('s' + i, 'gone')).toBe(false);
        }
    });

    it('Pruning protects live grievances over stale familiarity', () => {
        const s = new RelationshipTensorSystem({ maxRelationshipsPerAgent: 5 });
        const grudge = s.getRelationship('solo', 'grudge');
        grudge.grievance = 0.9;
        grudge.familiarity = 0.0;
        for (let i = 0; i < 10; i++) {
            const r = s.getRelationship('solo', 'f' + i);
            r.familiarity = 0.8;
        }
        expect(s.relationships.get('solo').size).toBeLessThanOrEqual(5);
        expect(s.hasRelationship('solo', 'grudge')).toBe(true);
    });
});
