import { describe, it, expect } from '@jest/globals';
import { SocialEventEngine, RelationshipTensorSystem, TraumaZoneSystem } from '../packages/core/index.js';
import { ProtocolValidator } from '../packages/protocol/index.js';

// R4 (second seam): SOCIAL_EVENT messages forward an opt-in location so
// host-reported events (Godot included) can land on the R3 location-dread
// wire. Zone systems stay server-side by design — only coordinates cross.

const HOT = { x: 0, y: 0, z: 0 };
const FAR = { x: 10000, y: 0, z: 0 };

function hotZones() {
    const zones = new TraumaZoneSystem();
    zones.addZone(0, 0, 0, 1.0, 150, 1800);
    return zones;
}

function applyValidated(event, rawOptions, zones) {
    const msg = ProtocolValidator.validateSocialEvent({
        type: 'SOCIAL_EVENT', event, actor_id: 'alice', target_id: 'bob', ...rawOptions,
    });
    expect(msg.valid).toBe(true);
    const engine = new SocialEventEngine();
    const tensor = new RelationshipTensorSystem();
    const out = engine.applyEvent(tensor, msg.value.event, msg.value.actor_id, msg.value.target_id, {
        weight: msg.value.weight,
        witnesses: msg.value.witnesses,
        exposed: msg.value.exposed,
        ...(msg.value.location ? { location: msg.value.location } : {}),
        ...(zones ? { traumaZones: zones } : {}),
    });
    return { msg, out, tensor };
}

describe('R4: social-event location rides the protocol to the R3 wire', () => {
    it('1. Validated location lands on the dread wire end to end', () => {
        const zones = hotZones();
        const hot = applyValidated('SHARED_DANGER',
            { weight: 1, location: { x: HOT.x, y: HOT.y, z: HOT.z } }, zones);
        const cold = applyValidated('SHARED_DANGER',
            { weight: 1, location: { x: FAR.x, y: FAR.y, z: FAR.z } }, zones);
        expect(hot.msg.value.location).toEqual({ x: 0, y: 0, z: 0 });
        expect(hot.out.zoneFear).toBe(1);
        expect(cold.out.zoneFear).toBe(0);
        expect(hot.out.direct.trust).toBeGreaterThan(cold.out.direct.trust);
    });

    it('2. Legacy shape kept: no location key without finite x/y', () => {
        for (const rawOptions of [
            {},
            { location: null },
            { location: { x: NaN, y: 0 } },
            { location: { x: 0 } },
            { location: 'hot' },
        ]) {
            const msg = ProtocolValidator.validateSocialEvent({
                type: 'SOCIAL_EVENT', event: 'SHARED_DANGER',
                actor_id: 'a', target_id: 'b', ...rawOptions,
            });
            expect(msg.valid).toBe(true);
            expect('location' in msg.value).toBe(false);
        }
    });

    it('3. Location without zones stays legacy; zones attach server-side', () => {
        // Wire needs both halves: validated location alone changes nothing.
        const bare = applyValidated('SHARED_DANGER',
            { weight: 1, location: { x: HOT.x, y: HOT.y } }, null);
        expect(bare.out.zoneFear).toBe(null);
        const engine = new SocialEventEngine();
        const t = new RelationshipTensorSystem();
        const legacy = engine.applyEvent(t, 'SHARED_DANGER', 'alice', 'bob', { weight: 1 });
        expect(bare.out.direct).toEqual(legacy.direct);
    });

    it('4. z defaults to 0; invalid z does not poison x/y', () => {
        const msg = ProtocolValidator.validateSocialEvent({
            type: 'SOCIAL_EVENT', event: 'RESCUE', actor_id: 'a', target_id: 'b',
            location: { x: 5, y: -3, z: NaN },
        });
        expect(msg.value.location).toEqual({ x: 5, y: -3, z: 0 });
    });

    it('5. Invalid event and participants still rejected with location present', () => {
        expect(ProtocolValidator.validateSocialEvent({
            type: 'SOCIAL_EVENT', event: 'HUG', actor_id: 'a', target_id: 'b',
            location: { x: 0, y: 0 },
        }).valid).toBe(false);
        expect(ProtocolValidator.validateSocialEvent({
            type: 'SOCIAL_EVENT', event: 'RESCUE', actor_id: '', target_id: 'b',
            location: { x: 0, y: 0 },
        }).valid).toBe(false);
    });
});
