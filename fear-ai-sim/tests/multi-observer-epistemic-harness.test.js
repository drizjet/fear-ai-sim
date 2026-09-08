import { describe, it, expect } from '@jest/globals';
import {
    MultiObserverEpistemicHarness,
    INFORMATION_CHANNELS,
    EPISTEMIC_PROVENANCE,
    BELIEF_CATEGORIES
} from '../packages/core/index.js';

describe('Front E / Sections 25–27, 50–51, 100–103: Multi-Observer Epistemic Discrepancy & Fog-of-War', () => {
    function setupRegionalObserverNetwork() {
        const harness = new MultiObserverEpistemicHarness({ courierSpeedKmPerTick: 5.0, rumorDecayFactor: 0.80 });

        // Node A: Central Capital (x=0, z=0)
        harness.registerObserver('Capital', { name: 'High Capital', neuroticism: 0.30, x: 0, z: 0 });

        // Node B: North Outpost (x=0, z=50) -> 50 km from Capital
        harness.registerObserver('NorthOutpost', { name: 'North Border Outpost', neuroticism: 0.40, x: 0, z: 50 });

        // Node C: Distant Village (x=0, z=120) -> 70 km from North Outpost
        harness.registerObserver('DistantVillage', { name: 'Distant Hamlet', neuroticism: 0.85, x: 0, z: 120 }); // highly neurotic

        // Connect links
        harness.connectObservers('Capital', 'NorthOutpost', 50.0);
        harness.connectObservers('NorthOutpost', 'DistantVillage', 70.0);

        return harness;
    }

    describe('1. Direct Sensory Perception vs Spatial Fog-of-War', () => {
        it('immediately alerts proximate observers while distant observers remain oblivious', () => {
            const harness = setupRegionalObserverNetwork();

            // Threat spawns at x=5, z=5 (proximate to Capital, far from Outpost and Village)
            harness.injectGroundTruthThreat('goblin_warband', {
                type: 'GOBLIN_RAIDERS',
                x: 5, z: 5,
                severity: 0.80
            });

            // Capital should directly observe with 1.0 confidence at tick 0
            const capBelief = harness.observerNodes.get('Capital').engine.threatBeliefs.get('goblin_warband');
            expect(capBelief).toBeDefined();
            expect(capBelief.confidence).toBe(1.0);
            expect(capBelief.provenance).toBe(EPISTEMIC_PROVENANCE.OBSERVED);

            // Distant village should have NO belief (true Fog-of-War)
            const villageBelief = harness.observerNodes.get('DistantVillage').engine.threatBeliefs.get('goblin_warband');
            expect(villageBelief).toBeUndefined();
        });
    });

    describe('2. Courier Propagation & Physical Information Latency', () => {
        it('delivers dispatch across corridor with physical travel time latency', () => {
            const harness = setupRegionalObserverNetwork();
            harness.injectGroundTruthThreat('dragon_roost', { severity: 0.90, x: 0, z: 0 });

            // Capital sends official courier to NorthOutpost (50 km / 5 km/tick = 10 ticks)
            harness.dispatchMessage('Capital', 'NorthOutpost', {
                threatId: 'dragon_roost',
                category: BELIEF_CATEGORIES.THREAT,
                type: 'DRAGON',
                severity: 0.90,
                confidence: 1.0
            }, INFORMATION_CHANNELS.MESSENGER_COURIER);

            // Tick 5: Courier in flight, Outpost still oblivious
            harness.tick(5);
            expect(harness.observerNodes.get('NorthOutpost').engine.threatBeliefs.get('dragon_roost')).toBeUndefined();

            // Tick 6 more (total 11 ticks): Courier has arrived
            harness.tick(6);
            const outpostBelief = harness.observerNodes.get('NorthOutpost').engine.threatBeliefs.get('dragon_roost');
            expect(outpostBelief).toBeDefined();
            expect(outpostBelief.provenance).toBe(EPISTEMIC_PROVENANCE.COMMUNICATED_DIRECT);
            expect(outpostBelief.confidence).toBeGreaterThan(0.70);

            // Measure information latency
            const latency = harness.measureInformationLatency('dragon_roost');
            expect(latency.awareCount).toBe(2); // Capital and NorthOutpost
            expect(latency.maxLatencyTicks).toBeGreaterThanOrEqual(10);
        });
    });

    describe('3. Multi-Hop Rumor Degradation & Neurotic Mutation', () => {
        it('decays confidence over multiple hops and inflates threat severity in neurotic nodes', () => {
            const harness = setupRegionalObserverNetwork();

            // Hop 1: NorthOutpost hears rumor from Capital
            harness.dispatchMessage('Capital', 'NorthOutpost', {
                threatId: 'wolf_pack',
                category: BELIEF_CATEGORIES.THREAT,
                severity: 0.40,
                confidence: 0.90,
                hops: 0
            }, INFORMATION_CHANNELS.TRAVELER_RUMOR);

            harness.tick(25); // deliver to NorthOutpost

            // Hop 2: NorthOutpost forwards rumor to DistantVillage (neuroticism = 0.85)
            const outpostBelief = harness.observerNodes.get('NorthOutpost').engine.threatBeliefs.get('wolf_pack');
            expect(outpostBelief).toBeDefined();

            harness.dispatchMessage('NorthOutpost', 'DistantVillage', {
                threatId: 'wolf_pack',
                category: BELIEF_CATEGORIES.THREAT,
                severity: outpostBelief.data.severity,
                confidence: outpostBelief.confidence,
                hops: outpostBelief.hops
            }, INFORMATION_CHANNELS.TRAVELER_RUMOR);

            harness.tick(35); // deliver to DistantVillage

            const villageBelief = harness.observerNodes.get('DistantVillage').engine.threatBeliefs.get('wolf_pack');
            expect(villageBelief).toBeDefined();
            expect(villageBelief.provenance).toBe(EPISTEMIC_PROVENANCE.RUMOR);

            // Multi-hop decay: confidence is lower than origin
            expect(villageBelief.confidence).toBeLessThan(outpostBelief.confidence);

            // Neurotic distortion: threat severity was inflated due to high neuroticism (0.85 > 0.65)
            expect(villageBelief.data.severity).toBeGreaterThan(0.40);
        });
    });

    describe('4. Network Epistemic Discrepancy & Paranoia/Complacency Scoring', () => {
        it('evaluates belief divergence, phantom threat paranoia, and blind-spot complacency', () => {
            const harness = setupRegionalObserverNetwork();

            // Threat 1: Active severe threat at Capital, unknown to DistantVillage (Complacency blind spot)
            harness.injectGroundTruthThreat('siege_army', { severity: 0.95, x: 0, z: 0, active: true });

            // Threat 2: Phantom threat (inactive in ground truth, but believed by DistantVillage via rumor)
            harness.groundTruth.threats.set('phantom_beast', { id: 'phantom_beast', severity: 0.50, active: false, createdTick: 0 });
            harness.observerNodes.get('DistantVillage').engine.threatBeliefs.set('phantom_beast', {
                id: 'phantom_beast',
                category: BELIEF_CATEGORIES.THREAT,
                data: { severity: 0.80, active: true },
                confidence: 0.85,
                provenance: EPISTEMIC_PROVENANCE.RUMOR,
                lastUpdatedTick: 5,
                sourceId: 'Traveler',
                hops: 2
            });

            const metrics = harness.evaluateNetworkDiscrepancy();
            expect(metrics.divergenceScore).toBeGreaterThan(0.0);
            expect(metrics.paranoiaIndex).toBeGreaterThan(0.0); // Believing in phantom_beast
            expect(metrics.complacencyIndex).toBeGreaterThan(0.0); // DistantVillage unaware of siege_army
        });
    });

    describe('5. Ground Truth Immutability & Replay Parity', () => {
        it('preserves World Ground Truth integrity and restores bit-exact snapshots', () => {
            const harnessA = setupRegionalObserverNetwork();
            harnessA.injectGroundTruthThreat('troll_cave', { severity: 0.70, x: 0, z: 0 });
            harnessA.tick(15);

            // Verify ground truth immutability
            const audit = harnessA.auditGroundTruthImmutability();
            expect(audit.isClean).toBe(true);
            expect(audit.groundTruthThreatCount).toBe(1);

            // Snapshot round-trip
            const snapshot = harnessA.getState();
            const harnessB = new MultiObserverEpistemicHarness();
            harnessB.setState(snapshot);

            expect(harnessB.currentTick).toBe(15);
            expect(harnessB.observerNodes.size).toBe(3);
            expect(harnessB.groundTruth.threats.has('troll_cave')).toBe(true);

            const aBelief = harnessA.observerNodes.get('Capital').engine.threatBeliefs.get('troll_cave');
            const bBelief = harnessB.observerNodes.get('Capital').engine.threatBeliefs.get('troll_cave');
            expect(bBelief).toBeDefined();
            expect(bBelief.confidence).toBe(aBelief.confidence);
            expect(bBelief.confidence).toBeCloseTo(0.925, 2);
        });
    });
});
