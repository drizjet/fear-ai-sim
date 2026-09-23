import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-PLAYER-INVASION-CHAIN-001 — player damage → FearEvent → war escalation → invasion
// as canonical parent-chained events: wounds drive war pressure, thresholds decide war
// status, invasions mobilize only under WAR with one world-RNG draw, loot conserves
// exactly (settlement resources ↔ war loot), and the chain continues across save/load
// with a seeded-identical continuation.
// Mutants pinned: lethal double-pressure removed; war-state gate removed on invasion;
// loot credited to warLoot without deducting settlement resources.

const eventsOf = (society, type) => society.events.filter(event => event.type === type);

const world = ({ seed = 91 } = {}) => {
    const society = new SocietyCore({ seed });
    society.addSettlement('homestead', { population: 40, resources: 40, resourceCapacity: 100 });
    return society;
};

const damage = (amount, extra = {}) => ({ kind: 'PLAYER_DAMAGE', amount, source: 'bandits', ...extra });
const evaluate = (extra = {}) => ({ kind: 'WAR_STATUS_EVALUATE', ...extra });
const assault = (extra = {}) => ({ kind: 'INVASION_MOBILIZE', invasionId: 'inv-1', settlementId: 'homestead', force: 5, defense: 2, plunder: 10, ...extra });

describe('RESP-PLAYER-INVASION-CHAIN-001: player damage → fear → war → invasion', () => {
    it('runs the full wound → fear → war → invasion chain as one validated lineage', () => {
        const society = world();
        society.tick({ actions: [damage(100), evaluate(), assault()] });

        const [wound] = eventsOf(society, 'PLAYER_WOUNDED');
        const [fear] = eventsOf(society, 'FEAR_EVENT_RAISED');
        const [warStatus] = eventsOf(society, 'WAR_STATUS_UPDATE');
        const [invasion] = eventsOf(society, 'INVASION_RESOLVED');

        // the lethal blow: hp bottoms out, death counted, double pressure (100 hp → 200)
        expect(wound.amount).toBe(100);
        expect(wound.hpAfter).toBe(0);
        expect(wound.alive).toBe(false);
        expect(society.player.deaths).toBe(1);
        expect(society.player.alive).toBe(false);
        expect(fear.pressureGain).toBe(200);
        expect(society.warState.pressure).toBe(200);

        // war status computed from pressure (200 ≥ 70) and chained to the fear event
        expect(warStatus.statusBefore).toBe('PEACE');
        expect(warStatus.statusAfter).toBe('WAR');
        expect(warStatus.escalation).toBe(8);
        expect(society.warState.status).toBe('WAR');
        expect(fear.parentId).toBe(wound.id);
        expect(warStatus.parentId).toBe(fear.id);
        expect(invasion.parentId).toBe(warStatus.id);

        // assault: force 5 > defense 2 + roll (<3) — always victory; loot conserves exactly
        expect(invasion.victory).toBe(true);
        expect(invasion.loot).toBe(10);
        expect(invasion.attackerPower).toBe(5);
        expect(invasion.defenderPower).toBeGreaterThanOrEqual(2);
        expect(invasion.defenderPower).toBeLessThan(3);
        expect(society.warLoot).toBe(10);
        expect(society.settlements.get('homestead').resources).toBe(30);
        expect(invasion.resourcesBefore - invasion.resourcesAfter).toBe(invasion.loot);
        expect(invasion.resourcesAfter + society.warLoot).toBe(invasion.resourcesBefore);
        expect(invasion.warStatus).toBe('WAR');
        expect(society.invasions.get('inv-1').status).toBe('SUCCEEDED');

        // one validated lineage from the TURN, auditable end to end
        const chain = society.causalChain(invasion.id);
        expect(chain.lineage.map(event => event.type)).toEqual([
            'TURN', 'PLAYER_WOUNDED', 'FEAR_EVENT_RAISED', 'WAR_STATUS_UPDATE', 'INVASION_RESOLVED',
        ]);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('keeps status at peace below thresholds and gates invasion behind WAR', () => {
        const society = world();
        society.tick({ actions: [damage(10), evaluate()] });
        const [warStatus] = eventsOf(society, 'WAR_STATUS_UPDATE');
        expect(society.warState.pressure).toBe(10); // non-lethal: single pressure
        expect(warStatus.statusAfter).toBe('PEACE');
        expect(() => society.tick({ actions: [assault()] })).toThrow(/requires war state "WAR"/);
        expect(society.invasions.size).toBe(0);
        expect(society.settlements.get('homestead').resources).toBe(40);
    });

    it('propagates the FearEvent into faction fear/threat perception', () => {
        const society = world();
        society.addFaction('invaders', { fear: 0, threatPerception: 0 });
        society.tick({ actions: [damage(20, { factionId: 'invaders' })] });
        const [fear] = eventsOf(society, 'FEAR_EVENT_RAISED');
        expect(fear.factionId).toBe('invaders');
        expect(society.factions.get('invaders').state.fear).toBeCloseTo(0.2, 10); // 20/100, clamped
        expect(society.factions.get('invaders').state.threatPerception).toBeCloseTo(0.1, 10); // 20/200
        expect(society.player.alive).toBe(true); // non-lethal
        expect(society.warState.pressure).toBe(20);
    });

    it('rejects invalid damage and invasion inputs before mutating state', () => {
        const society = world();
        society.tick({ actions: [damage(100)] }); // kill the player
        expect(() => society.tick({ actions: [damage(1)] })).toThrow(/living player/);
        expect(society.player.hp).toBe(0); // no partial mutation from the rejected action

        const fresh = world();
        expect(() => fresh.tick({ actions: [damage(-1)] })).toThrow(/non-negative/);
        expect(() => fresh.tick({ actions: [damage(NaN)] })).toThrow(/non-negative/);
        expect(() => fresh.tick({ actions: [damage(1, { factionId: 'ghost' })] })).toThrow(/Unknown faction/);
        expect(fresh.player.hp).toBe(100); // faction guard ran before any wound

        // invasion guards (bring the world to WAR first)
        fresh.tick({ actions: [damage(100), evaluate()] });
        expect(() => fresh.tick({ actions: [assault({ invasionId: undefined })] })).toThrow(/invasionId/);
        expect(() => fresh.tick({ actions: [assault({ settlementId: 'nowhere' })] })).toThrow(/Unknown settlement/);
        expect(() => fresh.tick({ actions: [assault({ force: 0 })] })).toThrow(/positive force/);
        fresh.tick({ actions: [assault()] });
        expect(() => fresh.tick({ actions: [assault()] })).toThrow(/Duplicate invasion/);
        expect(fresh.invasions.size).toBe(1);
    });

    it('continues the chain identically across save/load', () => {
        const society = world();
        society.tick({ actions: [damage(100), evaluate(), assault()] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.player).toEqual(society.player);
        expect(restored.warState).toEqual(society.warState);
        expect(restored.warLoot).toBe(10);
        expect(restored.invasions.get('inv-1')).toEqual(society.invasions.get('inv-1'));
        expect(restored.settlements.get('homestead').resources).toBe(30);
        expect(restored.events).toHaveLength(society.events.length);
        // seeded-identical continuation: both worlds resolve the next assault the same way
        const followUp = [{ ...assault({ invasionId: 'inv-2' }) }];
        society.tick({ actions: followUp });
        restored.tick({ actions: followUp });
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
