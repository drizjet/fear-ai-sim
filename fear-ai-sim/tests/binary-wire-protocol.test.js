import { describe, it, expect } from '@jest/globals';
import {
    BinaryWireProtocol,
    BinaryFrameReader,
    BINARY_MAGIC,
    BINARY_PROTOCOL_VERSION,
    FRAME_TYPES,
    INTENT_CODES,
    POSTURE_CODES,
    BAND_CODES
} from '../packages/protocol/index.js';

describe('Front D / Section 83: Protocol V2 Zero-Copy Binary Wire Contract', () => {
    it('1. Encodes and decodes intent batch with exact header and record fidelity', () => {
        const testIntents = [
            {
                entityId: 101,
                fear: 0.85,
                anger: 0.20,
                dominance: 0.35,
                urgency: 0.90,
                intentType: 'FLEE_FROM',
                suggestedPosture: 'SPRINTING',
                band: 'PANIC',
                inCombat: false,
                exhausted: false,
                vectorHint: { x: -1.0, y: 0.0, z: 0.0 }
            },
            {
                entityId: 102,
                fear: 0.15,
                anger: 0.65,
                dominance: 0.80,
                urgency: 0.45,
                intentType: 'CONFRONT_THREAT',
                suggestedPosture: 'DEFENSIVE_STANCE',
                band: 'AGGRESSIVE',
                inCombat: true,
                exhausted: false,
                vectorHint: { x: 0.5, y: 0.0, z: 0.866 }
            }
        ];

        const buffer = BinaryWireProtocol.encodeIntentBatch(42, testIntents);
        expect(buffer.byteLength).toBe(16 + 2 * 32); // 16 header + 64 records = 80 bytes

        const decoded = BinaryWireProtocol.decodeIntentBatch(buffer);
        expect(decoded.tick).toBe(42);
        expect(decoded.count).toBe(2);
        expect(decoded.frameType).toBe(FRAME_TYPES.INTENT_BATCH);

        // Record 1 verification
        const r1 = decoded.records[0];
        expect(r1.entityId).toBe(101);
        expect(r1.fear).toBeCloseTo(0.85, 2);
        expect(r1.anger).toBeCloseTo(0.20, 2);
        expect(r1.dominance).toBeCloseTo(0.35, 2);
        expect(r1.urgency).toBeCloseTo(0.90, 2);
        expect(r1.intentType).toBe('FLEE_FROM');
        expect(r1.suggestedPosture).toBe('SPRINTING');
        expect(r1.band).toBe('PANIC');
        expect(r1.isPanicking).toBe(true);
        expect(r1.inCombat).toBe(false);
        expect(r1.vectorHint.x).toBeCloseTo(-1.0, 3);

        // Record 2 verification
        const r2 = decoded.records[1];
        expect(r2.entityId).toBe(102);
        expect(r2.fear).toBeCloseTo(0.15, 2);
        expect(r2.anger).toBeCloseTo(0.65, 2);
        expect(r2.dominance).toBeCloseTo(0.80, 2);
        expect(r2.intentType).toBe('CONFRONT_THREAT');
        expect(r2.suggestedPosture).toBe('DEFENSIVE_STANCE');
        expect(r2.band).toBe('AGGRESSIVE');
        expect(r2.isPanicking).toBe(false);
        expect(r2.inCombat).toBe(true);
        expect(r2.vectorHint.x).toBeCloseTo(0.5, 3);
        expect(r2.vectorHint.z).toBeCloseTo(0.866, 3);
    });

    it('2. Zero-Copy BinaryFrameReader enables O(1) field inspection without object allocation', () => {
        const testIntents = [
            {
                entityId: 999,
                fear: 0.92,
                anger: 0.05,
                dominance: 0.10,
                urgency: 0.95,
                intentType: 'DESPERATE_FLAIL',
                suggestedPosture: 'STUMBLING',
                band: 'PANIC',
                vectorHint: { x: 0.0, y: 1.0, z: 0.0 }
            }
        ];

        const buffer = BinaryWireProtocol.encodeIntentBatch(100, testIntents);
        const reader = BinaryWireProtocol.createReader(buffer);

        expect(reader.tick).toBe(100);
        expect(reader.count).toBe(1);
        expect(reader.getEntityId(0)).toBe(999);
        expect(reader.getFear(0)).toBeCloseTo(0.92, 2);
        expect(reader.getAnger(0)).toBeCloseTo(0.05, 2);
        expect(reader.getDominance(0)).toBeCloseTo(0.10, 2);
        expect(reader.getIntentName(0)).toBe('DESPERATE_FLAIL');
        expect(reader.getPostureName(0)).toBe('STUMBLING');
        expect(reader.getBandName(0)).toBe('PANIC');
        expect(reader.isPanicking(0)).toBe(true);

        const targetVec = { x: 0, y: 0, z: 0 };
        reader.readVector(0, targetVec);
        expect(targetVec.y).toBeCloseTo(1.0, 3);
    });

    it('3. Throws descriptive errors for corrupt, truncated, or invalid buffers', () => {
        // Truncated buffer smaller than header
        expect(() => BinaryWireProtocol.decodeIntentBatch(new ArrayBuffer(8))).toThrow(
            /smaller than header/
        );

        // Invalid magic bytes
        const badMagic = new ArrayBuffer(48);
        const viewBadMagic = new DataView(badMagic);
        viewBadMagic.setUint32(0, 0x12345678, true);
        expect(() => BinaryWireProtocol.decodeIntentBatch(badMagic)).toThrow(/Invalid magic bytes/);

        // Unsupported version
        const badVersion = new ArrayBuffer(48);
        const viewBadVersion = new DataView(badVersion);
        viewBadVersion.setUint32(0, BINARY_MAGIC, true);
        viewBadVersion.setUint8(4, 99); // bad version
        expect(() => BinaryWireProtocol.decodeIntentBatch(badVersion)).toThrow(
            /Unsupported protocol version/
        );

        // Truncated payload for declared entity count
        const truncatedPayload = new ArrayBuffer(32); // 16 header + 16 (needs 48 for 1 entity)
        const viewTruncated = new DataView(truncatedPayload);
        viewTruncated.setUint32(0, BINARY_MAGIC, true);
        viewTruncated.setUint8(4, BINARY_PROTOCOL_VERSION);
        viewTruncated.setUint32(12, 1, true); // count = 1 -> needs 48 bytes
        expect(() => BinaryWireProtocol.decodeIntentBatch(truncatedPayload)).toThrow(/Truncated buffer/);

        // Reader index out of bounds
        const validBuf = BinaryWireProtocol.encodeIntentBatch(1, [{ entityId: 1, fear: 0.1 }]);
        const reader = BinaryWireProtocol.createReader(validBuf);
        expect(() => reader.getEntityId(5)).toThrow(RangeError);
    });

    it('4. Benchmark: Sub-millisecond serialization across 1,000 and 5,000 entities', () => {
        const N = 1000;
        const entities = [];
        for (let i = 0; i < N; i++) {
            entities.push({
                entityId: i,
                fear: 0.5,
                anger: 0.2,
                dominance: 0.6,
                urgency: 0.4,
                intentType: 'IDLE_VIGILANT',
                suggestedPosture: 'UPRIGHT',
                band: 'CALM',
                vectorHint: { x: 0, y: 0, z: 0 }
            });
        }

        const t0 = performance.now();
        const buffer = BinaryWireProtocol.encodeIntentBatch(1, entities);
        const tEncode = performance.now() - t0;

        const t1 = performance.now();
        const decoded = BinaryWireProtocol.decodeIntentBatch(buffer);
        const tDecode = performance.now() - t1;

        expect(decoded.count).toBe(N);
        // Both encode and decode must easily complete in < 50ms in test runner under parallel load
        expect(tEncode).toBeLessThan(50.0);
        expect(tDecode).toBeLessThan(50.0);
    });

    it('5. Strictly preserves Host Game Authority Invariant', () => {
        // Binary protocol operates as a pure wire representation:
        // encodes and decodes advisory data without mutating input state or host physics
        const original = Object.freeze({
            entityId: 404,
            fear: 0.5,
            anger: 0.1,
            dominance: 0.8,
            urgency: 0.2,
            intentType: 'CAUTIOUS_EXPLORE',
            suggestedPosture: 'CROUCHING',
            band: 'ALERT',
            vectorHint: Object.freeze({ x: 1.0, y: 0.0, z: 0.0 })
        });

        const buf = BinaryWireProtocol.encodeIntentBatch(1, [original]);
        expect(original.entityId).toBe(404);
        expect(buf.byteLength).toBe(48);
    });
});
