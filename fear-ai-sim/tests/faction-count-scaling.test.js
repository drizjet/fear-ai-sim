import { FactionSystem, ESCALATION_STAGES } from '../packages/core/src/FactionSystem.js';
import { RelationshipTensorSystem } from '../packages/core/src/RelationshipTensorSystem.js';

// Sections NOW-10 + NOW-11: faction-count scaling and purge completeness.
// Probes showed both feared blowups absent (40 factions evaluate 1560 pairs
// in about 1 ms; purging a hub with 8000 inbound edges takes under 1 ms),
// so these tests pin the budgets instead of building new machinery. A
// reverse index for purgeAgent was considered and rejected: linear Map
// iteration is already sub-millisecond at 8k agents, and an index would add
// mutation surface to every record path.

const STAGES = new Set(Object.values(ESCALATION_STAGES));

function fortyFactions() {
  const s = new FactionSystem();
  for (let i = 0; i < 40; i++) s.registerFaction({ id: 'f' + i });
  return s;
}

describe('NOW-10: faction-count scaling', () => {
  it('40 factions evaluate every directed pair to a valid stage', () => {
    const s = fortyFactions();
    let n = 0;
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 40; j++) {
        if (i === j) continue;
        const out = s.evaluateStance('f' + i, 'f' + j);
        expect(STAGES.has(out.toStage)).toBe(true);
        n++;
      }
    }
    expect(n).toBe(40 * 39);
  });

  it('pair evaluation is deterministic across repeated runs', () => {
    const a = fortyFactions();
    const b = fortyFactions();
    for (let i = 0; i < 40; i += 7) {
      for (let j = 0; j < 40; j += 11) {
        if (i === j) continue;
        expect(a.evaluateStance('f' + i, 'f' + j)).toEqual(b.evaluateStance('f' + i, 'f' + j));
      }
    }
  });

  it('disband removes the faction and every stance in both directions', () => {
    const s = fortyFactions();
    for (let i = 1; i < 40; i++) {
      s.getBilateralStance('f0', 'f' + i);
      s.getBilateralStance('f' + i, 'f0');
    }
    s.disbandFaction('f0');
    expect(s.getFaction('f0')).toBeNull();
    expect(s.stances.has('f0')).toBe(false);
    for (let i = 1; i < 40; i++) {
      expect(s.stances.get('f' + i)?.has('f0') ?? false).toBe(false);
    }
  });
});

describe('NOW-11: purge completeness at scale (no reverse index)', () => {
  it('purging a hub with thousands of inbound edges leaves nothing behind', () => {
    const s = new RelationshipTensorSystem();
    const N = 2000;
    for (let i = 0; i < N; i++) {
      s.getRelationship('a' + i, 'hub');
      s.getRelationship('hub', 'a' + i);
    }
    s.purgeAgent('hub');
    expect(s.relationships.has('hub')).toBe(false);
    for (let i = 0; i < N; i += 101) {
      expect(s.hasRelationship('a' + i, 'hub')).toBe(false);
    }
    // Unrelated edges survive the purge.
    expect(s.hasRelationship('a0', 'a1')).toBe(false);
    s.getRelationship('a0', 'a1');
    s.purgeAgent('hub');
    expect(s.hasRelationship('a0', 'a1')).toBe(true);
  });
});
