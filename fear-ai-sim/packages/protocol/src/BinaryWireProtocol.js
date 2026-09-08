/**
 * packages/protocol/src/BinaryWireProtocol.js
 *
 * Front D / Section 83: Protocol V2 Zero-Copy Binary Wire Contract.
 *
 * Provides a high-frequency, sub-millisecond binary wire format for 60Hz/120Hz tick loops
 * and massive multi-agent batches (1,000 to 10,000 entities).
 *
 * Binary Layout Specification (32-byte aligned fixed strides):
 *
 * 1. Frame Header (16 bytes):
 *    [0..3]   Magic Bytes: 0x46 0x45 0x41 0x52 ("FEAR")
 *    [4]      Protocol Version: 0x02 (Protocol V2)
 *    [5]      Frame Type: 1=OBSERVATIONS, 2=INTENTS, 3=STATE_SYNC, 4=PING
 *    [6..7]   Flags / Reserved (uint16)
 *    [8..11]  Tick Number (uint32)
 *    [12..15] Entity Count (uint32)
 *
 * 2. Intent Record (32 bytes per entity):
 *    [0..3]   Entity ID (uint32)
 *    [4..5]   Fear (uint16, normalized 0..65535)
 *    [6..7]   Anger (uint16, normalized 0..65535)
 *    [8..9]   Dominance (uint16, normalized 0..65535)
 *    [10..11] Urgency (uint16, normalized 0..65535)
 *    [12]     Intent Code (uint8, mapped to INTENT_CODES)
 *    [13]     Posture Code (uint8, mapped to POSTURE_CODES)
 *    [14]     Band Code (uint8, mapped to BAND_CODES)
 *    [15]     Flags (uint8: bit 0=isPanicking, bit 1=inCombat, bit 2=exhausted)
 *    [16..19] Vector Hint X (float32)
 *    [20..23] Vector Hint Y (float32)
 *    [24..27] Vector Hint Z (float32)
 *    [28..31] Reserved / Padding (uint32)
 *
 * 3. Observation Record (32 bytes per entity):
 *    [0..3]   Entity ID (uint32)
 *    [4..7]   Position X (float32)
 *    [8..11]  Position Y (float32)
 *    [12..15] Position Z (float32)
 *    [16..19] Threat Distance (float32)
 *    [20..23] Threat Intensity (float32)
 *    [24..25] Health (uint16, normalized 0..65535)
 *    [26..27] Energy (uint16, normalized 0..65535)
 *    [28]     Stimulus Type (uint8)
 *    [29]     Flags (uint8: bit 0=inCombat, bit 1=provoked)
 *    [30..31] Reserved / Padding (uint16)
 *
 * Invariant: Strictly adheres to Host Game Authority Invariant.
 * Zero-copy readers allow game engines to extract vectors and intents directly
 * from native memory offsets with zero intermediate object allocation.
 */

export const BINARY_MAGIC = 0x52414546; // "FEAR" in little-endian uint32
export const BINARY_PROTOCOL_VERSION = 2;

export const FRAME_TYPES = Object.freeze({
    OBSERVATION_BATCH: 1,
    INTENT_BATCH: 2,
    STATE_SYNC: 3,
    PING: 4
});

export const INTENT_CODES = Object.freeze({
    IDLE_VIGILANT: 0,
    CAUTIOUS_EXPLORE: 1,
    INVESTIGATE_SOUND: 2,
    FLEE_FROM: 3,
    SEEK_COVER: 4,
    FREEZE: 5,
    CONFRONT_THREAT: 6,
    APPROACH_ALLY: 7,
    WARN_GROUP: 8,
    DESPERATE_FLAIL: 9,
    COLLAPSE_EXHAUSTED: 10,
    RECOVERING: 11,
    UNKNOWN: 255
});

export const INTENT_CODE_TO_NAME = Object.freeze(
    Object.fromEntries(Object.entries(INTENT_CODES).map(([k, v]) => [v, k]))
);

export const POSTURE_CODES = Object.freeze({
    UPRIGHT: 0,
    CROUCHING: 1,
    DEFENSIVE_STANCE: 2,
    SPRINTING: 3,
    STUMBLING: 4,
    PRONE: 5,
    TREMBLING: 6,
    COLLAPSED: 7,
    UNKNOWN: 255
});

export const POSTURE_CODE_TO_NAME = Object.freeze(
    Object.fromEntries(Object.entries(POSTURE_CODES).map(([k, v]) => [v, k]))
);

export const BAND_CODES = Object.freeze({
    CALM: 0,
    ALERT: 1,
    ANXIOUS: 2,
    HIDE: 3,
    PANIC: 4,
    FREEZE: 5,
    AGGRESSIVE: 6,
    CRAWLING: 7,
    PRESENCE_BREAK: 8,
    RECOVER: 9,
    UNKNOWN: 255
});

export const BAND_CODE_TO_NAME = Object.freeze(
    Object.fromEntries(Object.entries(BAND_CODES).map(([k, v]) => [v, k]))
);

export const HEADER_SIZE_BYTES = 16;
export const RECORD_SIZE_BYTES = 32;

/**
 * Normalizes float in [0.0, 1.0] to uint16 [0, 65535].
 */
function floatToUint16(val) {
    if (typeof val !== 'number' || Number.isNaN(val)) return 0;
    const clamped = Math.max(0, Math.min(1, val));
    return Math.round(clamped * 65535);
}

/**
 * De-normalizes uint16 [0, 65535] to float [0.0, 1.0].
 */
function uint16ToFloat(val) {
    return Number((val / 65535).toFixed(4));
}

export class BinaryWireProtocol {
    /**
     * Encode a batch of entity intents into a compact ArrayBuffer.
     * @param {number} tick Tick index
     * @param {Array<object>} intentRecords Array of entity intent objects
     * @param {ArrayBuffer} [optionalTargetBuffer] Pre-allocated buffer for zero-allocation reuse
     * @returns {ArrayBuffer}
     */
    static encodeIntentBatch(tick, intentRecords, optionalTargetBuffer = null) {
        const count = intentRecords.length;
        const totalBytes = HEADER_SIZE_BYTES + count * RECORD_SIZE_BYTES;

        const buffer = (optionalTargetBuffer && optionalTargetBuffer.byteLength >= totalBytes)
            ? optionalTargetBuffer
            : new ArrayBuffer(totalBytes);

        const view = new DataView(buffer);

        // 1. Write Header (16 bytes)
        view.setUint32(0, BINARY_MAGIC, true);
        view.setUint8(4, BINARY_PROTOCOL_VERSION);
        view.setUint8(5, FRAME_TYPES.INTENT_BATCH);
        view.setUint16(6, 0, true); // reserved / flags
        view.setUint32(8, tick, true);
        view.setUint32(12, count, true);

        // 2. Write Records (32 bytes each)
        let offset = HEADER_SIZE_BYTES;
        for (let i = 0; i < count; i++) {
            const rec = intentRecords[i];
            const entityId = typeof rec.entityId === 'number' ? rec.entityId : (parseInt(rec.entityId, 10) || i);

            view.setUint32(offset, entityId, true);
            view.setUint16(offset + 4, floatToUint16(rec.fear), true);
            view.setUint16(offset + 6, floatToUint16(rec.anger), true);
            view.setUint16(offset + 8, floatToUint16(rec.dominance), true);
            view.setUint16(offset + 10, floatToUint16(rec.urgency), true);

            const intentCode = INTENT_CODES[rec.intentType] ?? INTENT_CODES.UNKNOWN;
            const postureCode = POSTURE_CODES[rec.suggestedPosture] ?? POSTURE_CODES.UNKNOWN;
            const bandCode = BAND_CODES[rec.band] ?? BAND_CODES.UNKNOWN;

            let flags = 0;
            if (rec.fear >= 0.70) flags |= 0x01; // isPanicking
            if (rec.inCombat) flags |= 0x02;     // inCombat
            if (rec.exhausted) flags |= 0x04;    // exhausted

            view.setUint8(offset + 12, intentCode);
            view.setUint8(offset + 13, postureCode);
            view.setUint8(offset + 14, bandCode);
            view.setUint8(offset + 15, flags);

            const vx = rec.vectorHint?.x ?? 0.0;
            const vy = rec.vectorHint?.y ?? 0.0;
            const vz = rec.vectorHint?.z ?? 0.0;

            view.setFloat32(offset + 16, vx, true);
            view.setFloat32(offset + 20, vy, true);
            view.setFloat32(offset + 24, vz, true);
            view.setUint32(offset + 28, 0, true); // padding

            offset += RECORD_SIZE_BYTES;
        }

        return buffer;
    }

    /**
     * Decode an ArrayBuffer containing an intent batch into JavaScript objects.
     * @param {ArrayBuffer} buffer
     * @returns {object} { tick: number, frameType: number, count: number, records: Array<object> }
     */
    static decodeIntentBatch(buffer) {
        if (!buffer || buffer.byteLength < HEADER_SIZE_BYTES) {
            throw new Error(`Invalid binary wire frame: buffer smaller than header (${buffer?.byteLength ?? 0} < ${HEADER_SIZE_BYTES})`);
        }

        const view = new DataView(buffer);
        const magic = view.getUint32(0, true);
        if (magic !== BINARY_MAGIC) {
            throw new Error(`Invalid magic bytes: expected 0x${BINARY_MAGIC.toString(16)}, got 0x${magic.toString(16)}`);
        }

        const version = view.getUint8(4);
        if (version !== BINARY_PROTOCOL_VERSION) {
            throw new Error(`Unsupported protocol version: expected ${BINARY_PROTOCOL_VERSION}, got ${version}`);
        }

        const frameType = view.getUint8(5);
        const tick = view.getUint32(8, true);
        const count = view.getUint32(12, true);

        const expectedLength = HEADER_SIZE_BYTES + count * RECORD_SIZE_BYTES;
        if (buffer.byteLength < expectedLength) {
            throw new Error(`Truncated buffer: expected ${expectedLength} bytes for ${count} entities, got ${buffer.byteLength}`);
        }

        const records = new Array(count);
        let offset = HEADER_SIZE_BYTES;

        for (let i = 0; i < count; i++) {
            const entityId = view.getUint32(offset, true);
            const fear = uint16ToFloat(view.getUint16(offset + 4, true));
            const anger = uint16ToFloat(view.getUint16(offset + 6, true));
            const dominance = uint16ToFloat(view.getUint16(offset + 8, true));
            const urgency = uint16ToFloat(view.getUint16(offset + 10, true));

            const intentCode = view.getUint8(offset + 12);
            const postureCode = view.getUint8(offset + 13);
            const bandCode = view.getUint8(offset + 14);
            const flags = view.getUint8(offset + 15);

            const vx = Number(view.getFloat32(offset + 16, true).toFixed(4));
            const vy = Number(view.getFloat32(offset + 20, true).toFixed(4));
            const vz = Number(view.getFloat32(offset + 24, true).toFixed(4));

            records[i] = {
                entityId,
                fear,
                anger,
                dominance,
                urgency,
                intentType: INTENT_CODE_TO_NAME[intentCode] || 'UNKNOWN',
                suggestedPosture: POSTURE_CODE_TO_NAME[postureCode] || 'UNKNOWN',
                band: BAND_CODE_TO_NAME[bandCode] || 'UNKNOWN',
                isPanicking: (flags & 0x01) !== 0,
                inCombat: (flags & 0x02) !== 0,
                exhausted: (flags & 0x04) !== 0,
                vectorHint: { x: vx, y: vy, z: vz }
            };

            offset += RECORD_SIZE_BYTES;
        }

        return {
            tick,
            frameType,
            count,
            records
        };
    }

    /**
     * Create a zero-copy direct view reader wrapping an ArrayBuffer.
     * Allocates zero intermediary objects when reading entity records.
     * @param {ArrayBuffer} buffer
     * @returns {BinaryFrameReader}
     */
    static createReader(buffer) {
        return new BinaryFrameReader(buffer);
    }
}

/**
 * Zero-copy reader providing O(1) field access without allocating JavaScript objects.
 */
export class BinaryFrameReader {
    /**
     * @param {ArrayBuffer} buffer
     */
    constructor(buffer) {
        if (!buffer || buffer.byteLength < HEADER_SIZE_BYTES) {
            throw new Error(`Buffer smaller than header size`);
        }
        this.buffer = buffer;
        this.view = new DataView(buffer);

        const magic = this.view.getUint32(0, true);
        if (magic !== BINARY_MAGIC) {
            throw new Error('Invalid magic bytes');
        }

        this.version = this.view.getUint8(4);
        this.frameType = this.view.getUint8(5);
        this.tick = this.view.getUint32(8, true);
        this.count = this.view.getUint32(12, true);
    }

    /**
     * Calculate byte offset for an entity index.
     * @param {number} index
     * @returns {number}
     * @private
     */
    _offset(index) {
        if (index < 0 || index >= this.count) {
            throw new RangeError(`Entity index ${index} out of bounds (count: ${this.count})`);
        }
        return HEADER_SIZE_BYTES + index * RECORD_SIZE_BYTES;
    }

    getEntityId(index) {
        return this.view.getUint32(this._offset(index), true);
    }

    getFear(index) {
        return uint16ToFloat(this.view.getUint16(this._offset(index) + 4, true));
    }

    getAnger(index) {
        return uint16ToFloat(this.view.getUint16(this._offset(index) + 6, true));
    }

    getDominance(index) {
        return uint16ToFloat(this.view.getUint16(this._offset(index) + 8, true));
    }

    getUrgency(index) {
        return uint16ToFloat(this.view.getUint16(this._offset(index) + 10, true));
    }

    getIntentCode(index) {
        return this.view.getUint8(this._offset(index) + 12);
    }

    getIntentName(index) {
        return INTENT_CODE_TO_NAME[this.getIntentCode(index)] || 'UNKNOWN';
    }

    getPostureCode(index) {
        return this.view.getUint8(this._offset(index) + 13);
    }

    getPostureName(index) {
        return POSTURE_CODE_TO_NAME[this.getPostureCode(index)] || 'UNKNOWN';
    }

    getBandCode(index) {
        return this.view.getUint8(this._offset(index) + 14);
    }

    getBandName(index) {
        return BAND_CODE_TO_NAME[this.getBandCode(index)] || 'UNKNOWN';
    }

    isPanicking(index) {
        return (this.view.getUint8(this._offset(index) + 15) & 0x01) !== 0;
    }

    /**
     * Read vector components into an existing target object without allocating.
     * @param {number} index
     * @param {object} outVec { x: number, y: number, z: number }
     */
    readVector(index, outVec) {
        const offset = this._offset(index);
        outVec.x = this.view.getFloat32(offset + 16, true);
        outVec.y = this.view.getFloat32(offset + 20, true);
        outVec.z = this.view.getFloat32(offset + 24, true);
    }
}
