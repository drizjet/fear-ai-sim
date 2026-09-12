/**
 * @file trauma-zone-appraisal.test.js
 *
 * R2 (audit 190): TraumaZoneSystem couples into AffectiveAgent appraisal.
 * An opt-in zones system attached via options.traumaZones contributes
 * ambient spatial dread read at the host-reported position, folded through
 * the pre-existing traumaDread input via max() (NEXT-115 pattern), so
 * host/context values never reduce. Detached agents are bit-identical.
 */

import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent, TraumaZoneSystem } from '../packages/core/index.js';

const HOT = { x: 0, y: 0, z: 0 };
const COLD = { x: 500, y: 0, z: 0 };

function hotZones(intensity = 1.0) {
    const zones = new TraumaZoneSystem();
    zones.addZone(HOT.x, HOT.y, HOT.z, intensity, 150, 1800);
    return zones;
}
let agentSeq = 0;
function agentAt(pos, options = {}) {
    agentSeq += 1;
    return new AffectiveAgent(`r2_agent_${agentSeq}`, {}, { seed: `r2_${agentSeq}`, ...options });
}

function runTicks(agent, pos, n, context = {}) {
    let out = null;
    for (let t = 0; t < n; t++) {
        out = agent.tick(0.016, { x: pos.x, y: pos.y, z: pos.z }, context);
    }
    return out;
}

describe('R2: trauma-zone ambient dread in appraisal', () => {
    it('1. Detached agents keep the legacy path and shape exactly', () => {
        const zones = hotZones();
        const a = agentAt(HOT);
        const b = agentAt(HOT, { traumaZones: zones });
        // Cold position: attached system reads 0, outputs identical.
        const ra = runTicks(a, COLD, 20);
        const rb = runTicks(b, COLD, 20);
        expect(rb.affective_state).toEqual(ra.affective_state);
        expect(rb.fear_band).toBe(ra.fear_band);
        expect('zone_dread' in ra.debug_trace.perception_breakdown).toBe(false);
        expect(rb.debug_trace.perception_breakdown.zone_dread).toBe(0);
    });

    it('2. Hot ground raises fear vs cold ground, no threats present', () => {
        const zones = hotZones();
        const hot = agentAt(HOT, { traumaZones: zones });
        const cold = agentAt(COLD, { traumaZones: zones });
        const rHot = runTicks(hot, HOT, 20);
        const rCold = runTicks(cold, COLD, 20);
        expect(rHot.debug_trace.perception_breakdown.zone_dread).toBe(1.0);
        expect(rHot.affective_state.raw_fear).toBeGreaterThan(rCold.affective_state.raw_fear);
        expect(rCold.affective_state.raw_fear).toBe(0);
    });

    it('3. max() fold: host traumaDread never reduces, zone never reduces host', () => {
        const zones = hotZones();
        // Cold + strong host dread: identical to detached with same context.
        const a = agentAt(COLD, { traumaZones: zones });
        const b = agentAt(COLD);
        const ra = runTicks(a, COLD, 20, { traumaDread: 0.9 });
        const rb = runTicks(b, COLD, 20, { traumaDread: 0.9 });
        expect(ra.affective_state).toEqual(rb.affective_state);
        // Hot zone (1.0) beats weaker host dread (0.4): equals no-context hot.
        const c = agentAt(HOT, { traumaZones: zones });
        const d = agentAt(HOT, { traumaZones: zones });
        const rc = runTicks(c, HOT, 20, { traumaDread: 0.4 });
        const rd = runTicks(d, HOT, 20);
        expect(rc.affective_state).toEqual(rd.affective_state);
    });

    it('4. Garbage zone systems degrade safely without throwing', () => {
        const a = agentAt(HOT, { traumaZones: {} });
        const b = agentAt(HOT);
        const ra = runTicks(a, HOT, 20);
        const rb = runTicks(b, HOT, 20);
        expect(ra.affective_state).toEqual(rb.affective_state);
        const nanZones = { getTraumaAt: () => NaN };
        const c = agentAt(HOT, { traumaZones: nanZones });
        const rc = runTicks(c, HOT, 20);
        expect(rc.affective_state).toEqual(rb.affective_state);
        expect(rc.debug_trace.perception_breakdown.zone_dread).toBe(0);
    });

    it('5. Zone decay fades the appraisal effect deterministically', () => {
        const zones = hotZones();
        const hot = agentAt(HOT, { traumaZones: zones });
        runTicks(hot, HOT, 20);
        const fearHot = hot.lastResult.affective_state.raw_fear;
        expect(fearHot).toBeGreaterThan(0);
        zones.tick(1800); // full lifetime: dread decays to zero
        expect(zones.getTraumaAt(HOT.x, HOT.y, HOT.z)).toBe(0);
        const rFaded = runTicks(hot, HOT, 60);
        expect(rFaded.debug_trace.perception_breakdown.zone_dread).toBe(0);
        expect(rFaded.affective_state.raw_fear).toBeLessThan(fearHot);
    });

    it('6. Exact replay: same seed sequence reproduces identical zone runs', () => {
        const run = () => {
            const zones = hotZones();
            const agent = new AffectiveAgent('replay_agent', {}, { seed: 'r2', traumaZones: zones });
            return runTicks(agent, HOT, 20);
        };
        const a = run();
        const b = run();
        expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
        expect(a.affective_state.raw_fear).toBeGreaterThan(0);
    });
});
