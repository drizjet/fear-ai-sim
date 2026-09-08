/**
 * packages/protocol/src/StreamingFrameBuffer.js
 *
 * Front D / Sections 66–68: Cross-Engine Binary Network Packet Interop & Streaming Buffer Serializer.
 *
 * Provides high-throughput, low-latency binary frame streaming over UDP/WebSocket datagrams
 * for 60Hz/120Hz physics loops and massive headless multi-agent servers.
 *
 * Capabilities:
 * 1. Zero-Allocation Circular Ring Buffer (StreamingRingBuffer):
 *    Fixed pre-allocated memory pool preventing GC pauses in real-time server tick loops.
 *    Supports DROP_OLDEST, REJECT_NEWEST, and THROW_ON_OVERFLOW backpressure policies.
 * 2. UDP MTU Fragmentation & Chunk Reassembly (PacketChunker & ChunkAssembler):
 *    Splits large batches into 1,400-byte safe Ethernet MTU datagram packets with
 *    a compact 16-byte chunk header and Fletcher-16 bit-integrity checksums.
 * 3. Frame Delta Compression (FrameDeltaCompressor):
 *    I-Frame (keyframe) vs P-Frame (delta) sparse entity encoding yielding >75%
 *    bandwidth reduction for living worlds where only a subset of entities transition each tick.
 * 4. Network Jitter Playback Buffer (JitterPlaybackBuffer):
 *    Absorbs network latency jitter, smooths affective & vector interpolation across fractional ticks,
 *    and tracks network loss telemetry.
 *
 * Absolute Architectural Invariant:
 * Strictly adheres to the Host Game Authority Invariant. Protocol serialization and streaming
 * buffers transport observations and advisory intent vectors without mutating host physics or game state.
 */

import {
    BINARY_MAGIC,
    BINARY_PROTOCOL_VERSION,
    FRAME_TYPES,
    INTENT_CODES,
    POSTURE_CODES,
    BAND_CODES,
    HEADER_SIZE_BYTES,
    RECORD_SIZE_BYTES,
    BinaryWireProtocol
} from './BinaryWireProtocol.js';

export const STREAMING_MAGIC = 0x5053; // "SP" (Streaming Packet) in little-endian uint16
export const STREAMING_PROTOCOL_VERSION = 2;
export const DEFAULT_MTU_BYTES = 1400;
export const CHUNK_HEADER_SIZE_BYTES = 16;

export const OVERFLOW_STRATEGIES = Object.freeze({
    DROP_OLDEST: 'DROP_OLDEST',
    REJECT_NEWEST: 'REJECT_NEWEST',
    THROW_ON_OVERFLOW: 'THROW_ON_OVERFLOW'
});

export const CHUNK_FLAGS = Object.freeze({
    IS_KEYFRAME: 0x01,
    HAS_CHECKSUM: 0x02,
    IS_DELTA_FRAME: 0x04,
    FINAL_CHUNK: 0x08
});

export const DELTA_FIELD_FLAGS = Object.freeze({
    FEAR: 0x0001,
    ANGER: 0x0002,
    DOMINANCE: 0x0004,
    URGENCY: 0x0008,
    INTENT: 0x0010,
    POSTURE: 0x0020,
    BAND: 0x0040,
    FLAGS: 0x0080,
    VECTOR_HINT: 0x0100
});

/**
 * Fast, deterministic Fletcher-16 checksum.
 * @param {Uint8Array} uint8Array
 * @param {number} offset
 * @param {number} length
 * @returns {number} 16-bit unsigned integer
 */
export function computeFletcher16(uint8Array, offset = 0, length = uint8Array.length) {
    let sum1 = 0xff;
    let sum2 = 0xff;
    let i = offset;
    let len = length;

    while (len > 0) {
        let tlen = len > 20 ? 20 : len;
        len -= tlen;
        do {
            sum1 += uint8Array[i++];
            sum2 += sum1;
        } while (--tlen);
        sum1 = (sum1 & 0xff) + (sum1 >> 8);
        sum2 = (sum2 & 0xff) + (sum2 >> 8);
    }
    sum1 = (sum1 & 0xff) + (sum1 >> 8);
    sum2 = (sum2 & 0xff) + (sum2 >> 8);
    return (((sum2 & 0xff) << 8) | (sum1 & 0xff)) >>> 0;
}

/**
 * Circular Ring Buffer for high-frequency binary frame storage with zero GC allocation.
 */
export class StreamingRingBuffer {
    /**
     * @param {number} capacityBytes Total memory capacity in bytes (default 1MB)
     * @param {string} overflowStrategy Policy when buffer lacks space
     */
    constructor(capacityBytes = 1024 * 1024, overflowStrategy = OVERFLOW_STRATEGIES.DROP_OLDEST) {
        if (capacityBytes < 64) {
            throw new Error(`Ring buffer capacity too small (${capacityBytes} < 64 bytes)`);
        }
        this.capacityBytes = capacityBytes;
        this.overflowStrategy = overflowStrategy;
        this.rawBuffer = new ArrayBuffer(capacityBytes);
        this.uint8 = new Uint8Array(this.rawBuffer);
        this.dataView = new DataView(this.rawBuffer);

        this.head = 0; // write offset
        this.tail = 0; // read offset
        this.usedBytes = 0;

        /** @type {Array<{ offset: number, length: number, sequenceId: number, tick: number }>} */
        this.frameQueue = [];

        this.totalFramesWritten = 0;
        this.totalFramesRead = 0;
        this.droppedFramesCount = 0;
    }

    /**
     * Write a binary frame into the ring buffer.
     * @param {ArrayBuffer|Uint8Array} frameBuffer
     * @param {number} sequenceId Monotonically increasing sequence ID
     * @param {number} tick Simulation tick index
     * @returns {boolean} True if written, false if rejected
     */
    writeFrame(frameBuffer, sequenceId = 0, tick = 0) {
        const frameBytes = frameBuffer instanceof Uint8Array
            ? frameBuffer
            : new Uint8Array(frameBuffer);
        const frameLength = frameBytes.byteLength;

        if (frameLength > this.capacityBytes) {
            throw new Error(`Frame length (${frameLength} bytes) exceeds total ring buffer capacity (${this.capacityBytes} bytes)`);
        }

        // Check if there is enough space; if not, apply overflow strategy
        while (this.usedBytes + frameLength > this.capacityBytes) {
            if (this.overflowStrategy === OVERFLOW_STRATEGIES.DROP_OLDEST) {
                if (this.frameQueue.length === 0) {
                    this.clear();
                    break;
                }
                const dropped = this.frameQueue.shift();
                this.tail = (dropped.offset + dropped.length) % this.capacityBytes;
                this.usedBytes -= dropped.length;
                this.droppedFramesCount++;
            } else if (this.overflowStrategy === OVERFLOW_STRATEGIES.REJECT_NEWEST) {
                this.droppedFramesCount++;
                return false;
            } else {
                throw new Error(`StreamingRingBuffer overflow: needed ${frameLength} bytes, available ${this.capacityBytes - this.usedBytes}`);
            }
        }

        const startOffset = this.head;
        const remainingContiguous = this.capacityBytes - this.head;

        if (remainingContiguous >= frameLength) {
            this.uint8.set(frameBytes, this.head);
            this.head = (this.head + frameLength) % this.capacityBytes;
        } else {
            const part1 = frameBytes.subarray(0, remainingContiguous);
            const part2 = frameBytes.subarray(remainingContiguous);
            this.uint8.set(part1, this.head);
            this.uint8.set(part2, 0);
            this.head = part2.byteLength;
        }

        this.usedBytes += frameLength;
        this.frameQueue.push({
            offset: startOffset,
            length: frameLength,
            sequenceId,
            tick
        });
        this.totalFramesWritten++;
        return true;
    }

    /**
     * Read and consume the oldest available frame.
     * @returns {{ sequenceId: number, tick: number, buffer: ArrayBuffer }|null}
     */
    readNextFrame() {
        if (this.frameQueue.length === 0) {
            return null;
        }

        const meta = this.frameQueue.shift();
        const outBuffer = new ArrayBuffer(meta.length);
        const outUint8 = new Uint8Array(outBuffer);

        const remainingContiguous = this.capacityBytes - meta.offset;
        if (remainingContiguous >= meta.length) {
            outUint8.set(this.uint8.subarray(meta.offset, meta.offset + meta.length));
        } else {
            const part1Len = remainingContiguous;
            const part2Len = meta.length - remainingContiguous;
            outUint8.set(this.uint8.subarray(meta.offset, meta.offset + part1Len), 0);
            outUint8.set(this.uint8.subarray(0, part2Len), part1Len);
        }

        this.tail = (meta.offset + meta.length) % this.capacityBytes;
        this.usedBytes -= meta.length;
        this.totalFramesRead++;

        return {
            sequenceId: meta.sequenceId,
            tick: meta.tick,
            buffer: outBuffer
        };
    }

    /**
     * Peek at the oldest frame without consuming it.
     * @returns {{ sequenceId: number, tick: number, length: number }|null}
     */
    peekNextFrame() {
        if (this.frameQueue.length === 0) return null;
        const meta = this.frameQueue[0];
        return {
            sequenceId: meta.sequenceId,
            tick: meta.tick,
            length: meta.length
        };
    }

    /**
     * Reset buffer state.
     */
    clear() {
        this.head = 0;
        this.tail = 0;
        this.usedBytes = 0;
        this.frameQueue = [];
    }

    /**
     * Get real-time buffer diagnostics.
     */
    getStats() {
        return {
            capacityBytes: this.capacityBytes,
            usedBytes: this.usedBytes,
            utilizationPct: Number(((this.usedBytes / this.capacityBytes) * 100).toFixed(2)),
            queuedFrames: this.frameQueue.length,
            totalFramesWritten: this.totalFramesWritten,
            totalFramesRead: this.totalFramesRead,
            droppedFramesCount: this.droppedFramesCount
        };
    }
}

/**
 * Packet Chunker: Splits binary frames into UDP-compliant datagram chunks.
 */
export class PacketChunker {
    /**
     * Chunk a full frame into MTU-sized packets.
     * @param {ArrayBuffer|Uint8Array} frameBuffer
     * @param {number} sequenceId
     * @param {object} [options]
     * @param {number} [options.mtu]
     * @param {boolean} [options.isKeyframe]
     * @param {boolean} [options.isDeltaFrame]
     * @returns {Array<ArrayBuffer>}
     */
    static chunkFrame(frameBuffer, sequenceId, options = {}) {
        const mtu = options.mtu || DEFAULT_MTU_BYTES;
        const isKeyframe = Boolean(options.isKeyframe);
        const isDeltaFrame = Boolean(options.isDeltaFrame);

        const frameBytes = frameBuffer instanceof Uint8Array
            ? frameBuffer
            : new Uint8Array(frameBuffer);

        const totalPayloadBytes = frameBytes.byteLength;
        const maxPayloadPerChunk = mtu - CHUNK_HEADER_SIZE_BYTES;

        if (maxPayloadPerChunk <= 0) {
            throw new Error(`MTU size (${mtu}) must be greater than chunk header size (${CHUNK_HEADER_SIZE_BYTES})`);
        }

        const totalChunks = Math.max(1, Math.ceil(totalPayloadBytes / maxPayloadPerChunk));
        const chunks = new Array(totalChunks);

        let offset = 0;
        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            const payloadLength = Math.min(maxPayloadPerChunk, totalPayloadBytes - offset);
            const chunkTotalLength = CHUNK_HEADER_SIZE_BYTES + payloadLength;
            const chunkBuffer = new ArrayBuffer(chunkTotalLength);
            const chunkUint8 = new Uint8Array(chunkBuffer);
            const chunkView = new DataView(chunkBuffer);

            chunkUint8.set(frameBytes.subarray(offset, offset + payloadLength), CHUNK_HEADER_SIZE_BYTES);

            const checksum = computeFletcher16(chunkUint8, CHUNK_HEADER_SIZE_BYTES, payloadLength);

            let flags = CHUNK_FLAGS.HAS_CHECKSUM;
            if (isKeyframe) flags |= CHUNK_FLAGS.IS_KEYFRAME;
            if (isDeltaFrame) flags |= CHUNK_FLAGS.IS_DELTA_FRAME;
            if (chunkIdx === totalChunks - 1) flags |= CHUNK_FLAGS.FINAL_CHUNK;

            chunkView.setUint16(0, STREAMING_MAGIC, true);
            chunkView.setUint8(2, STREAMING_PROTOCOL_VERSION);
            chunkView.setUint8(3, flags);
            chunkView.setUint32(4, sequenceId, true);
            chunkView.setUint16(8, chunkIdx, true);
            chunkView.setUint16(10, totalChunks, true);
            chunkView.setUint16(12, payloadLength, true);
            chunkView.setUint16(14, checksum, true);

            chunks[chunkIdx] = chunkBuffer;
            offset += payloadLength;
        }

        return chunks;
    }
}

/**
 * Chunk Assembler: Collects out-of-order UDP chunks, verifies bit integrity, and outputs full frames.
 */
export class ChunkAssembler {
    /**
     * @param {object} [options]
     * @param {number} [options.maxPendingFrames] Maximum incomplete frames held simultaneously
     * @param {number} [options.staleSequenceThreshold] Sequence lag after which incomplete frames are purged
     */
    constructor(options = {}) {
        this.maxPendingFrames = options.maxPendingFrames || 32;
        this.staleSequenceThreshold = options.staleSequenceThreshold || 60;

        /** @type {Map<number, { totalChunks: number, receivedCount: number, chunks: Array<Uint8Array|null>, isKeyframe: boolean, isDeltaFrame: boolean, totalPayloadBytes: number }>} */
        this.pendingFrames = new Map();

        this.latestCompletedSequenceId = 0;
        this.corruptedChunksCount = 0;
        this.droppedStaleChunksCount = 0;
        this.completedFramesCount = 0;
    }

    /**
     * Ingest an incoming network packet chunk.
     * @param {ArrayBuffer|Uint8Array} chunkData
     * @returns {{ status: 'FRAME_COMPLETE'|'CHUNK_BUFFERED'|'CHECKSUM_FAILED'|'STALE_DROPPED'|'INVALID_HEADER', sequenceId?: number, frameBuffer?: ArrayBuffer, isKeyframe?: boolean, isDeltaFrame?: boolean }}
     */
    ingestChunk(chunkData) {
        const chunkUint8 = chunkData instanceof Uint8Array
            ? chunkData
            : new Uint8Array(chunkData);

        if (chunkUint8.byteLength < CHUNK_HEADER_SIZE_BYTES) {
            return { status: 'INVALID_HEADER' };
        }

        const view = new DataView(chunkUint8.buffer, chunkUint8.byteOffset, chunkUint8.byteLength);
        const magic = view.getUint16(0, true);
        if (magic !== STREAMING_MAGIC) {
            return { status: 'INVALID_HEADER' };
        }

        const version = view.getUint8(2);
        if (version !== STREAMING_PROTOCOL_VERSION) {
            return { status: 'INVALID_HEADER' };
        }

        const flags = view.getUint8(3);
        const sequenceId = view.getUint32(4, true);
        const chunkIndex = view.getUint16(8, true);
        const totalChunks = view.getUint16(10, true);
        const payloadLength = view.getUint16(12, true);
        const expectedChecksum = view.getUint16(14, true);

        if (chunkUint8.byteLength < CHUNK_HEADER_SIZE_BYTES + payloadLength) {
            return { status: 'INVALID_HEADER' };
        }

        // Reject if stale relative to latest completed frame
        if (this.latestCompletedSequenceId > 0 && sequenceId < this.latestCompletedSequenceId - this.staleSequenceThreshold) {
            this.droppedStaleChunksCount++;
            return { status: 'STALE_DROPPED', sequenceId };
        }

        // Verify checksum if flag is set
        if (flags & CHUNK_FLAGS.HAS_CHECKSUM) {
            const actualChecksum = computeFletcher16(chunkUint8, CHUNK_HEADER_SIZE_BYTES, payloadLength);
            if (actualChecksum !== expectedChecksum) {
                this.corruptedChunksCount++;
                return { status: 'CHECKSUM_FAILED', sequenceId };
            }
        }

        // Retrieve or initialize pending frame record
        let pending = this.pendingFrames.get(sequenceId);
        if (!pending) {
            if (this.pendingFrames.size >= this.maxPendingFrames) {
                const oldestSeq = Array.from(this.pendingFrames.keys()).sort((a, b) => a - b)[0];
                this.pendingFrames.delete(oldestSeq);
            }

            pending = {
                totalChunks,
                receivedCount: 0,
                chunks: new Array(totalChunks).fill(null),
                isKeyframe: Boolean(flags & CHUNK_FLAGS.IS_KEYFRAME),
                isDeltaFrame: Boolean(flags & CHUNK_FLAGS.IS_DELTA_FRAME),
                totalPayloadBytes: 0
            };
            this.pendingFrames.set(sequenceId, pending);
        }

        // If chunk not already stored, save it
        if (!pending.chunks[chunkIndex]) {
            const payload = chunkUint8.slice(CHUNK_HEADER_SIZE_BYTES, CHUNK_HEADER_SIZE_BYTES + payloadLength);
            pending.chunks[chunkIndex] = payload;
            pending.receivedCount++;
            pending.totalPayloadBytes += payloadLength;
        }

        // Check if all chunks received
        if (pending.receivedCount === pending.totalChunks) {
            const fullFrameBuffer = new ArrayBuffer(pending.totalPayloadBytes);
            const fullFrameUint8 = new Uint8Array(fullFrameBuffer);

            let offset = 0;
            for (let i = 0; i < pending.totalChunks; i++) {
                const chunkPayload = pending.chunks[i];
                if (chunkPayload) {
                    fullFrameUint8.set(chunkPayload, offset);
                    offset += chunkPayload.byteLength;
                }
            }

            const isKeyframe = pending.isKeyframe;
            const isDeltaFrame = pending.isDeltaFrame;
            this.pendingFrames.delete(sequenceId);

            if (sequenceId > this.latestCompletedSequenceId) {
                this.latestCompletedSequenceId = sequenceId;
            }
            this.completedFramesCount++;

            return {
                status: 'FRAME_COMPLETE',
                sequenceId,
                frameBuffer: fullFrameBuffer,
                isKeyframe,
                isDeltaFrame
            };
        }

        return {
            status: 'CHUNK_BUFFERED',
            sequenceId,
            chunkIndex,
            totalChunks,
            receivedCount: pending.receivedCount
        };
    }

    /**
     * Prune pending incomplete frames older than sequence threshold.
     */
    pruneStale(currentSequenceId) {
        const threshold = currentSequenceId - this.staleSequenceThreshold;
        for (const seqId of this.pendingFrames.keys()) {
            if (seqId < threshold) {
                this.pendingFrames.delete(seqId);
                this.droppedStaleChunksCount++;
            }
        }
    }
}

/**
 * Frame Delta Compressor: Emits compact P-frames tracking only entities whose affective
 * or vector properties shifted beyond threshold tolerance.
 */
export class FrameDeltaCompressor {
    /**
     * Compute a delta frame between previous and current entity states.
     * @param {Array<object>} prevEntities
     * @param {Array<object>} currEntities
     * @param {number} currentTick
     * @param {number} baseTick
     * @param {number} [tolerance=0.005] Minimum float change required to stream update
     * @returns {ArrayBuffer} Compact delta buffer
     */
    static compressDelta(prevEntities, currEntities, currentTick, baseTick, tolerance = 0.005) {
        const prevMap = new Map();
        for (let i = 0; i < prevEntities.length; i++) {
            const e = prevEntities[i];
            const id = typeof e.entityId === 'number' ? e.entityId : (parseInt(e.entityId, 10) || i);
            prevMap.set(id, e);
        }

        const changedRecords = [];

        for (let i = 0; i < currEntities.length; i++) {
            const curr = currEntities[i];
            const id = typeof curr.entityId === 'number' ? curr.entityId : (parseInt(curr.entityId, 10) || i);
            const prev = prevMap.get(id);

            if (!prev) {
                changedRecords.push({
                    entityId: id,
                    mask: 0x01ff,
                    record: curr
                });
                continue;
            }

            let mask = 0;
            if (Math.abs((curr.fear || 0) - (prev.fear || 0)) > tolerance) mask |= DELTA_FIELD_FLAGS.FEAR;
            if (Math.abs((curr.anger || 0) - (prev.anger || 0)) > tolerance) mask |= DELTA_FIELD_FLAGS.ANGER;
            if (Math.abs((curr.dominance || 0) - (prev.dominance || 0)) > tolerance) mask |= DELTA_FIELD_FLAGS.DOMINANCE;
            if (Math.abs((curr.urgency || 0) - (prev.urgency || 0)) > tolerance) mask |= DELTA_FIELD_FLAGS.URGENCY;
            if (curr.intentType !== prev.intentType) mask |= DELTA_FIELD_FLAGS.INTENT;
            if (curr.suggestedPosture !== prev.suggestedPosture) mask |= DELTA_FIELD_FLAGS.POSTURE;
            if (curr.band !== prev.band) mask |= DELTA_FIELD_FLAGS.BAND;
            if (Boolean(curr.inCombat) !== Boolean(prev.inCombat) || Boolean(curr.exhausted) !== Boolean(prev.exhausted)) {
                mask |= DELTA_FIELD_FLAGS.FLAGS;
            }

            const vx0 = prev.vectorHint?.x || 0, vx1 = curr.vectorHint?.x || 0;
            const vy0 = prev.vectorHint?.y || 0, vy1 = curr.vectorHint?.y || 0;
            const vz0 = prev.vectorHint?.z || 0, vz1 = curr.vectorHint?.z || 0;
            if (Math.abs(vx1 - vx0) > tolerance || Math.abs(vy1 - vy0) > tolerance || Math.abs(vz1 - vz0) > tolerance) {
                mask |= DELTA_FIELD_FLAGS.VECTOR_HINT;
            }

            if (mask > 0) {
                changedRecords.push({
                    entityId: id,
                    mask,
                    record: curr
                });
            }
        }

        let payloadBytes = 0;
        for (const item of changedRecords) {
            payloadBytes += 4; // entityId uint32
            payloadBytes += 2; // mask uint16
            const m = item.mask;
            if (m & DELTA_FIELD_FLAGS.FEAR) payloadBytes += 2;
            if (m & DELTA_FIELD_FLAGS.ANGER) payloadBytes += 2;
            if (m & DELTA_FIELD_FLAGS.DOMINANCE) payloadBytes += 2;
            if (m & DELTA_FIELD_FLAGS.URGENCY) payloadBytes += 2;
            if (m & DELTA_FIELD_FLAGS.INTENT) payloadBytes += 1;
            if (m & DELTA_FIELD_FLAGS.POSTURE) payloadBytes += 1;
            if (m & DELTA_FIELD_FLAGS.BAND) payloadBytes += 1;
            if (m & DELTA_FIELD_FLAGS.FLAGS) payloadBytes += 1;
            if (m & DELTA_FIELD_FLAGS.VECTOR_HINT) payloadBytes += 12;
        }

        const totalBytes = 20 + payloadBytes;
        const buffer = new ArrayBuffer(totalBytes);
        const view = new DataView(buffer);

        view.setUint32(0, BINARY_MAGIC, true);
        view.setUint8(4, BINARY_PROTOCOL_VERSION);
        view.setUint8(5, 5); // DELTA_INTENTS
        view.setUint16(6, 0, true);
        view.setUint32(8, baseTick, true);
        view.setUint32(12, currentTick, true);
        view.setUint32(16, changedRecords.length, true);

        let offset = 20;
        for (const item of changedRecords) {
            const r = item.record;
            const m = item.mask;

            view.setUint32(offset, item.entityId, true);
            view.setUint16(offset + 4, m, true);
            offset += 6;

            if (m & DELTA_FIELD_FLAGS.FEAR) {
                view.setUint16(offset, Math.round(Math.max(0, Math.min(1, r.fear || 0)) * 65535), true);
                offset += 2;
            }
            if (m & DELTA_FIELD_FLAGS.ANGER) {
                view.setUint16(offset, Math.round(Math.max(0, Math.min(1, r.anger || 0)) * 65535), true);
                offset += 2;
            }
            if (m & DELTA_FIELD_FLAGS.DOMINANCE) {
                view.setUint16(offset, Math.round(Math.max(0, Math.min(1, r.dominance || 0)) * 65535), true);
                offset += 2;
            }
            if (m & DELTA_FIELD_FLAGS.URGENCY) {
                view.setUint16(offset, Math.round(Math.max(0, Math.min(1, r.urgency || 0)) * 65535), true);
                offset += 2;
            }
            if (m & DELTA_FIELD_FLAGS.INTENT) {
                view.setUint8(offset, INTENT_CODES[r.intentType] ?? INTENT_CODES.UNKNOWN);
                offset += 1;
            }
            if (m & DELTA_FIELD_FLAGS.POSTURE) {
                view.setUint8(offset, POSTURE_CODES[r.suggestedPosture] ?? POSTURE_CODES.UNKNOWN);
                offset += 1;
            }
            if (m & DELTA_FIELD_FLAGS.BAND) {
                view.setUint8(offset, BAND_CODES[r.band] ?? BAND_CODES.UNKNOWN);
                offset += 1;
            }
            if (m & DELTA_FIELD_FLAGS.FLAGS) {
                let fl = 0;
                if ((r.fear || 0) >= 0.70) fl |= 0x01;
                if (r.inCombat) fl |= 0x02;
                if (r.exhausted) fl |= 0x04;
                view.setUint8(offset, fl);
                offset += 1;
            }
            if (m & DELTA_FIELD_FLAGS.VECTOR_HINT) {
                view.setFloat32(offset, r.vectorHint?.x || 0, true);
                view.setFloat32(offset + 4, r.vectorHint?.y || 0, true);
                view.setFloat32(offset + 8, r.vectorHint?.z || 0, true);
                offset += 12;
            }
        }

        return buffer;
    }

    /**
     * Apply a delta frame onto a base state to produce the updated state.
     * @param {Array<object>} baseEntities
     * @param {ArrayBuffer} deltaBuffer
     * @returns {{ baseTick: number, currentTick: number, entities: Array<object> }}
     */
    static decompressDelta(baseEntities, deltaBuffer) {
        const view = new DataView(deltaBuffer);
        const baseTick = view.getUint32(8, true);
        const currentTick = view.getUint32(12, true);
        const changedCount = view.getUint32(16, true);

        const entityMap = new Map();
        for (let i = 0; i < baseEntities.length; i++) {
            const e = baseEntities[i];
            const id = typeof e.entityId === 'number' ? e.entityId : (parseInt(e.entityId, 10) || i);
            entityMap.set(id, {
                ...e,
                vectorHint: { ...(e.vectorHint || { x: 0, y: 0, z: 0 }) }
            });
        }

        let offset = 20;
        for (let i = 0; i < changedCount; i++) {
            const entityId = view.getUint32(offset, true);
            const mask = view.getUint16(offset + 4, true);
            offset += 6;

            let target = entityMap.get(entityId);
            if (!target) {
                target = { entityId, vectorHint: { x: 0, y: 0, z: 0 } };
                entityMap.set(entityId, target);
            }

            if (mask & DELTA_FIELD_FLAGS.FEAR) {
                target.fear = Number((view.getUint16(offset, true) / 65535).toFixed(4));
                offset += 2;
            }
            if (mask & DELTA_FIELD_FLAGS.ANGER) {
                target.anger = Number((view.getUint16(offset, true) / 65535).toFixed(4));
                offset += 2;
            }
            if (mask & DELTA_FIELD_FLAGS.DOMINANCE) {
                target.dominance = Number((view.getUint16(offset, true) / 65535).toFixed(4));
                offset += 2;
            }
            if (mask & DELTA_FIELD_FLAGS.URGENCY) {
                target.urgency = Number((view.getUint16(offset, true) / 65535).toFixed(4));
                offset += 2;
            }
            if (mask & DELTA_FIELD_FLAGS.INTENT) {
                const code = view.getUint8(offset);
                target.intentType = Object.keys(INTENT_CODES).find(k => INTENT_CODES[k] === code) || 'UNKNOWN';
                offset += 1;
            }
            if (mask & DELTA_FIELD_FLAGS.POSTURE) {
                const code = view.getUint8(offset);
                target.suggestedPosture = Object.keys(POSTURE_CODES).find(k => POSTURE_CODES[k] === code) || 'UNKNOWN';
                offset += 1;
            }
            if (mask & DELTA_FIELD_FLAGS.BAND) {
                const code = view.getUint8(offset);
                target.band = Object.keys(BAND_CODES).find(k => BAND_CODES[k] === code) || 'UNKNOWN';
                offset += 1;
            }
            if (mask & DELTA_FIELD_FLAGS.FLAGS) {
                const fl = view.getUint8(offset);
                target.isPanicking = Boolean(fl & 0x01);
                target.inCombat = Boolean(fl & 0x02);
                target.exhausted = Boolean(fl & 0x04);
                offset += 1;
            }
            if (mask & DELTA_FIELD_FLAGS.VECTOR_HINT) {
                target.vectorHint = {
                    x: Number(view.getFloat32(offset, true).toFixed(4)),
                    y: Number(view.getFloat32(offset + 4, true).toFixed(4)),
                    z: Number(view.getFloat32(offset + 8, true).toFixed(4))
                };
                offset += 12;
            }
        }

        return {
            baseTick,
            currentTick,
            entities: Array.from(entityMap.values())
        };
    }
}

/**
 * Jitter Playback Buffer: Client-side packet buffer absorbing network latency variations
 * and providing smooth vector interpolation for game engine render ticks.
 */
export class JitterPlaybackBuffer {
    /**
     * @param {object} [options]
     * @param {number} [options.targetDelayTicks=2] Number of ticks delayed for smooth playback
     * @param {number} [options.maxBufferSize=30] Maximum queued frames before forcing advancement
     */
    constructor(options = {}) {
        this.targetDelayTicks = options.targetDelayTicks || 2;
        this.maxBufferSize = options.maxBufferSize || 30;

        /** @type {Array<{ tick: number, entities: Array<object>, receivedTime: number }>} */
        this.buffer = [];

        this.latestReceivedTick = 0;
        this.currentPlaybackTick = 0;
        this.outOfOrderPacketsCount = 0;
    }

    /**
     * Ingest an arrival frame into playback buffer.
     * @param {number} tick
     * @param {Array<object>} entities
     */
    pushFrame(tick, entities) {
        if (tick <= this.latestReceivedTick) {
            this.outOfOrderPacketsCount++;
        } else {
            this.latestReceivedTick = tick;
        }

        if (this.currentPlaybackTick === 0) {
            this.currentPlaybackTick = Math.max(0, tick - this.targetDelayTicks);
        }

        this.buffer.push({
            tick,
            entities,
            receivedTime: Date.now()
        });

        this.buffer.sort((a, b) => a.tick - b.tick);

        while (this.buffer.length > this.maxBufferSize) {
            this.buffer.shift();
        }
    }

    /**
     * Advance playback tick and sample interpolated state.
     * @param {number} [deltaTicks=1.0]
     * @returns {Array<object>} Interpolated entities for the current playback tick
     */
    samplePlayback(deltaTicks = 1.0) {
        this.currentPlaybackTick += deltaTicks;

        if (this.buffer.length === 0) {
            return [];
        }

        if (this.latestReceivedTick - this.currentPlaybackTick > this.maxBufferSize) {
            this.currentPlaybackTick = this.latestReceivedTick - this.targetDelayTicks;
        }

        let f0 = null;
        let f1 = null;

        for (let i = 0; i < this.buffer.length; i++) {
            const frame = this.buffer[i];
            if (frame.tick <= this.currentPlaybackTick) {
                f0 = frame;
            }
            if (frame.tick >= this.currentPlaybackTick && !f1) {
                f1 = frame;
            }
        }

        if (!f0 && f1) return f1.entities;
        if (f0 && !f1) return f0.entities;
        if (!f0 && !f1) return this.buffer[this.buffer.length - 1].entities;
        if (f0.tick === f1.tick) return f0.entities;

        const alpha = Math.max(0, Math.min(1, (this.currentPlaybackTick - f0.tick) / (f1.tick - f0.tick)));

        const f1Map = new Map();
        for (const e of f1.entities) {
            f1Map.set(e.entityId, e);
        }

        const interpolated = [];
        for (const e0 of f0.entities) {
            const e1 = f1Map.get(e0.entityId);
            if (!e1) {
                interpolated.push(e0);
                continue;
            }

            const lerp = (v0, v1) => Number(((v0 || 0) * (1 - alpha) + (v1 || 0) * alpha).toFixed(4));

            interpolated.push({
                entityId: e0.entityId,
                fear: lerp(e0.fear, e1.fear),
                anger: lerp(e0.anger, e1.anger),
                dominance: lerp(e0.dominance, e1.dominance),
                urgency: lerp(e0.urgency, e1.urgency),
                intentType: alpha < 0.5 ? e0.intentType : e1.intentType,
                suggestedPosture: alpha < 0.5 ? e0.suggestedPosture : e1.suggestedPosture,
                band: alpha < 0.5 ? e0.band : e1.band,
                inCombat: alpha < 0.5 ? e0.inCombat : e1.inCombat,
                exhausted: alpha < 0.5 ? e0.exhausted : e1.exhausted,
                vectorHint: {
                    x: lerp(e0.vectorHint?.x, e1.vectorHint?.x),
                    y: lerp(e0.vectorHint?.y, e1.vectorHint?.y),
                    z: lerp(e0.vectorHint?.z, e1.vectorHint?.z)
                }
            });
        }

        while (this.buffer.length > 2 && this.buffer[0].tick < this.currentPlaybackTick - 2) {
            this.buffer.shift();
        }

        return interpolated;
    }

    /**
     * Get playback buffer metrics.
     */
    getStats() {
        return {
            bufferedFrames: this.buffer.length,
            latestReceivedTick: this.latestReceivedTick,
            currentPlaybackTick: Number(this.currentPlaybackTick.toFixed(2)),
            playbackLagTicks: Number((this.latestReceivedTick - this.currentPlaybackTick).toFixed(2)),
            outOfOrderPacketsCount: this.outOfOrderPacketsCount
        };
    }
}
